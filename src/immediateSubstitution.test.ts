import { beforeEach, describe, expect, it } from "vitest";
import {
  applyImmediateSubstitution,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getNextSubstitutionSeconds,
  getRecommendedSubstitutionCount,
  getSubstitutionPlanningSnapshot,
  getSubstitutionReminderStatus,
  INITIAL_STATE,
  INITIAL_TEAMS,
  materializeGame,
  markUnavailable,
  queueSubstitutions,
  setClockRunning,
  suggestSubstitutions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { ACTIVE_GAME_KEY, loadState, saveState, STORAGE_KEY } from "./storage";
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
      expect(next.history[0].substitutionKind).toBe("immediate");
      expect(next.history[0].note).toContain("No plan was created");
      expect(next.clock).toEqual(game.clock);
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(game).toEqual(before);
    },
  );

  it.each([
    ["u8", 4],
    ["u8", 2],
    ["u12", 4],
    ["u12", 2],
  ] as const)(
    "preserves the %s rotation deadline with %i periods",
    (teamId, periodCount) => {
      const { team, game, pair } = setup(teamId);
      game.periodCount = periodCount;
      const original = getSubstitutionReminderStatus(game);
      const advanced = fastForwardGame(
        game,
        original.intervalSeconds - 120,
        2_000,
      );
      const next = applyImmediateSubstitution(
        advanced,
        pair.inPlayerId,
        pair.outPlayerId,
        team,
        3_000,
      );
      expect(getSubstitutionReminderStatus(next)).toMatchObject({
        cycleKey: original.cycleKey,
        hasExecutedSubstitution: true,
        due: false,
        secondsSinceLastSubstitution: original.intervalSeconds - 120,
      });
      expect(getNextSubstitutionSeconds(next)).toBe(original.intervalSeconds);
      expect(getSubstitutionPlanningSnapshot(next).clock.elapsedSeconds).toBe(
        original.intervalSeconds,
      );
      const due = fastForwardGame(next, 120, 4_000);
      expect(getSubstitutionReminderStatus(due)).toMatchObject({
        cycleKey: original.cycleKey,
        due: true,
      });
    },
  );

  it.each(["u8", "u12"] as const)(
    "keeps the last planned %s rotation through immediate swaps, take-outs, and undo",
    (teamId) => {
      const { team, game, pair } = setup(teamId);
      const initial = getSubstitutionReminderStatus(game);
      const advanced = fastForwardGame(
        game,
        initial.intervalSeconds - 60,
        2_000,
      );
      const planned = applySubstitutions(
        advanced,
        [pair],
        team.sideSize,
        3_000,
      );
      const rotation = getSubstitutionReminderStatus(planned);
      expect(rotation.cycleKey).not.toBe(initial.cycleKey);
      expect(rotation.secondsSinceLastSubstitution).toBe(0);
      const later = fastForwardGame(planned, 30, 4_000);
      const immediate = applyImmediateSubstitution(
        later,
        later.benchIds[0],
        Object.values(later.assignments)[2],
        team,
        5_000,
      );
      const removed = markUnavailable(
        immediate,
        Object.values(immediate.assignments)[3],
        team.sideSize,
        6_000,
      );
      for (const current of [immediate, removed]) {
        expect(getSubstitutionReminderStatus(current)).toMatchObject({
          cycleKey: rotation.cycleKey,
          secondsSinceLastSubstitution: 30,
        });
        expect(getNextSubstitutionSeconds(current)).toBe(
          getNextSubstitutionSeconds(planned),
        );
      }
      const undoRemoval = undoLastEvent(removed, 7_000);
      const undoImmediate = undoLastEvent(undoRemoval, 8_000);
      expect(getSubstitutionReminderStatus(undoImmediate).cycleKey).toBe(
        rotation.cycleKey,
      );
      expect(
        getSubstitutionReminderStatus(undoLastEvent(undoImmediate, 9_000))
          .cycleKey,
      ).toBe(initial.cycleKey);
    },
  );

  it("recommends four rested players while Andrew has sat 26 seconds and Lazar two minutes", () => {
    const { team, game } = setup();
    let next = fastForwardGame(game, 840, 2_000);
    next = applyImmediateSubstitution(next, "u12-p10", "u12-p2", team, 3_000);
    next = fastForwardGame(next, 94, 4_000);
    next = applyImmediateSubstitution(next, "u12-p11", "u12-p8", team, 5_000);
    next = fastForwardGame(next, 26, 6_000);
    expect(getCurrentBenchSeconds(next, "u12-p8")).toBe(26);
    expect(getCurrentBenchSeconds(next, "u12-p2")).toBe(120);
    expect(getSubstitutionReminderStatus(next).due).toBe(true);
    expect(getRecommendedSubstitutionCount(next, team)).toBe(4);
    const pairs = suggestSubstitutions(next, 4, team);
    expect(new Set(pairs.map((pair) => pair.inPlayerId))).toEqual(
      new Set(["u12-p12", "u12-p13", "u12-p14", "u12-p15"]),
    );
    expect(validateSubstitutionPairs(next, pairs)).toEqual([]);
  });

  it.each(["primary", "local-recovery", "session-recovery"])(
    "restores legacy immediate swaps without resetting cadence (%s)",
    (source) => {
      const { team, game, pair } = setup();
      const planned = applySubstitutions(
        fastForwardGame(game, 300, 2_000),
        [pair],
        team.sideSize,
        3_000,
      );
      const next = applyImmediateSubstitution(
        fastForwardGame(planned, 100, 4_000),
        planned.benchIds[0],
        Object.values(planned.assignments)[2],
        team,
        5_000,
      );
      const legacy = structuredClone(next);
      legacy.history.forEach((event) => delete event.substitutionKind);
      const expected = getSubstitutionReminderStatus(next);
      expect(getSubstitutionReminderStatus(legacy)).toEqual(expected);
      saveState({ ...structuredClone(INITIAL_STATE), activeGame: legacy });
      if (source !== "primary") localStorage.removeItem(STORAGE_KEY);
      if (source === "session-recovery")
        localStorage.removeItem(ACTIVE_GAME_KEY);
      const recovered = loadState().activeGame!;
      expect(recovered.history[0].substitutionKind).toBeUndefined();
      expect(recovered.history[1].substitutionKind).toBe("immediate");
      expect(recovered.assignments).toEqual(next.assignments);
      expect(recovered.totals).toEqual(next.totals);
      expect(recovered.clock).toEqual(next.clock);
      expect(getSubstitutionReminderStatus(recovered)).toEqual(expected);
      saveState({ ...structuredClone(INITIAL_STATE), activeGame: recovered });
      expect(getSubstitutionReminderStatus(loadState().activeGame!)).toEqual(
        expected,
      );
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
    "preserves exact unaffected %s pairings without recommending replacements",
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
      const expectedPairs = planned.queuedSubstitutions!.filter(
        (saved) =>
          saved.inPlayerId !== pair.inPlayerId &&
          saved.outPlayerId !== pair.outPlayerId,
      );
      expect(next.queuedSubstitutions).toEqual(expectedPairs);
      expect(expectedPairs.length).toBeGreaterThan(0);
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

  it("does not resize saved pairings to the current recommendation after a sub", () => {
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
    expect(next.queuedSubstitutions).toEqual(
      planned.queuedSubstitutions!.filter(
        (saved) =>
          saved.inPlayerId !== pair.inPlayerId &&
          saved.outPlayerId !== pair.outPlayerId,
      ),
    );
    expect(
      next.queuedSubstitutions!.map((swap) => swap.inPlayerId),
    ).not.toContain(pair.outPlayerId);
  });

  it("keeps a one-swap plan when the immediate pair does not affect it", () => {
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
    expect(next.queuedSubstitutions).toEqual(planned.queuedSubstitutions);
    expect(next.history.at(-1)?.pairs).toEqual([pair]);
    expect(next.history.at(-1)?.note).toContain(
      "Unaffected planned swaps were kept",
    );
    expect(undoLastEvent(next, 2_000).queuedSubstitutions).toEqual(
      planned.queuedSubstitutions,
    );
  });

  it("preserves unaffected scheduled swaps even at the finishing cutoff", () => {
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
    expect(next.queuedSubstitutions).toEqual(
      planned.queuedSubstitutions!.filter(
        (saved) =>
          saved.inPlayerId !== pair.inPlayerId &&
          saved.outPlayerId !== pair.outPlayerId,
      ),
    );
    expect(next.queuedSubstitutions!.length).toBeGreaterThan(0);
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
