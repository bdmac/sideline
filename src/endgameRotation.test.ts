import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  applySubstitutions,
  createGame,
  endCurrentPeriod,
  fastForwardGame,
  getNextSubstitutionSeconds,
  getPeriodStatus,
  getRecommendedSubstitutionCount,
  getRoutineRotationStatus,
  getSubstitutionPlanningSnapshot,
  getSubstitutionReminderStatus,
  markUnavailable,
  queueSubstitutions,
  startNextPeriod,
  suggestSubstitutions,
  validateGame,
} from "./domain";
import { u12ThirdRotation } from "./test/rotationFixtures";

describe("period and game rotation cutoffs", () => {
  it("quiets a ready U8 plan with 41 seconds left in Q2 and 20 seconds until the reminder", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      40,
      1_000,
      4,
    );
    game = fastForwardGame(game, 879, 1_000);
    game.period = { current: 2, startedAtSeconds: 600 };
    game = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      5,
      1_000,
    );
    game = fastForwardGame(game, 280, 1_000);
    game = queueSubstitutions(
      game,
      suggestSubstitutions(game, 5, team, {
        allowEarlyKeeperChange: true,
      }),
    );
    const before = structuredClone(game);
    expect(game.queuedSubstitutions).toHaveLength(5);
    expect(
      getPeriodStatus(2400, game.clock.elapsedSeconds, 4, game.period)
        .remainingSeconds,
    ).toBe(41);
    expect(getSubstitutionReminderStatus(game)).toMatchObject({
      intervalSeconds: 300,
      secondsSinceLastSubstitution: 280,
    });
    expect(getRoutineRotationStatus(game)).toMatchObject({
      recommended: true,
      promptRecommended: false,
    });
    expect(getNextSubstitutionSeconds(game)).toBe(1200);
    expect(getSubstitutionPlanningSnapshot(game).clock.elapsedSeconds).toBe(
      1200,
    );
    expect(getRecommendedSubstitutionCount(game, team)).toBeGreaterThan(0);
    expect(game).toEqual(before);
  });

  it.each([
    ["u8", 4, 1, 120],
    ["u8", 4, 2, 120],
    ["u8", 4, 3, 120],
    ["u8", 2, 1, 120],
    ["u12", 2, 1, 180],
    ["u12", 4, 2, 180],
  ] as const)(
    "defers within the exact buffer for %s with %i periods at period %i, including earlier added time",
    (id, periods, current, buffer) => {
      const team = INITIAL_TEAMS[id];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        team.defaultDurationMinutes,
        1_000,
        periods,
      );
      const length = game.durationSeconds / periods;
      const start = current > 1 ? (current - 1) * length + 93 : 0;
      const end = start + length;
      game.period = { current, startedAtSeconds: start };
      game.clock.elapsedSeconds = end - buffer - 1;
      expect(getRoutineRotationStatus(game)).toMatchObject({
        recommended: true,
        promptRecommended: true,
      });
      expect(getNextSubstitutionSeconds(game)).toBe(end - buffer - 1);
      game.clock.elapsedSeconds += 1;
      const before = structuredClone(game);
      expect(getRoutineRotationStatus(game)).toMatchObject({
        recommended: true,
        promptRecommended: false,
      });
      expect(getNextSubstitutionSeconds(game)).toBe(end);
      expect(game).toEqual(before);
      game.clock.elapsedSeconds = end + 30;
      expect(getRoutineRotationStatus(game).promptRecommended).toBe(false);
      expect(getNextSubstitutionSeconds(game)).toBe(end + 30);
      game = endCurrentPeriod(game, 1_000);
      expect(getRoutineRotationStatus(game).promptRecommended).toBe(false);
      const restarted = startNextPeriod(game, 1_000);
      expect(getRoutineRotationStatus(restarted).promptRecommended).toBe(true);
      expect(getNextSubstitutionSeconds(restarted)).toBe(end + 30);
    },
  );

  it.each([
    ["u8", 4, 120],
    ["u8", 2, 120],
    ["u12", 2, 180],
    ["u12", 4, 180],
  ] as const)(
    "uses a finish buffer for %s with %i periods (%i seconds)",
    (id, periods, buffer) => {
      const team = INITIAL_TEAMS[id];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        team.defaultDurationMinutes,
        1_000,
        periods,
      );
      game.period = {
        current: periods,
        startedAtSeconds: (game.durationSeconds * (periods - 1)) / periods,
      };
      game.clock.elapsedSeconds = game.durationSeconds - buffer - 1;
      expect(getRoutineRotationStatus(game)).toEqual({
        bufferSeconds: buffer,
        recommended: true,
        promptRecommended: true,
      });
      game.clock.elapsedSeconds += 1;
      expect(getRoutineRotationStatus(game).recommended).toBe(false);
      expect(getRecommendedSubstitutionCount(game, team)).toBe(0);
      game.clock.elapsedSeconds = game.durationSeconds + 120;
      expect(getRoutineRotationStatus(game).recommended).toBe(false);
    },
  );

  it("checks the scheduled rotation time rather than only the current remaining time", () => {
    const team = INITIAL_TEAMS.u12;
    let game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      60,
      1_000,
      2,
    );
    game = fastForwardGame(game, 44 * 60, 1_000);
    game.period = { current: 2, startedAtSeconds: 1_800 };
    expect(getRoutineRotationStatus(game).recommended).toBe(true);
    const positionId = Object.keys(game.assignments).find((id) => id !== "gk")!;
    game = applySubstitutions(
      game,
      [
        {
          positionId,
          outPlayerId: game.assignments[positionId],
          inPlayerId: game.benchIds[0],
        },
      ],
      9,
      1_000,
    );
    expect(getRoutineRotationStatus(game).recommended).toBe(false);
    expect(getRecommendedSubstitutionCount(game, team)).toBe(0);
  });

  it("uses regulation remaining after added time and preserves manual choices and injury replacements", () => {
    const { game: initial, team } = u12ThirdRotation();
    expect(getRoutineRotationStatus(initial).recommended).toBe(true);
    const afterRawHour = fastForwardGame(
      initial,
      3_661 - initial.clock.elapsedSeconds,
      1_000,
    );
    expect(getRoutineRotationStatus(afterRawHour).recommended).toBe(true);
    expect(getRecommendedSubstitutionCount(afterRawHour, team)).toBeGreaterThan(
      0,
    );
    const game = fastForwardGame(
      initial,
      4_313 - initial.clock.elapsedSeconds,
      1_000,
    );
    expect(getRecommendedSubstitutionCount(game, team)).toBe(0);
    const pairs = suggestSubstitutions(game, 1, team);
    expect(pairs).toHaveLength(1);
    const queued = queueSubstitutions(game, pairs);
    const before = structuredClone(queued);
    expect(getRecommendedSubstitutionCount(queued, team)).toBe(0);
    expect(queued).toEqual(before);
    expect(
      validateGame(applySubstitutions(queued, pairs, 9, 1_000), 9),
    ).toEqual([]);
    const outfielder = Object.entries(game.assignments).find(
      ([pos]) => pos !== "gk",
    )![1];
    const injured = markUnavailable(game, outfielder, 9, 1_000);
    expect(injured.unavailableIds).toContain(outfielder);
    expect(Object.values(injured.assignments)).toHaveLength(9);
    expect(validateGame(injured, 9)).toEqual([]);
  });

  it("does not mistake an earlier period boundary for the end of the game", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      60,
      1_000,
      2,
    );
    game.clock.elapsedSeconds = 1_799;
    expect(getRoutineRotationStatus(game).recommended).toBe(true);
  });

  it.each([
    ["u8", 60, 120],
    ["u12", 80, 240],
  ] as const)(
    "scales the buffer for a custom %s duration of %i minutes",
    (id, minutes, buffer) => {
      const team = INITIAL_TEAMS[id];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        minutes,
        1_000,
        4,
      );
      game.period = {
        current: 4,
        startedAtSeconds: (game.durationSeconds * 3) / 4,
      };
      game.clock.elapsedSeconds = game.durationSeconds - buffer;
      expect(getRoutineRotationStatus(game)).toEqual({
        bufferSeconds: buffer,
        recommended: false,
        promptRecommended: false,
      });
      game.clock.elapsedSeconds -= 1;
      expect(getRoutineRotationStatus(game).recommended).toBe(true);
    },
  );
});
