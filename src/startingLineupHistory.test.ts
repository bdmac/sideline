import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_STATE,
  FORMATIONS,
  applySubstitutions,
  assignStartingPlayersByPreference,
  createGame,
  fastForwardGame,
  fillStartingLineup,
  getFormation,
  getStarterHistoryBonuses,
  setClockRunning,
  updateActiveGame,
} from "./domain";
import {
  ACTIVE_GAME_KEY,
  STORAGE_KEY,
  loadState,
  migrateStoredState,
  saveState,
} from "./storage";
import type { StartingLineup } from "./types";

const setup = () => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u8;
  const game = createGame(
    team,
    team.defaultFormationId,
    team.roster.map((p) => p.id),
    40,
    1_000,
  );
  return { state, team, game };
};

describe("one-game U8 starter history", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("records the actual kickoff choices, not an abandoned setup or later substitutions", () => {
    const { state, team, game } = setup();
    const old: StartingLineup = {
      starterIds: [team.roster[0].id],
      presentIds: team.roster.map((p) => p.id),
    };
    state.teams.u8.lastStartingLineup = old;
    expect(updateActiveGame(state, game).teams.u8.lastStartingLineup).toEqual(
      old,
    );
    const positionId = getFormation(game.formationId).positions.at(-1)!.id;
    const preKickoff = applySubstitutions(
      game,
      [
        {
          positionId,
          outPlayerId: game.assignments[positionId],
          inPlayerId: game.benchIds[0],
        },
      ],
      5,
      1_100,
    );
    const started = updateActiveGame(
      state,
      setClockRunning(preKickoff, true, 2_000),
    );
    const history = started.teams.u8.lastStartingLineup!;
    expect(history.starterIds).toEqual(Object.values(preKickoff.assignments));
    expect(new Set(history.presentIds)).toEqual(new Set(game.presentIds));
    const snapshot = structuredClone(started.activeGame!);
    const later = fastForwardGame(started.activeGame!, 600, 2_000);
    const changed = applySubstitutions(
      later,
      [
        {
          positionId,
          outPlayerId: later.assignments[positionId],
          inPlayerId: later.benchIds[0],
        },
      ],
      5,
      3_000,
    );
    const after = updateActiveGame(started, changed);
    expect(after.teams.u8.lastStartingLineup).toEqual(history);
    expect(started.activeGame).toEqual(snapshot);
    saveState({ ...after, activeGame: null });
    expect(loadState().teams.u8.lastStartingLineup).toEqual(history);
    const nextGame = createGame(
      team,
      game.formationId,
      team.roster.slice(2, 8).map((p) => p.id),
      40,
      5_000,
    );
    const next = updateActiveGame(
      after,
      setClockRunning(nextGame, true, 5_000),
    );
    expect(next.teams.u8.lastStartingLineup).toEqual(
      next.activeGame?.startingLineup,
    );
    expect(next.teams.u8.lastStartingLineup?.starterIds).toEqual(
      Object.values(nextGame.assignments),
    );
    expect(next.teams.u8.lastStartingLineup).not.toEqual(history);
  });

  it("leaves U8 history alone during U12 games", () => {
    const { state, game } = setup();
    const started = updateActiveGame(state, setClockRunning(game, true, 1_000));
    const team = state.teams.u12;
    const u12 = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      60,
      2_000,
    );
    const next = updateActiveGame(started, setClockRunning(u12, true, 2_000));
    expect(next.teams).toEqual(started.teams);
    expect(next.activeGame?.startingLineup).toBeUndefined();
    expect(next.teams.u12.lastStartingLineup).toBeUndefined();
  });

  it("migrates a running version-19 game from its original lineup and persists exactly one snapshot", () => {
    const { state, game } = setup();
    const later = fastForwardGame(game, 600, 1_000);
    const positionId = getFormation(game.formationId).positions.at(-1)!.id;
    const changed = applySubstitutions(
      later,
      [
        {
          positionId,
          outPlayerId: later.assignments[positionId],
          inPlayerId: later.benchIds[0],
        },
      ],
      5,
      2_000,
    );
    const migrated = migrateStoredState({
      ...state,
      version: 19,
      activeGame: changed,
    });
    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(migrated.activeGame?.assignments).toEqual(changed.assignments);
    expect(migrated.activeGame?.history).toEqual(changed.history);
    expect(migrated.teams.u8.lastStartingLineup?.starterIds).toEqual(
      Object.values(game.assignments),
    );
    saveState(migrated);
    expect(loadState()).toEqual(migrated);
    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(ACTIVE_GAME_KEY)).not.toBeNull();
    const recovered = loadState();
    expect(recovered.activeGame).toEqual(migrated.activeGame);
    expect(recovered.teams.u8.lastStartingLineup).toEqual(
      migrated.teams.u8.lastStartingLineup,
    );
  });

  it("does not invent history for a never-started older game", () => {
    const { state, game } = setup();
    const migrated = migrateStoredState({
      ...state,
      version: 19,
      activeGame: game,
    });
    expect(migrated.activeGame).toEqual(game);
    expect(migrated.teams.u8.lastStartingLineup).toBeUndefined();
  });

  it("discards malformed optional history without losing an active game", () => {
    const { state, game } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state,
          activeGame: game,
          teams: {
            ...state.teams,
            u8: { ...state.teams.u8, lastStartingLineup: "invalid" },
          },
        }),
      );
      const loaded = loadState();
      expect(loaded.activeGame).toEqual(game);
      expect(loaded.teams.u8.lastStartingLineup).toBeUndefined();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("history-aware starting choices", () => {
  it.each(FORMATIONS.filter((f) => f.sideSize === 5))(
    "rotates multiple default U8 starters in $name",
    (formation) => {
      const { team } = setup();
      const ids = team.roster.map((p) => p.id);
      const first = assignStartingPlayersByPreference(
        formation,
        ids,
        team.roster,
      );
      const history = { starterIds: Object.values(first), presentIds: ids };
      const next = assignStartingPlayersByPreference(
        formation,
        ids,
        team.roster,
        history,
      );
      expect(
        Object.values(next).filter((id) => !history.starterIds.includes(id))
          .length,
      ).toBeGreaterThanOrEqual(2);
      expect(new Set(Object.values(next)).size).toBe(5);
      expect(
        assignStartingPlayersByPreference(formation, ids, team.roster, history),
      ).toEqual(next);
    },
  );

  it("only rewards previous bench attendance, not absence or an unknown player", () => {
    const { team, game } = setup();
    const history = {
      starterIds: Object.values(game.assignments),
      presentIds: game.presentIds.slice(0, 8),
    };
    expect(
      getStarterHistoryBonuses(getFormation(game.formationId), history),
    ).toEqual(
      Object.fromEntries(game.presentIds.slice(5, 8).map((id) => [id, 500])),
    );
    const ids = game.presentIds.filter((id) => id !== game.benchIds[0]);
    const chosen = assignStartingPlayersByPreference(
      getFormation(game.formationId),
      ids,
      team.roster,
      history,
    );
    expect(Object.values(chosen)).not.toContain(game.benchIds[0]);
  });

  it("preserves stronger role fit, manual choices, and short-handed validity", () => {
    const { team, game } = setup();
    team.roster.forEach((p) => {
      p.preferredRoles = ["defender"];
    });
    team.roster[0].preferredRoles = ["goalkeeper"];
    team.roster[5].preferredRoles = ["defender", "goalkeeper"];
    const formation = getFormation(game.formationId);
    const history = {
      starterIds: game.presentIds.slice(0, 5),
      presentIds: game.presentIds,
    };
    const next = assignStartingPlayersByPreference(
      formation,
      game.presentIds,
      team.roster,
      history,
    );
    expect(next.gk).toBe(team.roster[0].id);
    const manual = { gk: team.roster[5].id };
    expect(
      fillStartingLineup(
        formation,
        manual,
        game.presentIds,
        team.roster,
        history,
      ).gk,
    ).toBe(manual.gk);
    const short = fillStartingLineup(
      formation,
      {},
      game.presentIds.slice(0, 3),
      team.roster,
      history,
    );
    expect(Object.values(short).filter(Boolean)).toHaveLength(3);
    expect(new Set(Object.values(short).filter(Boolean)).size).toBe(3);
  });

  it("does not change U12 selection even if given history", () => {
    const team = INITIAL_STATE.teams.u12;
    const formation = getFormation(team.defaultFormationId);
    const ids = team.roster.map((p) => p.id);
    const first = assignStartingPlayersByPreference(
      formation,
      ids,
      team.roster,
    );
    expect(
      assignStartingPlayersByPreference(formation, ids, team.roster, {
        starterIds: Object.values(first),
        presentIds: ids,
      }),
    ).toEqual(first);
  });
});
