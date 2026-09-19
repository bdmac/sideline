import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  addGuestPlayerToBench,
  applySubstitutions,
  createGame,
  getPlayingTimeWarnings,
  markAvailable,
  markUnavailable,
  materializeGame,
  queueSubstitutions,
  setClockRunning,
  undoLastEvent,
  validateGame,
} from "./domain";
import { loadState, saveState } from "./storage";
import { advanceMatchTo, lateHaruGame } from "./test/playingTimeFixtures";

describe("availability-aware playing-time safeguards", () => {
  it("flags late guest Haru's seven minutes well before a 50-minute game ends", () => {
    const { game, guest } = lateHaruGame();
    const before = structuredClone(game);
    const warning = getPlayingTimeWarnings(game).find(
      (item) => item.playerId === guest.id,
    );
    expect(warning).toMatchObject({
      playedSeconds: 420,
      availableSeconds: 27 * 60,
      minimumSeconds: 648,
      targetSeconds: 1128,
      shortfallSeconds: 228,
      neededSeconds: 708,
      urgent: false,
    });
    expect(game).toEqual(before);
    expect(validateGame(game, 5)).toEqual([]);
  });

  it("keeps warning through queuing, entry, and a short subsequent bench stint", () => {
    const { game, guest, positionId, originalPlayerId } = lateHaruGame(38);
    const pairs = [
      {
        positionId,
        outPlayerId: originalPlayerId,
        inPlayerId: guest.id,
      },
    ];
    const queued = queueSubstitutions(game, pairs);
    expect(
      getPlayingTimeWarnings(queued).find((item) => item.playerId === guest.id)
        ?.urgent,
    ).toBe(true);
    const entered = applySubstitutions(queued, pairs, 5, 4_000);
    expect(
      getPlayingTimeWarnings(entered).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(true);
    const later = advanceMatchTo(entered, 39 * 60);
    const benched = applySubstitutions(
      later,
      [
        {
          positionId,
          outPlayerId: guest.id,
          inPlayerId: originalPlayerId,
        },
      ],
      5,
      5_000,
    );
    expect(
      getPlayingTimeWarnings(benched).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(true);
  });

  it("clears after actual playing time catches up, not after an instruction is saved", () => {
    const { game, guest, positionId, originalPlayerId } = lateHaruGame();
    const entered = applySubstitutions(
      game,
      [
        {
          positionId,
          outPlayerId: originalPlayerId,
          inPlayerId: guest.id,
        },
      ],
      5,
      4_000,
    );
    const caughtUp = advanceMatchTo(entered, 40 * 60);
    expect(caughtUp.totals[guest.id].fieldSeconds).toBe(17 * 60);
    expect(
      getPlayingTimeWarnings(caughtUp).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(false);
  });

  it("does not charge late guests for time before they arrived", () => {
    const { game } = lateHaruGame(45);
    const guest = {
      ...INITIAL_TEAMS.u8.roster[0],
      id: "very-late",
      guest: true,
    };
    const joined = addGuestPlayerToBench(game, guest, 5, 4_000);
    expect(
      getPlayingTimeWarnings(joined, true).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(false);
    const later = advanceMatchTo(joined, 45 * 60 + 30);
    expect(
      getPlayingTimeWarnings(later).some((item) => item.playerId === guest.id),
    ).toBe(false);
    const finalWarning = getPlayingTimeWarnings(later, true).find(
      (item) => item.playerId === guest.id,
    )!;
    expect(finalWarning.availableSeconds).toBe(30);
    expect(finalWarning.minimumSeconds).toBeCloseTo((30 * 4) / 11);
  });

  it("tracks regular late arrivals with the same available-time denominator", () => {
    const team = INITIAL_TEAMS.u8;
    const haru = team.roster.find((player) => player.name === "Haru")!;
    let game = createGame(
      team,
      "5-2-2",
      team.roster
        .filter((player) => player.id !== haru.id)
        .map((player) => player.id),
      50,
      1_000,
      2,
    );
    game = advanceMatchTo(game, 3 * 60);
    game = markAvailable(game, haru.id, 5, 1_000);
    game = advanceMatchTo(game, 11 * 60);
    expect(
      getPlayingTimeWarnings(game).find((item) => item.playerId === haru.id),
    ).toMatchObject({ availableSeconds: 8 * 60, minimumSeconds: 192 });
  });

  it("excludes unavailable players and excludes injury time when they return", () => {
    const { game, guest } = lateHaruGame();
    const unavailable = markUnavailable(game, guest.id, 5, 4_000);
    const later = advanceMatchTo(unavailable, 35 * 60);
    expect(
      getPlayingTimeWarnings(later, true).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(false);
    const returned = markAvailable(later, guest.id, 5, 5_000);
    expect(
      getPlayingTimeWarnings(returned).find(
        (item) => item.playerId === guest.id,
      )?.availableSeconds,
    ).toBe(27 * 60);
    const afterUndo = undoLastEvent(returned, 5_000);
    expect(
      getPlayingTimeWarnings(afterUndo).some(
        (item) => item.playerId === guest.id,
      ),
    ).toBe(false);
  });

  it("preserves actual availability totals when an unavailability event is undone", () => {
    const { game, guest } = lateHaruGame();
    const unavailable = markUnavailable(game, guest.id, 5, 4_000);
    const later = advanceMatchTo(unavailable, 35 * 60);
    const undone = undoLastEvent(later, 5_000);
    expect(
      getPlayingTimeWarnings(undone).find((item) => item.playerId === guest.id)
        ?.availableSeconds,
    ).toBe(27 * 60);
  });

  it("survives refresh, respects pause, and materializes a running clock", () => {
    const { state, game, guest } = lateHaruGame();
    saveState(state);
    const restored = loadState().activeGame!;
    expect(getPlayingTimeWarnings(restored)).toEqual(
      getPlayingTimeWarnings(game),
    );
    expect(getPlayingTimeWarnings(materializeGame(restored, 999_000))).toEqual(
      getPlayingTimeWarnings(game),
    );
    const running = setClockRunning(restored, true, 1_000);
    const later = materializeGame(running, 61_000);
    expect(
      getPlayingTimeWarnings(later).find((item) => item.playerId === guest.id)
        ?.availableSeconds,
    ).toBe(28 * 60);
  });

  it("escalates before the remaining time is too short to catch up", () => {
    const { game, guest } = lateHaruGame(38);
    const warning = getPlayingTimeWarnings(game).find(
      (item) => item.playerId === guest.id,
    )!;
    expect(warning.urgent).toBe(true);
    expect(warning.neededSeconds).toBe(708);
    expect(50 * 60 - game.clock.elapsedSeconds).toBeGreaterThan(
      warning.neededSeconds,
    );
    const finished = advanceMatchTo(game, 50 * 60);
    expect(
      getPlayingTimeWarnings(finished, true).find(
        (item) => item.playerId === guest.id,
      ),
    ).toMatchObject({ playedSeconds: 420, minimumSeconds: 1128 });
  });

  it("uses remaining regulation rather than treating prior added time as lost second-half time", () => {
    const { game, guest } = lateHaruGame(38);
    game.period = { current: 2, startedAtSeconds: 27 * 60 };
    game.periodEnds = [{ period: 1, atSeconds: 27 * 60 }];
    const warning = getPlayingTimeWarnings(game).find(
      (item) => item.playerId === guest.id,
    )!;
    expect(warning.targetSeconds).toBe(1176);
    expect(warning.neededSeconds).toBe(756);
    expect(warning.urgent).toBe(false);
  });

  it("checks actual available minutes when ending early, not the future full-game target", () => {
    const { game, guest } = lateHaruGame();
    const warning = getPlayingTimeWarnings(game, true).find(
      (item) => item.playerId === guest.id,
    )!;
    expect(warning.minimumSeconds).toBe(648);
    expect(warning.targetSeconds).toBe(648);
  });

  it.each(["u8", "u12"] as const)(
    "keeps ordinary %s alternating rotations quiet",
    (teamId) => {
      const source = INITIAL_TEAMS[teamId];
      const team = { ...source, roster: [...source.roster] };
      while (team.roster.length < team.sideSize * 2) {
        team.roster.push({
          ...source.roster[0],
          id: `extra-${team.roster.length}`,
        });
      }
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
        2,
      );
      const interval = game.durationSeconds / (teamId === "u8" ? 8 : 4);
      for (let seconds = 15; seconds <= game.durationSeconds; seconds += 15) {
        game = advanceMatchTo(game, seconds);
        expect(getPlayingTimeWarnings(game)).toEqual([]);
        if (seconds % interval === 0 && seconds < game.durationSeconds) {
          game = applySubstitutions(
            game,
            Object.entries(game.assignments).map(
              ([positionId, outPlayerId], index) => ({
                positionId,
                outPlayerId,
                inPlayerId: game.benchIds[index],
              }),
            ),
            team.sideSize,
            1_000 + seconds,
          );
        }
      }
      expect(getPlayingTimeWarnings(game, true)).toEqual([]);
    },
  );

  it.each([4, 5])(
    "does not warn in a %s-player U8 game with no bench",
    (count) => {
      const team = INITIAL_TEAMS.u8;
      let game = createGame(
        team,
        "5-2-2",
        team.roster.slice(0, count).map((player) => player.id),
        50,
        1_000,
        2,
      );
      game = advanceMatchTo(game, 50 * 60);
      expect(getPlayingTimeWarnings(game, true)).toEqual([]);
    },
  );
});
