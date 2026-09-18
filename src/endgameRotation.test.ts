import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getRecommendedSubstitutionCount,
  getRoutineRotationStatus,
  markUnavailable,
  queueSubstitutions,
  suggestSubstitutions,
  validateGame,
} from "./domain";
import { u12ThirdRotation } from "./test/rotationFixtures";

describe("end-of-game rotation cutoff", () => {
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
      });
      game.clock.elapsedSeconds -= 1;
      expect(getRoutineRotationStatus(game).recommended).toBe(true);
    },
  );
});
