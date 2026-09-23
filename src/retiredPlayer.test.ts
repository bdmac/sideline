import { beforeEach, describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  createGame,
  fastForwardGame,
  applySubstitutions,
  queueSubstitutions,
  validateGame,
} from "./domain";
import {
  ACTIVE_GAME_KEY,
  STORAGE_KEY,
  loadState,
  migrateStoredState,
  saveState,
} from "./storage";

describe("retired U12 player", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("excludes Aaron from new games without renumbering remaining players", () => {
    const team = INITIAL_STATE.teams.u12;
    expect(team.roster.filter((player) => player.active)).toHaveLength(14);
    expect(team.roster.find((player) => player.id === "u12-p12")).toMatchObject(
      {
        name: "Aaron",
        active: false,
      },
    );
    expect(
      team.roster
        .slice(12)
        .map(({ id, name, number }) => ({ id, name, number })),
    ).toEqual([
      { id: "u12-p13", name: "Rayek", number: 22 },
      { id: "u12-p14", name: "Jack", number: 5 },
      { id: "u12-p15", name: "Ryan", number: 30 },
    ]);
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      60,
      1000,
    );
    expect(game.presentIds).toHaveLength(14);
    expect(game.presentIds).not.toContain("u12-p12");
    expect(game.unavailableIds).not.toContain("u12-p12");
    expect(game.totals).not.toHaveProperty("u12-p12");
    expect(validateGame(game, 9)).toEqual([]);
  });

  it.each(["bench", "field", "unavailable"] as const)(
    "retires Aaron once while preserving an existing game with him %s",
    (location) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u12;
      const aaron = team.roster.find((p) => p.id === "u12-p12")!;
      aaron.active = true;
      aaron.name = "Aaron local";
      aaron.number = 99;
      team.defaultDurationMinutes = 64;
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        64,
        1000,
      );
      if (location === "field") {
        game = applySubstitutions(
          game,
          [
            {
              positionId: "f",
              outPlayerId: game.assignments.f,
              inPlayerId: aaron.id,
            },
          ],
          9,
          1000,
        );
      }
      if (location === "unavailable") {
        game.presentIds = game.presentIds.filter((id) => id !== aaron.id);
        game.benchIds = game.benchIds.filter((id) => id !== aaron.id);
        game.unavailableIds = [aaron.id];
      }
      game = fastForwardGame(game, 300, 1000);
      game = queueSubstitutions(game, [
        {
          positionId: "f",
          outPlayerId: game.assignments.f,
          inPlayerId: location === "bench" ? aaron.id : game.benchIds[0],
        },
      ]);
      game.clock = { ...game.clock, running: true, lastStartedAt: 2000 };
      const saved = { ...state, version: 26, activeGame: game };
      const original = structuredClone(saved);
      const migrated = migrateStoredState(saved);
      expect(migrated).toEqual({
        ...saved,
        version: 27,
        teams: {
          ...saved.teams,
          u12: {
            ...team,
            roster: team.roster.map((p) =>
              p.id === aaron.id ? { ...p, active: false } : p,
            ),
          },
        },
      });
      expect(saved).toEqual(original);
      expect(validateGame(migrated.activeGame!, 9)).toEqual([]);
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
      localStorage.removeItem(STORAGE_KEY);
      expect(loadState().activeGame).toEqual(game);
      localStorage.removeItem(ACTIVE_GAME_KEY);
      expect(loadState().activeGame).toEqual(game);
    },
  );

  it("leaves U8 and unrelated U12 roster edits unchanged during migration", () => {
    const state = structuredClone(INITIAL_STATE);
    state.teams.u12.roster.find((p) => p.id === "u12-p12")!.active = true;
    state.teams.u12.roster[0].preferredRoles = ["defender"];
    state.teams.u12.roster.push({
      id: "custom-player",
      name: "Aaron",
      preferredRoles: ["forward"],
      active: true,
    });
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      50,
      1000,
    );
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, version: 26 }),
    );
    const migrated = loadState();
    expect(migrated.teams.u8).toEqual(state.teams.u8);
    expect(migrated.activeGame).toEqual(state.activeGame);
    expect(migrated.teams.u12.roster.filter((p) => p.id !== "u12-p12")).toEqual(
      state.teams.u12.roster.filter((p) => p.id !== "u12-p12"),
    );
    saveState(migrated);
    expect(loadState()).toEqual(migrated);
  });
});
