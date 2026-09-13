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

    expect(migrated.version).toBe(7);
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
    expect(migrated.activeGame).toEqual(activeGame);
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

    expect(migrated.version).toBe(7);
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
});
