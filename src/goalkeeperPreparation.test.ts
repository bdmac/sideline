import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  applySubstitutions,
  assignStartingPlayersByPreference,
  createGame,
  fastForwardGame,
  getCurrentBenchSeconds,
  getFormation,
  getGoalkeeperChangeStatus,
  getGoalkeeperPreparation,
  getGoalkeeperPreparationWarning,
  getGoalkeeperStintSeconds,
  getRotationTimingGraceSeconds,
  getMaxSubstitutionCount,
  getNextSubstitutionSeconds,
  getRecommendedSubstitutionCount,
  getSubstitutionReminderStatus,
  markUnavailable,
  movePlayer,
  queueSubstitutions,
  suggestSubstitutions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import type { ActiveGame, TeamId } from "./types";

const fixture = (count = 7, teamId: TeamId = "u8", periodCount: 2 | 4 = 4) => {
  const team = structuredClone(INITIAL_TEAMS[teamId]);
  team.roster = team.roster.slice(0, count);
  team.roster.forEach((p) => {
    p.preferredRoles = ["midfielder", "defender", "forward"];
  });
  team.roster[0].preferredRoles = ["goalkeeper"];
  team.roster[1].preferredRoles = ["defender", "goalkeeper"];
  team.roster[2].preferredRoles = ["defender"];
  team.roster[3].preferredRoles = ["forward"];
  team.roster[4].preferredRoles = ["forward"];
  const game = createGame(
    team,
    teamId === "u8" ? "5-2-2" : "9-3-1-3-1",
    team.roster.map((p) => p.id),
    teamId === "u8" ? 40 : 60,
    1_000,
    periodCount,
  );
  return {
    team,
    game,
    keeper: team.roster[0].id,
    successor: team.roster[1].id,
  };
};

const advance = (game: ActiveGame, seconds: number) => {
  const next = fastForwardGame(game, seconds, 1_000);
  const length = next.durationSeconds / next.periodCount;
  const current = Math.min(
    next.periodCount,
    Math.floor(next.clock.elapsedSeconds / length) + 1,
  );
  next.period = { current, startedAtSeconds: (current - 1) * length };
  return next;
};

describe("goalkeeper preparation", () => {
  it.each([
    ["u8", 4, 300, 600],
    ["u8", 2, 300, 600],
    ["u12", 4, 600, 1_200],
    ["u12", 2, 600, 1_200],
  ] as const)(
    "uses two reminder intervals for the keeper target for %s with %s periods",
    (id, periods, interval, target) => {
      const { game } = fixture(id === "u8" ? 7 : 12, id, periods);
      expect(getSubstitutionReminderStatus(game).intervalSeconds).toBe(
        interval,
      );
      expect(getGoalkeeperStintSeconds(game)).toBe(target);
      expect(getGoalkeeperStintSeconds(game)).toBe(interval * 2);
    },
  );

  it.each([2, 4] as const)(
    "rests the U8 successor at five minutes and hands over at ten with %i periods",
    (periods) => {
      const {
        team,
        keeper,
        successor,
        game: initial,
      } = fixture(7, "u8", periods);
      let game = advance(initial, 300);
      const rest = suggestSubstitutions(game, 1, team);
      expect(rest).toHaveLength(1);
      expect(rest[0].positionId).not.toBe("gk");
      expect(rest[0].outPlayerId).toBe(successor);
      game = applySubstitutions(game, rest, team.sideSize, 1_000);
      expect(game.assignments.gk).toBe(keeper);
      expect(
        getGoalkeeperChangeStatus(game, [
          { positionId: "gk", outPlayerId: keeper, inPlayerId: successor },
        ]),
      ).toMatchObject({
        early: true,
        needsRest: true,
        targetSeconds: 600,
      });
      expect(getGoalkeeperPreparation(game, team).due).toBe(false);
      game = advance(game, 300);
      const handoff = suggestSubstitutions(game, 1, team);
      expect(handoff).toEqual([
        { positionId: "gk", outPlayerId: keeper, inPlayerId: successor },
      ]);
      expect(getGoalkeeperChangeStatus(game, handoff)).toMatchObject({
        early: false,
        needsRest: false,
        targetSeconds: 600,
      });
      game = applySubstitutions(game, handoff, team.sideSize, 1_000);
      expect(game.assignments.gk).toBe(successor);
      expect(getGoalkeeperPreparation(game, team).dueInSeconds).toBe(600);
      expect(validateGame(game, team.sideSize)).toEqual([]);
    },
  );

  it("allows both keepers to start with seven, but budgets keeper duty with ten", () => {
    const small = fixture(7);
    const large = fixture(10);
    const assign = ({ team, game }: ReturnType<typeof fixture>) =>
      assignStartingPlayersByPreference(
        getFormation(game.formationId),
        game.presentIds,
        team.roster,
      );
    expect(Object.values(assign(small))).toContain(small.successor);
    expect(Object.values(assign(large))).not.toContain(large.successor);
    expect(Object.values(assign(large))).toHaveLength(5);
    expect(assign(small)).toEqual(assign(small));
  });

  it.each([
    ["u8", 7, 4],
    ["u8", 7, 2],
    ["u12", 12, 2],
    ["u12", 12, 4],
  ] as const)(
    "rests a successor at the first reminder and hands over at the second for %s with %i attending and %i periods",
    (id, count, periods) => {
      const {
        team,
        keeper,
        successor,
        game: initial,
      } = fixture(count, id, periods);
      const interval = getSubstitutionReminderStatus(initial).intervalSeconds;
      const target = getGoalkeeperStintSeconds(initial);
      expect(getGoalkeeperPreparationWarning(initial, team)).toBeNull();
      let game = advance(initial, interval);
      expect(getGoalkeeperPreparation(game, team)).toMatchObject({
        restPlayerId: successor,
        dueInSeconds: interval,
        intervalSeconds: interval,
        targetSeconds: target,
      });
      const before = structuredClone(game);
      const rest = suggestSubstitutions(game, 1, team);
      expect(rest).toHaveLength(1);
      expect(rest[0].outPlayerId).toBe(successor);
      expect(rest[0].positionId).not.toBe("gk");
      expect(getGoalkeeperChangeStatus(game, rest)).toBeNull();
      expect(game).toEqual(before);
      game = applySubstitutions(game, rest, team.sideSize, 1_000);
      const queuedNext = suggestSubstitutions(game, 1, team);
      expect(queuedNext[0]).toMatchObject({
        positionId: "gk",
        inPlayerId: successor,
      });
      const beforeAssessment = structuredClone(game);
      expect(getGoalkeeperChangeStatus(game, queuedNext)).toMatchObject({
        early: true,
        needsRest: true,
      });
      expect(
        getGoalkeeperChangeStatus(
          game,
          queuedNext,
          getNextSubstitutionSeconds(game),
        ),
      ).toMatchObject({ early: false, needsRest: false });
      expect(game).toEqual(beforeAssessment);
      game = advance(game, interval);
      expect(game.clock.elapsedSeconds).toBe(target);
      expect(getGoalkeeperChangeStatus(game, queuedNext)).toMatchObject({
        early: false,
        needsRest: false,
      });
      expect(getCurrentBenchSeconds(game, successor)).toBe(interval);
      const takeover = suggestSubstitutions(game, 1, team);
      expect(takeover[0]).toEqual({
        positionId: "gk",
        inPlayerId: successor,
        outPlayerId: keeper,
      });
      const changed = applySubstitutions(game, takeover, team.sideSize, 1_000);
      expect(validateGame(changed, team.sideSize)).toEqual([]);
      expect(changed.totals).toEqual(game.totals);
      expect(undoLastEvent(changed, team.sideSize).assignments).toEqual(
        game.assignments,
      );
    },
  );

  it.each([
    ["u8", 7, 4, 60],
    ["u8", 7, 2, 60],
    ["u12", 12, 2, 120],
    ["u12", 12, 4, 120],
  ] as const)(
    "allows timing grace for %s with %i attending and %i periods (%i seconds)",
    (teamId, count, periods, grace) => {
      const {
        team,
        keeper,
        successor,
        game: initial,
      } = fixture(count, teamId, periods);
      const interval = getSubstitutionReminderStatus(initial).intervalSeconds;
      const target = getGoalkeeperStintSeconds(initial);
      expect(getRotationTimingGraceSeconds(initial)).toBe(grace);
      let game = advance(initial, target - interval);
      game = applySubstitutions(
        game,
        suggestSubstitutions(game, 1, team),
        team.sideSize,
        1_000,
      );
      const pairs = [
        { positionId: "gk", outPlayerId: keeper, inPlayerId: successor },
      ];
      game = advance(game, interval - grace - 1);
      expect(getGoalkeeperChangeStatus(game, pairs)).toMatchObject({
        early: true,
        needsRest: true,
      });
      game = advance(game, 1);
      expect(getCurrentBenchSeconds(game, successor)).toBe(interval - grace);
      expect(getGoalkeeperChangeStatus(game, pairs)).toMatchObject({
        early: false,
        needsRest: false,
      });
      expect(getGoalkeeperPreparation(game, team)).toMatchObject({
        due: true,
        successorReady: true,
      });
      expect(getGoalkeeperPreparationWarning(game, team)).toBeNull();
      expect(getSubstitutionReminderStatus(game).due).toBe(false);
      expect(getNextSubstitutionSeconds(game)).toBe(target);
    },
  );

  it("does not waive a genuinely short bench rest just because the keeper is ready", () => {
    const { team, keeper, successor, game: initial } = fixture(12, "u12", 2);
    let game = advance(initial, 660);
    game = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      team.sideSize,
      1_000,
    );
    game = advance(game, 420);
    const pairs = [
      { positionId: "gk", outPlayerId: keeper, inPlayerId: successor },
    ];
    expect(getGoalkeeperChangeStatus(game, pairs)).toMatchObject({
      early: false,
      needsRest: true,
    });
    expect(getGoalkeeperPreparation(game, team).successorReady).toBe(false);
    game = advance(game, 60);
    expect(getGoalkeeperChangeStatus(game, pairs)).toMatchObject({
      early: false,
      needsRest: false,
    });
  });

  it("plans a minute-29 keeper handoff for halftime while allowing the earlier stoppage", () => {
    const { team, keeper, successor, game: initial } = fixture(12, "u12", 2);
    let game = advance(initial, 19 * 60);
    const rest = suggestSubstitutions(game, 1, team);
    expect(rest[0].outPlayerId).toBe(successor);
    game = applySubstitutions(game, rest, team.sideSize, 1_000);
    expect(getNextSubstitutionSeconds(game)).toBe(1_800);
    const next = suggestSubstitutions(game, 1, team);
    expect(next[0]).toEqual({
      positionId: "gk",
      outPlayerId: keeper,
      inPlayerId: successor,
    });
    expect(getGoalkeeperChangeStatus(game, next, 1_740)).toMatchObject({
      early: false,
      needsRest: false,
    });
    expect(getGoalkeeperChangeStatus(game, next, 1_800)).toMatchObject({
      early: false,
      needsRest: false,
    });
  });

  it("still flags a next-rotation handoff when the current keeper only just entered goal", () => {
    const { team, keeper, game: initial } = fixture(12, "u12", 2);
    let game = advance(initial, 900);
    const replacement = game.benchIds[0];
    game = applySubstitutions(
      game,
      [{ positionId: "gk", outPlayerId: keeper, inPlayerId: replacement }],
      team.sideSize,
      1_000,
    );
    const nextPairs = [
      { positionId: "gk", outPlayerId: replacement, inPlayerId: keeper },
    ];
    expect(getNextSubstitutionSeconds(game)).toBe(1_500);
    expect(
      getGoalkeeperChangeStatus(
        game,
        nextPairs,
        getNextSubstitutionSeconds(game),
      ),
    ).toMatchObject({ early: true, needsRest: false, targetSeconds: 1_200 });
    expect(getGoalkeeperChangeStatus(game, nextPairs, 2_100)).toMatchObject({
      early: false,
      needsRest: false,
    });
  });

  it("checks the moving keeper's rest in a linked handoff, not the bench replacement's", () => {
    const { team, keeper, successor, game: initial } = fixture();
    let game = advance(initial, 600);
    const fromPositionId = Object.keys(game.assignments).find(
      (id) => game.assignments[id] === successor,
    )!;
    const handoff = [
      {
        positionId: "gk",
        outPlayerId: keeper,
        inPlayerId: game.benchIds[0],
        keeperHandoff: { playerId: successor, fromPositionId },
      },
    ];
    expect(getGoalkeeperChangeStatus(game, handoff)).toMatchObject({
      incomingPlayerId: successor,
      early: false,
      needsRest: true,
    });
    game = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      team.sideSize,
      1_000,
    );
    game = advance(game, 300);
    const outPlayerId = game.assignments[fromPositionId];
    game = applySubstitutions(
      game,
      [
        {
          positionId: fromPositionId,
          outPlayerId,
          inPlayerId: successor,
        },
      ],
      team.sideSize,
      1_000,
    );
    handoff[0].inPlayerId = outPlayerId;
    expect(getGoalkeeperChangeStatus(game, handoff)).toMatchObject({
      incomingPlayerId: successor,
      early: false,
      needsRest: false,
    });
  });

  it.each([7, 10])(
    "keeps goalkeeper minutes within one time band of equal share at ten-minute rotations with %s attending",
    (count) => {
      const { team, keeper, successor, game: initial } = fixture(count);
      let game = initial;
      game.assignments = assignStartingPlayersByPreference(
        getFormation(game.formationId),
        game.presentIds,
        team.roster,
      );
      game.benchIds = game.presentIds.filter(
        (id) => !Object.values(game.assignments).includes(id),
      );
      for (let rotation = 0; rotation < 3; rotation++) {
        game = advance(game, 600);
        const count = getRecommendedSubstitutionCount(game, team);
        const pairs = suggestSubstitutions(game, count, team);
        expect(pairs).toHaveLength(count);
        expect(count).toBeLessThanOrEqual(getMaxSubstitutionCount(game, team));
        expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
        game = applySubstitutions(game, pairs, team.sideSize, 1_000);
        expect(validateGame(game, team.sideSize)).toEqual([]);
      }
      game = advance(game, 600);
      const share = (40 * 60 * 5) / count;
      expect(game.totals[keeper].fieldSeconds).toBeLessThanOrEqual(share + 120);
      expect(game.totals[successor].fieldSeconds).toBeLessThanOrEqual(
        share + 120,
      );
      expect(game.totals[successor].fieldSeconds).toBeGreaterThanOrEqual(
        share - 600,
      );
      if (count === 10) {
        expect(Object.values(game.totals).map((t) => t.fieldSeconds)).toEqual(
          Array(10).fill(1_200),
        );
      }
    },
  );

  it("delays a missed handoff instead of assigning an unrested outfielder", () => {
    const { team, successor, game: initial } = fixture();
    let game = advance(initial, 600);
    expect(getGoalkeeperPreparationWarning(game, team)).toMatch(
      /full bench turn/,
    );
    const rest = suggestSubstitutions(game, 1, team);
    expect(rest[0].outPlayerId).toBe(successor);
    expect(rest[0].positionId).not.toBe("gk");
    game = applySubstitutions(game, rest, team.sideSize, 1_000);
    game = advance(game, 239);
    expect(getGoalkeeperPreparation(game, team).successorReady).toBe(false);
    expect(getGoalkeeperPreparationWarning(game, team)).toMatch(
      /full bench turn/,
    );
    game = advance(game, 1);
    expect(getGoalkeeperPreparation(game, team).successorReady).toBe(true);
    expect(suggestSubstitutions(game, 1, team)[0].inPlayerId).toBe(successor);
  });

  it("uses a shifted existing rotation opportunity after an early partial swap", () => {
    const { team, successor, game: initial } = fixture();
    let game = advance(initial, 150);
    const otherPosition = Object.keys(game.assignments).find(
      (id) => id !== "gk" && game.assignments[id] !== successor,
    )!;
    game = applySubstitutions(
      game,
      [
        {
          positionId: otherPosition,
          outPlayerId: game.assignments[otherPosition],
          inPlayerId: game.benchIds[0],
        },
      ],
      team.sideSize,
      1_000,
    );
    expect(getNextSubstitutionSeconds(game)).toBe(450);
    const nextPlan = suggestSubstitutions(game, 1, team);
    expect(nextPlan[0].outPlayerId).toBe(successor);
    game = advance(game, 300);
    game = applySubstitutions(game, nextPlan, team.sideSize, 1_000);
    game = advance(game, 150);
    expect(getGoalkeeperPreparation(game, team).due).toBe(true);
    expect(getGoalkeeperPreparation(game, team).successorReady).toBe(false);
    expect(getSubstitutionReminderStatus(game).due).toBe(false);
    game = advance(game, 150);
    expect(getSubstitutionReminderStatus(game).due).toBe(true);
    expect(suggestSubstitutions(game, 1, team)[0]).toMatchObject({
      positionId: "gk",
      inPlayerId: successor,
    });
  });

  it("does not treat absent or unavailable goalkeeper preferences as cover", () => {
    const { team, game: initial, successor } = fixture();
    const game = advance(initial, 300);
    const benchPlayerId = game.benchIds[0];
    const benchPlayer = team.roster.find((p) => p.id === benchPlayerId)!;
    benchPlayer.preferredRoles = ["goalkeeper"];
    game.unavailableIds.push(successor, benchPlayerId);
    expect(getGoalkeeperPreparation(game, team).candidateIds).toEqual([]);
    expect(getGoalkeeperPreparationWarning(game, team)).toMatch(
      /No other goalkeeper/,
    );
    const absent = { ...benchPlayer, id: "absent-goalkeeper" };
    team.roster.push(absent);
    expect(getGoalkeeperPreparation(game, team).candidateIds).not.toContain(
      absent.id,
    );
  });

  it("warns about a queued override that skips preparation without rewriting it", () => {
    const { team, successor, game: initial } = fixture();
    let game = advance(initial, 300);
    const positionId = Object.keys(game.assignments).find(
      (id) => id !== "gk" && game.assignments[id] !== successor,
    )!;
    game = queueSubstitutions(game, [
      {
        positionId,
        outPlayerId: game.assignments[positionId],
        inPlayerId: game.benchIds[0],
      },
    ]);
    const before = structuredClone(game);
    expect(getGoalkeeperPreparationWarning(game, team)).toMatch(
      /Rest .*next rotation/,
    );
    suggestSubstitutions(game, 2, team);
    expect(game).toEqual(before);
  });

  it("recalculates after partial rotations, injuries, and position overrides", () => {
    const { team, successor, keeper, game: initial } = fixture();
    let game = advance(initial, 300);
    game = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      team.sideSize,
      1_000,
    );
    expect(
      getSubstitutionReminderStatus(game).secondsSinceLastSubstitution,
    ).toBe(0);
    const cycle = getSubstitutionReminderStatus(game).cycleKey;
    game = markUnavailable(game, successor, team.sideSize, 1_000);
    expect(getGoalkeeperPreparation(game, team).candidateIds).not.toContain(
      successor,
    );
    expect(getGoalkeeperPreparationWarning(game, team)).toMatch(
      /No other goalkeeper/,
    );
    expect(getSubstitutionReminderStatus(game).cycleKey).toBe(cycle);
    const fieldPlayer = Object.values(game.assignments).find(
      (id) => id !== keeper,
    )!;
    game = movePlayer(game, fieldPlayer, "gk", 1_000);
    expect(getGoalkeeperPreparation(game, team).keeperId).toBe(fieldPlayer);
    expect(getGoalkeeperPreparation(game, team).candidateIds).toContain(keeper);
    expect(validateGame(game, team.sideSize)).toEqual([]);
  });

  it.each([3, 5])(
    "handles %s attending without a bench or duplicate assignments",
    (count) => {
      const { team, game: initial } = fixture();
      team.roster = team.roster.slice(0, count);
      const game = createGame(
        team,
        initial.formationId,
        team.roster.map((p) => p.id),
        40,
        1_000,
        4,
      );
      const due = advance(game, 300);
      expect(getRecommendedSubstitutionCount(due, team)).toBe(0);
      expect(suggestSubstitutions(due, 2, team)).toEqual([]);
      expect(getGoalkeeperPreparationWarning(due, team)).toMatch(/No bench/);
      expect(new Set(Object.values(due.assignments)).size).toBe(count);
    },
  );

  it("does not prepare a handoff beyond regulation", () => {
    const { team, game: initial } = fixture();
    const game = advance(initial, initial.durationSeconds);
    expect(getGoalkeeperPreparation(game, team).upcomingStintSeconds).toBe(0);
    expect(getGoalkeeperPreparationWarning(game, team)).toBeNull();
  });
});
