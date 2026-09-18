import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getGoalkeeperPreparation,
  getGoalkeeperPreparationWarning,
  getMaxSubstitutionCount,
  getNextSubstitutionSeconds,
  getRecommendedSubstitutionCount,
  getRotationTimingGraceSeconds,
  getSubstitutionReminderStatus,
  isReadyFromBench,
  queueSubstitutions,
  suggestSubstitutions,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { u12ThirdRotation } from "./test/rotationFixtures";

describe("rested bench return priority", () => {
  it.each([
    ["u8", 4],
    ["u8", 2],
    ["u12", 4],
    ["u12", 2],
  ] as const)(
    "allows dynamic stoppages for %s with %i periods",
    (teamId, periods) => {
      const team = INITIAL_TEAMS[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        team.defaultDurationMinutes,
        1_000,
        periods,
      );
      const id = game.benchIds[0];
      const readyAt =
        getSubstitutionReminderStatus(game).intervalSeconds -
        getRotationTimingGraceSeconds(game);
      expect(isReadyFromBench(game, id, readyAt - 1)).toBe(false);
      expect(isReadyFromBench(game, id, readyAt)).toBe(true);
      expect(isReadyFromBench(game, game.assignments.gk, readyAt)).toBe(false);
      expect(
        isReadyFromBench({ ...game, unavailableIds: [id] }, id, readyAt),
      ).toBe(false);
    },
  );

  it("returns all six rested players instead of making the 29-minute group sit twice", () => {
    const { game, team, playerId } = u12ThirdRotation();
    const before = structuredClone(game);
    expect(game.clock.elapsedSeconds).toBe(2_582);
    expect(
      game.benchIds
        .map((id) => game.totals[id].fieldSeconds)
        .sort((a, b) => a - b),
    ).toEqual([840, 840, 840, 1_740, 1_740, 1_740]);
    expect(game.benchIds.every((id) => isReadyFromBench(game, id))).toBe(true);
    expect(getMaxSubstitutionCount(game, team)).toBe(6);
    expect(getRecommendedSubstitutionCount(game, team)).toBe(6);
    const pairs = suggestSubstitutions(game, 6, team);
    expect(new Set(pairs.map((pair) => pair.inPlayerId))).toEqual(
      new Set(game.benchIds),
    );
    expect(pairs.some((pair) => pair.outPlayerId === playerId("Rayek"))).toBe(
      false,
    );
    expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
    const queued = queueSubstitutions(game, pairs);
    expect(getGoalkeeperPreparationWarning(queued, team)).toBeNull();
    expect(queued.queuedSubstitutions).toEqual(pairs);
    const missedWindow = fastForwardGame(queued, 239, 1_000);
    expect(getGoalkeeperPreparationWarning(missedWindow, team)).not.toBeNull();
    const changed = applySubstitutions(game, pairs, team.sideSize, 1_000);
    const prep = getGoalkeeperPreparation(
      changed,
      team,
      getNextSubstitutionSeconds(changed),
    );
    expect(prep.due).toBe(true);
    expect(prep.successorReady).toBe(true);
    expect(pairs.map((pair) => pair.outPlayerId)).toContain(prep.successorId);
    expect(validateGame(changed, 9)).toEqual([]);
    expect(game).toEqual(before);
  });

  it("keeps necessary keeper cover when nobody else can rest for goal", () => {
    const { game, team, playerId } = u12ThirdRotation();
    team.roster.forEach((player) => {
      if (![playerId("Rayek"), playerId("Jackson")].includes(player.id))
        player.preferredRoles = player.preferredRoles.filter(
          (role) => role !== "goalkeeper",
        );
    });
    expect(getRecommendedSubstitutionCount(game, team)).toBe(5);
    const pairs = suggestSubstitutions(game, 5, team);
    expect(pairs.map((pair) => pair.inPlayerId)).not.toContain(
      playerId("Jackson"),
    );
    expect(pairs.map((pair) => pair.inPlayerId)).toContain(playerId("William"));
    expect(pairs.map((pair) => pair.inPlayerId)).toContain(playerId("Eli"));
    expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
  });

  it("still warns when a coach's full rotation leaves no keeper able to rest in time", () => {
    const { game, team } = u12ThirdRotation();
    const outgoing = Object.entries(game.assignments).filter(
      ([position, id]) =>
        position !== "gk" &&
        !team.roster
          .find((p) => p.id === id)!
          .preferredRoles.includes("goalkeeper"),
    );
    expect(outgoing).toHaveLength(6);
    const queued = queueSubstitutions(
      game,
      outgoing.map(([positionId, outPlayerId], index) => ({
        positionId,
        outPlayerId,
        inPlayerId: game.benchIds[index],
      })),
    );
    expect(getGoalkeeperPreparationWarning(queued, team)).toMatch(
      /William is lined up outfield/,
    );
  });

  it("preserves an explicit smaller queued plan", () => {
    const { game, team } = u12ThirdRotation();
    const pairs = suggestSubstitutions(game, 3, team);
    const queued = queueSubstitutions(game, pairs);
    const before = structuredClone(queued);
    expect(getRecommendedSubstitutionCount(queued, team)).toBe(6);
    suggestSubstitutions(queued, 6, team);
    expect(queued).toEqual(before);
    expect(queued.queuedSubstitutions).toEqual(pairs);
  });

  it("returns the longer-waiting bench group before newly benched players at the next rotation", () => {
    const { game, team, playerId } = u12ThirdRotation();
    const advanced = fastForwardGame(game, 58, 1_000);
    const pairs = suggestSubstitutions(advanced, 1, team);
    expect(pairs[0].inPlayerId).not.toBe(playerId("Jackson"));
    const justChanged = applySubstitutions(advanced, pairs, 9, 1_000);
    const fresh = pairs[0].outPlayerId;
    expect(isReadyFromBench(justChanged, fresh)).toBe(false);
    expect(
      justChanged.benchIds.filter((id) => isReadyFromBench(justChanged, id)),
    ).toHaveLength(5);
    team.roster.forEach((player) => {
      if (player.id !== justChanged.assignments.gk)
        player.preferredRoles = player.preferredRoles.filter(
          (role) => role !== "goalkeeper",
        );
    });
    justChanged.totals[fresh].fieldSeconds = 0;
    expect(suggestSubstitutions(justChanged, 1, team)[0].inPlayerId).not.toBe(
      fresh,
    );
  });
});
