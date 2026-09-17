import { beforeEach, describe, expect, it } from "vitest";
import {
  applyImmediateSubstitution,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getRecommendedSubstitutionCount,
  INITIAL_STATE,
  INITIAL_TEAMS,
  materializeGame,
  queueSubstitutions,
  setClockRunning,
  suggestSubstitutions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { loadState, saveState } from "./storage";
import type { TeamId } from "./types";

function setup(teamId: TeamId = "u12") {
  const team = structuredClone(INITIAL_TEAMS[teamId]);
  const game = createGame(
    team,
    team.defaultFormationId,
    team.roster.map((player) => player.id),
    team.defaultDurationMinutes,
    1_000,
  );
  const [positionId, outPlayerId] = Object.entries(game.assignments)[1];
  const inPlayerId = game.benchIds[0];
  return { team, game, pair: { positionId, outPlayerId, inPlayerId } };
}

describe("immediate single substitutions", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each(["u8", "u12"] as const)(
    "applies only the selected %s swap without creating a plan or marking anyone unavailable",
    (teamId) => {
      const { team, game, pair } = setup(teamId);
      const before = structuredClone(game);
      const next = applyImmediateSubstitution(
        game,
        pair.inPlayerId,
        pair.outPlayerId,
        team,
        2_000,
      );
      expect(next.assignments).toEqual({
        ...game.assignments,
        [pair.positionId]: pair.inPlayerId,
      });
      expect(next.benchIds).toEqual([
        ...game.benchIds.filter((id) => id !== pair.inPlayerId),
        pair.outPlayerId,
      ]);
      expect(next.unavailableIds).toEqual(game.unavailableIds);
      expect(next.presentIds).toEqual(game.presentIds);
      expect(next.queuedSubstitutions).toBeUndefined();
      expect(next.history).toHaveLength(1);
      expect(next.history[0].pairs).toEqual([pair]);
      expect(next.history[0].note).toContain("No plan was created");
      expect(next.clock).toEqual(game.clock);
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(game).toEqual(before);
    },
  );

  it("accounts for running time at execution and starts fresh field and bench stints", () => {
    const { team, game, pair } = setup();
    const running = setClockRunning(game, true, 1_000);
    const next = applyImmediateSubstitution(
      running,
      pair.inPlayerId,
      pair.outPlayerId,
      team,
      91_000,
    );
    expect(next.clock.elapsedSeconds).toBe(90);
    expect(next.clock.running).toBe(true);
    expect(next.totals[pair.outPlayerId].fieldSeconds).toBe(90);
    expect(next.totals[pair.inPlayerId].benchSeconds).toBe(90);
    expect(getCurrentBenchSeconds(next, pair.outPlayerId)).toBe(0);
    expect(getCurrentFieldSeconds(next, pair.inPlayerId)).toBe(0);
    const later = materializeGame(next, 121_000);
    expect(later.totals[pair.inPlayerId].fieldSeconds).toBe(30);
    expect(later.totals[pair.outPlayerId].benchSeconds).toBe(30);
  });

  it.each(["u8", "u12"] as const)(
    "regenerates the %s plan at a smaller size and excludes the newly benched player",
    (teamId) => {
      const { team, game, pair } = setup(teamId);
      const planned = queueSubstitutions(
        game,
        suggestSubstitutions(game, 4, team),
      );
      expect(planned.queuedSubstitutions).toHaveLength(4);
      const before = structuredClone(planned);
      const next = applyImmediateSubstitution(
        planned,
        pair.inPlayerId,
        pair.outPlayerId,
        team,
        2_000,
      );
      const replanningGame = {
        ...applySubstitutions(planned, [pair], team.sideSize, 2_000),
        benchIds: next.benchIds.filter((id) => id !== pair.outPlayerId),
      };
      const count = Math.min(
        3,
        getRecommendedSubstitutionCount(replanningGame, team),
      );
      expect(next.queuedSubstitutions).toHaveLength(count);
      expect(next.queuedSubstitutions).toEqual(
        suggestSubstitutions(replanningGame, count, team),
      );
      expect(count).toBeGreaterThan(0);
      expect(next.queuedSubstitutions!.length).toBeLessThan(4);
      expect(
        next.queuedSubstitutions!.some(
          (swap) => swap.inPlayerId === pair.outPlayerId,
        ),
      ).toBe(false);
      expect(
        validateSubstitutionPairs(next, next.queuedSubstitutions!),
      ).toEqual([]);
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(next.history.at(-1)?.pairs).toEqual([pair]);
      expect(planned).toEqual(before);
      const undone = undoLastEvent(next, 2_000);
      expect(undone.assignments).toEqual(planned.assignments);
      expect(undone.benchIds).toEqual(planned.benchIds);
      expect(undone.queuedSubstitutions).toEqual(planned.queuedSubstitutions);
    },
  );

  it("reruns recommended sizing rather than always retaining the old size minus one", () => {
    const { team, game, pair } = setup();
    team.roster.forEach((player) => {
      player.preferredRoles = ["defender"];
    });
    team.roster[0].preferredRoles = ["goalkeeper"];
    team.roster.at(-1)!.preferredRoles = ["goalkeeper"];
    const planned = queueSubstitutions(
      game,
      suggestSubstitutions(game, 6, team),
    );
    expect(planned.queuedSubstitutions).toHaveLength(6);
    const next = applyImmediateSubstitution(
      planned,
      pair.inPlayerId,
      pair.outPlayerId,
      team,
      2_000,
    );
    expect(next.queuedSubstitutions!.length).toBeGreaterThan(0);
    expect(next.queuedSubstitutions).toHaveLength(4);
    expect(
      next.queuedSubstitutions!.map((swap) => swap.inPlayerId),
    ).not.toContain(pair.outPlayerId);
  });

  it("clears a one-swap plan even when the immediate pair was not that planned swap", () => {
    const { team, game, pair } = setup();
    const planned = queueSubstitutions(game, [
      {
        positionId: Object.keys(game.assignments)[2],
        outPlayerId: Object.values(game.assignments)[2],
        inPlayerId: game.benchIds[1],
      },
    ]);
    const next = applyImmediateSubstitution(
      planned,
      pair.inPlayerId,
      pair.outPlayerId,
      team,
      2_000,
    );
    expect(next.queuedSubstitutions).toBeUndefined();
    expect(next.history.at(-1)?.pairs).toEqual([pair]);
    expect(next.history.at(-1)?.note).toContain("No substitutions remain");
    expect(undoLastEvent(next, 2_000).queuedSubstitutions).toEqual(
      planned.queuedSubstitutions,
    );
  });

  it("does not preserve a scheduled plan when recomputed sizing reaches the finishing cutoff", () => {
    const { team, game, pair } = setup();
    const late = fastForwardGame(game, 59 * 60, 2_000);
    late.period = { current: 2, startedAtSeconds: 30 * 60 };
    late.periodEnds = [{ period: 1, atSeconds: 30 * 60 }];
    const planned = queueSubstitutions(
      late,
      suggestSubstitutions(late, 3, team),
    );
    const next = applyImmediateSubstitution(
      planned,
      pair.inPlayerId,
      pair.outPlayerId,
      team,
      3_000,
    );
    expect(next.queuedSubstitutions).toBeUndefined();
    expect(next.assignments[pair.positionId]).toBe(pair.inPlayerId);
  });

  it.each([false, true])(
    "preserves undo and plan history through persistence (existing plan: %s)",
    (hasPlan) => {
      const { team, game, pair } = setup();
      const original = hasPlan
        ? queueSubstitutions(game, suggestSubstitutions(game, 3, team))
        : game;
      const next = applyImmediateSubstitution(
        original,
        pair.inPlayerId,
        pair.outPlayerId,
        team,
        2_000,
      );
      saveState({ ...structuredClone(INITIAL_STATE), activeGame: next });
      const recovered = loadState().activeGame!;
      expect(recovered.queuedSubstitutions).toEqual(next.queuedSubstitutions);
      const undone = undoLastEvent(recovered, 2_000);
      expect(undone.assignments).toEqual(original.assignments);
      expect(undone.benchIds).toEqual(original.benchIds);
      expect(undone.queuedSubstitutions).toEqual(original.queuedSubstitutions);
      expect(undone.history).toEqual(original.history);
    },
  );

  it("rejects stale incoming, outgoing, and wrong-team selections without changing the game", () => {
    const { team, game, pair } = setup();
    const before = structuredClone(game);
    expect(() =>
      applyImmediateSubstitution(game, "absent", pair.outPlayerId, team, 2_000),
    ).toThrow("Incoming player is no longer available");
    expect(() =>
      applyImmediateSubstitution(game, pair.inPlayerId, "absent", team, 2_000),
    ).toThrow("Outgoing player is no longer on the field");
    expect(() =>
      applyImmediateSubstitution(
        game,
        pair.inPlayerId,
        pair.outPlayerId,
        INITIAL_TEAMS.u8,
        2_000,
      ),
    ).toThrow("active game's team");
    expect(game).toEqual(before);
  });
});
