import { beforeEach, describe, expect, it } from "vitest";
import { createGame, INITIAL_STATE } from "./domain";
import {
  ACTIVE_GAME_KEY,
  loadState,
  migrateStoredState,
  STORAGE_KEY,
} from "./storage";

describe("persistence migrations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("adopts the supplied U8 roster without losing an active game", () => {
    const legacyU8 = structuredClone(INITIAL_STATE.teams.u8);
    legacyU8.roster = legacyU8.roster.slice(0, 8).map((player, index) => ({
      ...player,
      name: `Old sample ${index + 1}`,
      active: index !== 2,
    }));
    const activeGame = createGame(
      legacyU8,
      "5-1-2-1",
      legacyU8.roster
        .filter((player) => player.active)
        .map((player) => player.id),
      45,
      1_000,
    );

    const migrated = migrateStoredState({
      version: 1,
      teams: {
        u8: legacyU8,
        u12: structuredClone(INITIAL_STATE.teams.u12),
      },
      activeGame,
    });

    expect(migrated.version).toBe(10);
    expect(migrated.teams.u8.name).toBe("Golden Dragons");
    expect(migrated.teams.u8.roster.map((player) => player.name)).toEqual([
      "Simon",
      "Noah",
      "Maddox",
      "Ollie",
      "Malik",
      "Dylan",
      "Henry",
      "Haru",
      "Evan",
    ]);
    expect(migrated.teams.u8.roster[2].active).toBe(true);
    expect(migrated.activeGame?.presentIds).toEqual(activeGame.presentIds);
    expect(migrated.activeGame?.unavailableIds).toEqual(["u8-p3", "u8-p9"]);
  });

  it("adopts the supplied U12 roster from version 2 state", () => {
    const migrated = migrateStoredState({
      version: 2,
      teams: {
        u8: structuredClone(INITIAL_STATE.teams.u8),
        u12: {
          ...structuredClone(INITIAL_STATE.teams.u12),
          roster: INITIAL_STATE.teams.u12.roster
            .slice(0, 13)
            .map((player, index) => ({
              ...player,
              name: `Old U12 sample ${index + 1}`,
            })),
        },
      },
      activeGame: null,
    });

    expect(migrated.version).toBe(10);
    expect(migrated.teams.u12.name).toBe("Fireballers");
    expect(migrated.teams.u12.roster.map((player) => player.name)).toEqual([
      "Jackson",
      "Lazar",
      "Nikola",
      "Kai",
      "Elliott",
      "William",
      "Obasi",
      "Andrew",
      "Matt",
      "John",
      "Eli",
      "Aaron",
      "Rayek",
      "Jack",
      "Ryan",
    ]);
  });

  it("resets old editable team settings to the fixed product configuration", () => {
    const migrated = migrateStoredState({
      version: 3,
      teams: {
        u8: {
          ...structuredClone(INITIAL_STATE.teams.u8),
          name: "U8 Comets",
          defaultDurationMinutes: 52,
        },
        u12: {
          ...structuredClone(INITIAL_STATE.teams.u12),
          name: "U12 Rovers",
          defaultDurationMinutes: 71,
        },
      },
      activeGame: null,
    });

    expect(migrated.teams.u8.name).toBe("Golden Dragons");
    expect(migrated.teams.u12.name).toBe("Fireballers");
    expect(migrated.teams.u8.defaultDurationMinutes).toBe(40);
    expect(migrated.teams.u12.defaultDurationMinutes).toBe(60);
    expect(migrated.teams.u8.defaultPeriodCount).toBe(4);
    expect(migrated.teams.u12.defaultPeriodCount).toBe(2);
    expect(migrated.teams.u12.defaultFormationId).toBe("9-3-1-3-1");
  });

  it("recovers an active game from the separate journal", () => {
    const game = createGame(
      INITIAL_STATE.teams.u8,
      "5-1-2-1",
      INITIAL_STATE.teams.u8.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 12, running: true, lastStartedAt: 13_000 };
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));

    expect(loadState().activeGame).toEqual(game);
  });

  it("migrates absent players in an active version 7 game to unavailable", () => {
    const team = INITIAL_STATE.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    game.unavailableIds = [];

    const migrated = migrateStoredState({
      version: 7,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: game,
    });

    expect(migrated.version).toBe(10);
    expect(migrated.activeGame?.unavailableIds).toEqual(
      team.roster.slice(7).map((player) => player.id),
    );
  });

  it("migrates version 9 rosters to the current jersey numbers", () => {
    const oldTeams = structuredClone(INITIAL_STATE.teams);
    const oldNumbers = {
      u8: [7, 10, 14, 23, 9, 4, 16, 11, 2],
      u12: [12, 5, 17, 8, 19, 78, 6, 15, 21, 3, 13, 18, 22, 24, 30],
    };
    oldTeams.u8.roster.forEach((player, index) => {
      player.number = oldNumbers.u8[index];
    });
    oldTeams.u12.roster.forEach((player, index) => {
      player.number = oldNumbers.u12[index];
    });

    const migrated = migrateStoredState({
      version: 9,
      teams: oldTeams,
      activeGame: null,
    });

    expect(migrated.version).toBe(10);
    expect(
      migrated.teams.u8.roster.find((player) => player.name === "Simon")
        ?.number,
    ).toBe(10);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.number,
    ).toBe(82);
  });
});
