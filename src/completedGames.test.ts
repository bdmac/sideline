import { beforeEach, describe, expect, it } from "vitest";
import { closeCompletedSummary, saveCompletedGame } from "./completedGames";
import {
  INITIAL_STATE,
  createGame,
  fastForwardGame,
  setClockRunning,
  updateActiveGame,
} from "./domain";
import {
  ACTIVE_GAME_KEY,
  loadState,
  migrateStoredState,
  saveState,
} from "./storage";
import type { TeamId } from "./types";

const gameFor = (teamId: TeamId, startedAt = 1000) => {
  const team = INITIAL_STATE.teams[teamId];
  return createGame(
    team,
    team.defaultFormationId,
    team.roster.map((p) => p.id),
    team.defaultDurationMinutes,
    startedAt,
  );
};

describe("last completed games", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saves a frozen final game and roster, clears recovery, and survives reload", () => {
    const state = structuredClone(INITIAL_STATE);
    const game = setClockRunning(gameFor("u12"), true, 1000);
    state.activeGame = game;
    saveState(state);
    const before = structuredClone(state);
    const ended = saveCompletedGame(state, game, 121000);
    expect(state).toEqual(before);
    expect(ended.activeGame).toBeNull();
    expect(ended.openSummaryTeamId).toBe("u12");
    expect(ended.lastCompletedGames?.u12?.game.clock).toMatchObject({
      running: false,
      lastStartedAt: null,
      elapsedSeconds: 120,
    });
    expect(ended.lastCompletedGames?.u12?.game.periodEnds).toEqual([
      { period: 1, atSeconds: 120 },
    ]);
    state.teams.u12.roster[0].name = "Changed later";
    game.totals["u12-p1"].fieldSeconds = 999;
    expect(ended.lastCompletedGames?.u12?.team.roster[0].name).toBe("Jackson");
    expect(
      ended.lastCompletedGames?.u12?.game.totals["u12-p1"].fieldSeconds,
    ).toBe(120);
    saveState(ended);
    expect(localStorage.getItem(ACTIVE_GAME_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_GAME_KEY)).toBeNull();
    expect(loadState()).toEqual(ended);
    const closed = closeCompletedSummary(ended);
    saveState(closed);
    expect(loadState()).toEqual(closed);
    expect(closed.openSummaryTeamId).toBeUndefined();
    expect(closed.lastCompletedGames).toEqual(ended.lastCompletedGames);
  });

  it("keeps one game per team, replacing it only on that team's next finish", () => {
    let state = saveCompletedGame(
      structuredClone(INITIAL_STATE),
      gameFor("u8"),
      1000,
    );
    const first = structuredClone(state.lastCompletedGames?.u8);
    state = saveCompletedGame(state, gameFor("u12"), 2000);
    const otherTeam = structuredClone(state.lastCompletedGames?.u12);
    const next = gameFor("u8", 3000);
    state = updateActiveGame(closeCompletedSummary(state), next);
    expect(state.lastCompletedGames?.u8).toEqual(first);
    saveState(state);
    expect(loadState().activeGame).toEqual(next);
    state = saveCompletedGame(state, fastForwardGame(next, 60, 3000), 4000);
    expect(state.lastCompletedGames?.u8?.game.id).toBe(next.id);
    expect(state.lastCompletedGames?.u12).toEqual(otherTeam);
  });

  it("does not revive a completed game from stale recovery data", () => {
    const game = gameFor("u12");
    const state = saveCompletedGame(structuredClone(INITIAL_STATE), game, 1000);
    saveState(state);
    sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));
    expect(loadState().activeGame).toBeNull();
    expect(loadState().lastCompletedGames).toEqual(state.lastCompletedGames);
  });

  it("loads older saves without inventing a completed game", () => {
    const old = { ...structuredClone(INITIAL_STATE), version: 28 };
    expect(migrateStoredState(old).lastCompletedGames).toBeUndefined();
    expect(migrateStoredState(old).openSummaryTeamId).toBeUndefined();
  });
});
