import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  INITIAL_TEAMS,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getGoalkeeperChangeStatus,
  getGoalkeeperPreparation,
  getGoalkeeperStintSeconds,
  getNextSubstitutionSeconds,
  getRecommendedSubstitutionCount,
  markUnavailable,
  movePlayer,
  queueSubstitutions,
  suggestSubstitutions,
  summarizePlayerPositions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { migrateStoredState } from "./storage";
import { u8RepeatKeeperRotation } from "./test/rotationFixtures";

const fixture = (
  benchAt = 300,
  at = 600,
  openingKeeper: "former" | "unused" | "undo" = "former",
) => {
  const team = structuredClone(INITIAL_TEAMS.u8);
  const [former, , , , replacement, current, unused] = team.roster;
  team.roster.forEach((player) => {
    player.preferredRoles = [former.id, current.id, unused.id].includes(
      player.id,
    )
      ? ["goalkeeper", "defender", "forward"]
      : ["defender", "forward"];
  });
  let game = createGame(
    team,
    "5-2-2",
    team.roster.map((player) => player.id),
    40,
    1_000,
    4,
  );
  game.assignments.fr = unused.id;
  game.benchIds = game.presentIds.filter(
    (id) => !Object.values(game.assignments).includes(id),
  );
  if (openingKeeper !== "former") {
    game = movePlayer(game, unused.id, "gk", 1_000);
    if (openingKeeper === "undo") game = undoLastEvent(game, 1_000);
  }
  game = fastForwardGame(game, 300, 1_000);
  if (openingKeeper === "unused")
    game = movePlayer(game, former.id, "gk", 1_500);
  game = applySubstitutions(
    game,
    [{ positionId: "gk", outPlayerId: former.id, inPlayerId: current.id }],
    5,
    1_000,
  );
  if (benchAt > 300) game = fastForwardGame(game, benchAt - 300, 1_000);
  game = applySubstitutions(
    game,
    [{ positionId: "fr", outPlayerId: unused.id, inPlayerId: replacement.id }],
    5,
    2_000,
  );
  game = fastForwardGame(game, at - benchAt, 2_000);
  game.period = {
    current: Math.floor(at / 600) + 1,
    startedAtSeconds: Math.floor(at / 600) * 600,
  };
  expect(validateGame(game, 5)).toEqual([]);
  return { team, game, former, current, unused };
};

describe("cumulative goalkeeper fairness", () => {
  it.each([false, true])(
    "prepares the next keeper during a short handoff without withholding replaceable cover (Ollie out=%s)",
    (removeOllie) => {
      const { game, team, interval } = u8RepeatKeeperRotation(40, {
        removeOllie,
        henryOutfieldFirst: true,
        turns: 4,
      });
      const before = structuredClone(game);
      const henry = team.roster.find((player) => player.name === "Henry")!;
      const ollie = team.roster.find((player) => player.name === "Ollie")!;
      const count = getRecommendedSubstitutionCount(game, team);
      expect(count).toBe(removeOllie ? 4 : 5);
      const pairs = suggestSubstitutions(game, count, team);
      expect(pairs.some((pair) => pair.inPlayerId === henry.id)).toBe(
        !removeOllie,
      );
      if (!removeOllie) {
        expect(pairs.some((pair) => pair.outPlayerId === ollie.id)).toBe(true);
      }
      expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
      const ready = fastForwardGame(game, interval, 10_000_000);
      const changed = applySubstitutions(ready, pairs, 5, 10_000_000);
      const nextAt = getNextSubstitutionSeconds(changed);
      const nextPairs = suggestSubstitutions(
        changed,
        getRecommendedSubstitutionCount(changed, team),
        team,
      );
      expect(
        nextPairs.find((pair) => pair.positionId === "gk")?.inPlayerId,
      ).toBe(removeOllie ? henry.id : ollie.id);
      expect(
        getGoalkeeperChangeStatus(changed, nextPairs, nextAt, team),
      ).toMatchObject({ early: false, needsRest: false });
      if (removeOllie) {
        const override = suggestSubstitutions(game, 5, team, {
          allowEarlyKeeperChange: true,
        });
        expect(override.some((pair) => pair.inPlayerId === henry.id)).toBe(
          true,
        );
        expect(validateSubstitutionPairs(game, override)).toEqual([]);
      }
      expect(game).toEqual(before);
    },
  );

  it("still selects a backup when the primary reserve is unavailable", () => {
    const { game, team, former, unused } = fixture();
    unused.preferredRoles = ["forward", "midfielder", "goalkeeper"];
    const updated = markUnavailable(game, former.id, 5, 3_000);
    expect(getGoalkeeperPreparation(updated, team).successorId).toBe(unused.id);
  });

  it.each([
    ["forward", "goalkeeper"],
    ["forward", "midfielder", "goalkeeper"],
    ["forward", "midfielder", "defender", "goalkeeper"],
  ] as const)(
    "prefers a primary keeper to an equally rested backup (%j)",
    (...roles) => {
      const { game, team, former, unused } = fixture();
      unused.preferredRoles = [...roles];
      expect(getGoalkeeperPreparation(game, team).successorId).toBe(former.id);
      const pairs = suggestSubstitutions(game, 5, team, {
        allowEarlyKeeperChange: true,
      });
      expect(pairs.find((pair) => pair.positionId === "gk")?.inPlayerId).toBe(
        former.id,
      );
      expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
    },
  );

  it.each([40, 48])(
    "shortens a repeat keeper turn on the normal cadence in a %i-minute game",
    (duration) => {
      const { game, team, interval } = u8RepeatKeeperRotation(duration);
      const before = structuredClone(game);
      const currentKeeper = team.roster.find(
        (player) => player.id === game.assignments.gk,
      )!;
      expect(currentKeeper.name).toBe("Maddox");
      expect(getGoalkeeperStintSeconds(game)).toBe(2 * interval);
      expect(getGoalkeeperPreparation(game, team)).toMatchObject({
        targetSeconds: interval,
        dueInSeconds: interval,
      });
      const pairs = suggestSubstitutions(
        game,
        getRecommendedSubstitutionCount(game, team),
        team,
      );
      const keeperPair = pairs.find((pair) => pair.positionId === "gk")!;
      expect(
        team.roster.find((player) => player.id === keeperPair.inPlayerId)?.name,
      ).toBe("Henry");
      expect(
        getGoalkeeperChangeStatus(game, pairs, game.clock.elapsedSeconds, team),
      ).toMatchObject({
        targetSeconds: interval,
        early: true,
        needsRest: true,
      });
      const nextAt = getNextSubstitutionSeconds(game);
      expect(nextAt).toBe(game.clock.elapsedSeconds + interval);
      expect(
        getGoalkeeperChangeStatus(game, pairs, nextAt, team),
      ).toMatchObject({
        targetSeconds: interval,
        early: false,
        needsRest: false,
      });
      const ready = fastForwardGame(game, interval, 10_000_000);
      expect(
        getGoalkeeperChangeStatus(ready, pairs, nextAt, team),
      ).toMatchObject({
        early: false,
        needsRest: false,
      });
      const changed = applySubstitutions(ready, pairs, 5, 10_000_000);
      expect(validateGame(changed, 5)).toEqual([]);
      expect(undoLastEvent(changed, 10_000_000).assignments).toEqual(
        ready.assignments,
      );
      expect(game).toEqual(before);
    },
  );

  it("reconstructs a shortened keeper target after reload and restores the prior target on undo", () => {
    const { state, game, team } = u8RepeatKeeperRotation();
    const restored = migrateStoredState(JSON.parse(JSON.stringify(state)));
    expect(
      getGoalkeeperPreparation(restored.activeGame!, restored.teams.u8),
    ).toEqual(getGoalkeeperPreparation(game, team));
    const undone = undoLastEvent(game, 10_000_000);
    expect(getGoalkeeperPreparation(undone, team).targetSeconds).toBe(600);
  });

  it("prefers the unused keeper when rest and total playing time are equal", () => {
    const { game, team, former, unused } = fixture();
    expect(game.totals[former.id].fieldSeconds).toBe(300);
    expect(game.totals[unused.id].fieldSeconds).toBe(300);
    const before = structuredClone(game);
    expect(getGoalkeeperPreparation(game, team).successorId).toBe(unused.id);
    expect(getGoalkeeperPreparation(game, team)).toEqual(
      getGoalkeeperPreparation(game, team),
    );
    expect(game).toEqual(before);
  });

  it("does not choose an unrested unused keeper over rested cover when a handoff is due", () => {
    const { game, team, former } = fixture(850, 900);
    former.preferredRoles = ["forward", "midfielder", "goalkeeper"];
    expect(getGoalkeeperPreparation(game, team)).toMatchObject({
      due: true,
      successorId: former.id,
      successorReady: true,
    });
  });

  it("protects overall playing-time fairness before allocating another keeper turn", () => {
    const { game, team, former, unused } = fixture(1_200, 1_500);
    former.preferredRoles = ["forward", "midfielder", "goalkeeper"];
    expect(game.totals[unused.id].fieldSeconds).toBe(1_200);
    expect(game.totals[former.id].fieldSeconds).toBe(300);
    expect(getGoalkeeperPreparation(game, team).successorId).toBe(former.id);
  });

  it("keeps available cover when the unused keeper is unavailable", () => {
    const { game, team, former, unused } = fixture();
    const updated = markUnavailable(game, unused.id, 5, 3_000);
    expect(getGoalkeeperPreparation(updated, team)).toMatchObject({
      successorId: former.id,
      candidateIds: [former.id],
    });
  });

  it.each(["unused", "undo"] as const)(
    "ranks actual keeper history after an opening position change (%s)",
    (openingKeeper) => {
      const { game, team, former, unused } = fixture(300, 600, openingKeeper);
      const keeperSeconds = (id: string) =>
        summarizePlayerPositions(game)
          .find((summary) => summary.playerId === id)!
          .positions.find((position) => position.positionId === "gk")
          ?.seconds ?? 0;
      expect(keeperSeconds(former.id)).toBe(
        openingKeeper === "unused" ? 0 : 300,
      );
      expect(keeperSeconds(unused.id)).toBe(
        openingKeeper === "unused" ? 300 : 0,
      );
      expect(getGoalkeeperPreparation(game, team).successorId).toBe(
        openingKeeper === "unused" ? former.id : unused.id,
      );
    },
  );

  it("preserves saved manual choices and reconstructs fairness after persistence", () => {
    const { game, team, current, former, unused } = fixture();
    const queued = queueSubstitutions(game, [
      { positionId: "gk", outPlayerId: current.id, inPlayerId: former.id },
    ]);
    const stored = migrateStoredState({
      version: INITIAL_STATE.version,
      teams: { ...structuredClone(INITIAL_TEAMS), u8: team },
      activeGame: JSON.parse(JSON.stringify(queued)),
    });
    const restored = stored.activeGame!;
    const before = structuredClone(restored);
    expect(getGoalkeeperPreparation(restored, team).successorId).toBe(
      unused.id,
    );
    suggestSubstitutions(restored, 2, team);
    expect(restored).toEqual(before);
    expect(restored.queuedSubstitutions).toEqual(queued.queuedSubstitutions);
    const override = applySubstitutions(
      restored,
      restored.queuedSubstitutions!,
      5,
      3_000,
    );
    expect(override.assignments.gk).toBe(former.id);
    expect(validateGame(override, 5)).toEqual([]);
  });
});
