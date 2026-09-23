import { beforeEach, describe, expect, it } from "vitest";
import {
  createGame,
  fastForwardGame,
  INITIAL_STATE,
  movePlayer,
  queueSubstitutions,
  suggestSubstitutions,
} from "./domain";
import {
  ACTIVE_GAME_KEY,
  loadState,
  migrateStoredState,
  saveState,
  STORAGE_KEY,
} from "./storage";
import type { Player } from "./types";

const approvedOlliePreferences: Player["preferredRoles"] = [
  "defender",
  "goalkeeper",
  "midfielder",
  "forward",
];

const approvedU12Preferences: Record<string, Player["preferredRoles"]> = {
  Jackson: ["goalkeeper", "defender", "midfielder"],
  Lazar: ["defender", "midfielder", "forward"],
  Nikola: ["forward", "midfielder", "defender"],
  Kai: ["defender", "midfielder"],
  Elliott: ["midfielder", "defender", "forward"],
  William: ["midfielder", "defender", "goalkeeper"],
  Obasi: ["defender", "midfielder", "goalkeeper"],
  Andrew: ["midfielder", "forward"],
  Matt: ["forward", "midfielder", "goalkeeper"],
  John: ["forward", "midfielder", "defender"],
  Eli: ["defender", "midfielder", "forward"],
  Aaron: ["midfielder", "defender", "forward"],
  Rayek: ["defender", "forward", "goalkeeper", "midfielder"],
  Jack: ["defender", "midfielder", "goalkeeper"],
  Ryan: ["defender", "midfielder", "forward"],
};

describe("persistence migrations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("starts fresh U8 games with two 25-minute halves and leaves U12 defaults unchanged", () => {
    const state = loadState();
    expect(state).toEqual(INITIAL_STATE);
    expect(state.version).toBe(27);
    expect(state.teams.u8).toMatchObject({
      defaultDurationMinutes: 50,
      defaultPeriodCount: 2,
    });
    expect(state.teams.u12).toMatchObject({
      defaultDurationMinutes: 60,
      defaultPeriodCount: 2,
    });
    expect(
      state.teams.u8.roster.find((player) => player.id === "u8-p4")
        ?.preferredRoles,
    ).toEqual(approvedOlliePreferences);
    const team = state.teams.u8;
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
    );
    expect(game.durationSeconds).toBe(3_000);
    expect(game.periodCount).toBe(2);
    expect(game.durationSeconds / game.periodCount).toBe(1_500);
  });

  it.each([
    [40, 4],
    [40, 2],
    [48, 4],
    [50, 2],
  ] as const)(
    "upgrades version 23 U8 defaults of %i minutes and %i periods plus Ollie's preferences once",
    (duration, periods) => {
      const saved = structuredClone(INITIAL_STATE);
      saved.teams.u8.defaultDurationMinutes = duration;
      saved.teams.u8.defaultPeriodCount = periods;
      saved.teams.u8.roster.find(
        (player) => player.id === "u8-p4",
      )!.preferredRoles = ["forward", "midfielder"];
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...saved, version: 23 }),
      );

      const migrated = loadState();
      expect(migrated).toEqual({
        ...saved,
        version: 27,
        teams: {
          ...saved.teams,
          u8: {
            ...saved.teams.u8,
            defaultDurationMinutes: 50,
            defaultPeriodCount: 2,
            roster: saved.teams.u8.roster.map((player) =>
              player.id === "u8-p4"
                ? { ...player, preferredRoles: approvedOlliePreferences }
                : player,
            ),
          },
        },
      });
      migrated.teams.u8.defaultDurationMinutes = 44;
      migrated.teams.u8.defaultPeriodCount = 4;
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it.each(["u8", "u12"] as const)(
    "updates Ollie and U12 preferences from version 24 while preserving an active %s game",
    (teamId) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      teams.u8.defaultDurationMinutes = 44;
      teams.u8.defaultPeriodCount = 4;
      teams.u8.defaultFormationId = "5-1-1-2";
      teams.u8.roster.forEach((player) => {
        player.preferredRoles = ["goalkeeper"];
      });
      teams.u12.roster.forEach((player) => {
        player.preferredRoles = ["forward"];
      });
      const ollie = teams.u8.roster.find((player) => player.id === "u8-p4")!;
      ollie.name = "Ollie local";
      ollie.number = 99;
      ollie.active = false;
      teams.u8.roster.push({
        id: "custom-u8-player",
        name: "Local addition",
        preferredRoles: ["midfielder"],
        active: true,
      });
      const team = INITIAL_STATE.teams[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
        4,
      );
      game = movePlayer(game, team.roster[3].id, "gk", 1_000);
      game.startingLineup = {
        starterIds: Object.values(game.assignments),
        presentIds: [...game.presentIds],
      };
      teams.u8.lastStartingLineup = {
        starterIds: ["u8-p1"],
        presentIds: ["u8-p1", "u8-p2"],
      };
      if (teamId === "u8")
        teams.u8.lastStartingLineup = structuredClone(game.startingLineup);
      game = fastForwardGame(game, 180, 1_000);
      game = queueSubstitutions(game, suggestSubstitutions(game, 2, team));
      game.clock = { ...game.clock, running: true, lastStartedAt: 2_000 };
      expect(game.history.length).toBeGreaterThan(0);
      expect(game.queuedSubstitutions?.length).toBeGreaterThan(0);
      const saved = { version: 24, teams, activeGame: game };
      const original = structuredClone(saved);
      const migrated = migrateStoredState(saved);
      expect(migrated).toEqual({
        ...saved,
        version: 27,
        teams: {
          ...teams,
          u12: {
            ...teams.u12,
            roster: teams.u12.roster.map((player) => ({
              ...player,
              preferredRoles: approvedU12Preferences[player.name],
            })),
          },
          u8: {
            ...teams.u8,
            roster: teams.u8.roster.map((player) =>
              player.id === ollie.id
                ? { ...player, preferredRoles: approvedOlliePreferences }
                : player,
            ),
          },
        },
      });
      expect(saved).toEqual(original);
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it.each([{ preferredRoles: [] }, { preferredRoles: ["forward"] }] satisfies {
    preferredRoles: Player["preferredRoles"];
  }[])(
    "preserves later Ollie preference edits: $preferredRoles",
    ({ preferredRoles }) => {
      const state = structuredClone(INITIAL_STATE);
      state.teams.u8.roster.find(
        (player) => player.id === "u8-p4",
      )!.preferredRoles = preferredRoles;
      state.teams.u8.defaultDurationMinutes = 44;
      state.teams.u8.defaultPeriodCount = 4;
      saveState(state);
      expect(loadState()).toEqual(state);
      expect(migrateStoredState(state)).toEqual(state);
    },
  );

  it.each(["u8", "u12"] as const)(
    "updates U8 default format and U12 preferences from version 23 while preserving an active %s game verbatim",
    (teamId) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      teams.u8.defaultDurationMinutes = 48;
      teams.u8.defaultPeriodCount = 4;
      teams.u8.defaultFormationId = "5-1-1-2";
      teams.u8.roster[0] = {
        ...teams.u8.roster[0],
        name: "Simon local",
        number: 99,
        active: false,
        preferredRoles: ["goalkeeper"],
      };
      teams.u8.roster[1].preferredRoles = [];
      teams.u8.roster.push({
        id: "custom-u8-player",
        name: "Local addition",
        active: true,
        preferredRoles: ["defender"],
      });
      teams.u8.lastStartingLineup = {
        starterIds: ["u8-p1"],
        presentIds: ["u8-p1", "u8-p2"],
      };
      teams.u12.defaultDurationMinutes = 64;
      teams.u12.defaultPeriodCount = 4;
      teams.u12.roster[0].preferredRoles = [];
      const team = INITIAL_STATE.teams[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        teamId === "u8" ? 40 : 64,
        1_000,
        4,
      );
      game = movePlayer(game, team.roster[3].id, "gk", 1_000);
      game.startingLineup = {
        starterIds: Object.values(game.assignments),
        presentIds: [...game.presentIds],
      };
      if (teamId === "u8")
        teams.u8.lastStartingLineup = structuredClone(game.startingLineup);
      game = fastForwardGame(game, 180, 1_000);
      game = queueSubstitutions(game, suggestSubstitutions(game, 2, team));
      game.periodEnds = [{ period: 1, atSeconds: 612 }];
      game.period = { current: 2, startedAtSeconds: 612 };
      game.clock = {
        elapsedSeconds: 791,
        running: true,
        lastStartedAt: 2_000,
      };
      expect(game.history.length).toBeGreaterThan(0);
      expect(game.queuedSubstitutions?.length).toBeGreaterThan(0);
      const saved = { version: 23, teams, activeGame: game };
      const original = structuredClone(saved);
      const migrated = migrateStoredState(saved);
      expect(migrated).toEqual({
        ...saved,
        version: 27,
        teams: {
          ...teams,
          u12: {
            ...teams.u12,
            roster: teams.u12.roster.map((player) => ({
              ...player,
              preferredRoles: approvedU12Preferences[player.name],
            })),
          },
          u8: {
            ...teams.u8,
            defaultDurationMinutes: 50,
            defaultPeriodCount: 2,
          },
        },
      });
      expect(migrated.activeGame).toEqual(game);
      expect(saved).toEqual(original);
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
    },
  );

  it("retains the legacy U8 quarter format when normalizing a game without periodCount", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    teams.u8.defaultDurationMinutes = 40;
    teams.u8.defaultPeriodCount = 4;
    const team = teams.u8;
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    delete (game as Partial<typeof game>).periodCount;
    const migrated = migrateStoredState({
      version: 23,
      teams,
      activeGame: game,
    });
    expect(migrated.activeGame).toEqual({ ...game, periodCount: 4 });
    expect(migrated.teams.u8.defaultPeriodCount).toBe(2);
    expect(migrated.teams.u8.defaultDurationMinutes).toBe(50);
  });

  it("matches all fifteen ordered U12 CSV preferences without blank placeholders", () => {
    expect(
      Object.fromEntries(
        INITIAL_STATE.teams.u12.roster.map((player) => [
          player.name,
          player.preferredRoles,
        ]),
      ),
    ).toEqual(approvedU12Preferences);
  });

  it.each(
    [22, 23, 24, 25].flatMap((version) =>
      (["u8", "u12"] as const).map((teamId) => ({ version, teamId })),
    ),
  )(
    "applies the U12 CSV once from version $version while preserving U8 and an active $teamId game",
    ({ version, teamId }) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      teams.u12.roster.forEach((player) => {
        player.preferredRoles = ["forward"];
      });
      const kai = teams.u12.roster.find((player) => player.id === "u12-p4")!;
      kai.name = "Kai local";
      kai.number = 99;
      kai.active = false;
      teams.u12.defaultDurationMinutes = 64;
      teams.u12.roster.push({
        id: "custom-u12-player",
        name: "Extra",
        preferredRoles: ["goalkeeper"],
        active: true,
      });
      teams.u8.roster[0].preferredRoles = ["defender"];
      const team = INITIAL_STATE.teams[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      game = movePlayer(game, team.roster[3].id, "gk", 1_000);
      game.startingLineup = {
        starterIds: Object.values(game.assignments),
        presentIds: [...game.presentIds],
      };
      if (teamId === "u8")
        teams.u8.lastStartingLineup = structuredClone(game.startingLineup);
      game = fastForwardGame(game, 180, 1_000);
      game = queueSubstitutions(game, suggestSubstitutions(game, 2, team));
      game.clock = { ...game.clock, running: true, lastStartedAt: 2_000 };
      const original = structuredClone({ teams, game });
      const migrated = migrateStoredState({
        version,
        teams,
        activeGame: game,
      });
      const preferencesById = new Map(
        INITIAL_STATE.teams.u12.roster.map((player) => [
          player.id,
          approvedU12Preferences[player.name],
        ]),
      );
      expect(migrated.version).toBe(INITIAL_STATE.version);
      expect(migrated.teams.u8).toEqual(teams.u8);
      expect(migrated.teams.u12).toEqual({
        ...teams.u12,
        roster: teams.u12.roster.map((player) => ({
          ...player,
          preferredRoles:
            preferencesById.get(player.id) ?? player.preferredRoles,
        })),
      });
      expect(migrated.activeGame).toEqual(game);
      expect({ teams, game }).toEqual(original);
      migrated.teams.u12.roster.find(
        (player) => player.id === kai.id,
      )!.preferredRoles = ["goalkeeper"];
      migrated.teams.u12.roster[0].preferredRoles = [];
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it.each(["u8", "u12"] as const)(
    "applies the approved U8 CSV once while preserving an active %s game",
    (teamId) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      teams.u8.roster.forEach((player) => {
        player.preferredRoles = ["defender"];
      });
      teams.u8.roster[0].name = "Simon local";
      teams.u8.roster[0].number = 99;
      teams.u8.roster[0].active = false;
      teams.u8.defaultDurationMinutes = 48;
      teams.u8.lastStartingLineup = {
        starterIds: ["u8-p1"],
        presentIds: ["u8-p1", "u8-p2"],
      };
      teams.u12.roster[0].name = "Jackson local";
      const extraPlayer: Player = {
        id: "custom-u8-player",
        name: "Extra",
        number: 88,
        preferredRoles: ["midfielder"],
        active: true,
      };
      teams.u8.roster.push(extraPlayer);
      const team = INITIAL_STATE.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster
          .filter((player) => player.active)
          .map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      game.startingLineup = {
        starterIds: Object.values(game.assignments),
        presentIds: [...game.presentIds],
      };
      const activeGame = queueSubstitutions(
        game,
        suggestSubstitutions(game, 2, team),
      );
      activeGame.clock = {
        elapsedSeconds: 180,
        running: true,
        lastStartedAt: 2_000,
      };
      const original = structuredClone({ teams, activeGame });
      const migrated = migrateStoredState({ version: 20, teams, activeGame });
      expect(migrated.version).toBe(INITIAL_STATE.version);
      expect(migrated.teams.u8.roster).toEqual(
        teams.u8.roster.map((player) => ({
          ...player,
          preferredRoles:
            INITIAL_STATE.teams.u8.roster.find(
              (current) => current.id === player.id,
            )?.preferredRoles ?? player.preferredRoles,
        })),
      );
      expect(migrated.teams.u8.defaultDurationMinutes).toBe(50);
      expect(migrated.teams.u12).toEqual(teams.u12);
      expect(migrated.activeGame).toEqual(activeGame);
      expect({ teams, activeGame }).toEqual(original);
      migrated.teams.u8.roster[0].preferredRoles = ["goalkeeper"];
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it.each(["u8", "u12"] as const)(
    "updates only Ollie and Henry from version 21 without changing an active %s game",
    (teamId) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      const ollie = teams.u8.roster.find((player) => player.id === "u8-p4")!;
      const henry = teams.u8.roster.find((player) => player.id === "u8-p7")!;
      ollie.preferredRoles = ["forward", "midfielder", "goalkeeper"];
      henry.preferredRoles = ["goalkeeper", "forward", "midfielder"];
      henry.name = "Henry local";
      henry.number = 99;
      henry.active = false;
      teams.u8.roster[0].preferredRoles = ["goalkeeper"];
      teams.u12.roster[0].name = "Jackson local";
      teams.u8.defaultDurationMinutes = 48;
      teams.u8.roster.push({
        id: "custom-player",
        name: "Guest roster entry",
        preferredRoles: ["defender"],
        active: true,
      });
      const team = INITIAL_STATE.teams[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster
          .filter((player) => player.active)
          .map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const keeper = teamId === "u8" ? ollie.id : "u12-p6";
      game = movePlayer(game, keeper, "gk", 1_000);
      game.startingLineup = {
        starterIds: Object.values(game.assignments),
        presentIds: [...game.presentIds],
      };
      game = fastForwardGame(game, 180, 1_000);
      game = queueSubstitutions(game, suggestSubstitutions(game, 2, team));
      const original = structuredClone({ teams, game });
      const migrated = migrateStoredState({
        version: 21,
        teams,
        activeGame: game,
      });
      expect(migrated.version).toBe(INITIAL_STATE.version);
      expect(migrated.activeGame).toEqual(game);
      expect(migrated.activeGame!.assignments.gk).toBe(keeper);
      expect(migrated.teams.u12).toEqual(teams.u12);
      expect(migrated.teams.u8.defaultDurationMinutes).toBe(50);
      expect(migrated.teams.u8.roster).toEqual(
        teams.u8.roster.map((player) => ({
          ...player,
          preferredRoles:
            player.id === ollie.id
              ? ["defender", "goalkeeper", "midfielder", "forward"]
              : player.id === henry.id
                ? ["forward", "midfielder", "goalkeeper"]
                : player.preferredRoles,
        })),
      );
      expect({ teams, game }).toEqual(original);
      migrated.teams.u8.roster.find(
        (player) => player.id === ollie.id,
      )!.preferredRoles = ["goalkeeper", "defender"];
      migrated.teams.u8.roster.find(
        (player) => player.id === henry.id,
      )!.preferredRoles = ["goalkeeper", "forward"];
      saveState(migrated);
      expect(loadState()).toEqual(migrated);
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it("adds Collier to version 18 without enrolling him in the active game", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    teams.u8.roster = teams.u8.roster.filter(
      (player) => player.id !== "u8-p10",
    );
    const game = createGame(
      teams.u8,
      "5-1-2-1",
      teams.u8.roster.map((player) => player.id),
      40,
      1_000,
    );
    const activeGame = queueSubstitutions(
      game,
      suggestSubstitutions(game, 1, teams.u8),
    );
    activeGame.clock = {
      elapsedSeconds: 120,
      running: true,
      lastStartedAt: 10_000,
    };
    const originalTeams = structuredClone(teams);
    const migrated = migrateStoredState({
      version: 18,
      teams,
      activeGame,
    });
    const collier = migrated.teams.u8.roster.at(-1)!;

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(collier).toEqual({
      id: "u8-p10",
      name: "Collier",
      number: 56,
      preferredRoles: ["defender", "midfielder", "forward"],
      active: true,
    });
    expect(migrated.teams.u8.roster.slice(0, -1)).toEqual(teams.u8.roster);
    expect(migrated.teams.u12).toEqual(teams.u12);
    expect(teams).toEqual(originalTeams);
    expect(migrated.activeGame).toEqual({
      ...activeGame,
      startingLineup: {
        starterIds: Object.values(game.assignments),
        presentIds: [...Object.values(game.assignments), ...game.benchIds],
      },
      unavailableIds: [...activeGame.unavailableIds, collier.id],
      totals: {
        ...activeGame.totals,
        [collier.id]: { fieldSeconds: 0, benchSeconds: 0 },
      },
    });
    saveState(migrated);
    expect(loadState()).toEqual(migrated);
  });

  it.each([11, 12, 13, 14, 15, 16, 17, 18])(
    "adds Collier exactly once when upgrading version %s",
    (version) => {
      const teams = structuredClone(INITIAL_STATE.teams);
      teams.u8.roster = teams.u8.roster.slice(0, 9);
      const migrated = migrateStoredState({
        version,
        teams,
        activeGame: null,
      });
      expect(migrated.teams.u8.roster).toHaveLength(10);
      expect(migrated.teams.u8.roster.at(-1)?.name).toBe("Collier");
      expect(migrateStoredState(migrated)).toEqual(migrated);
    },
  );

  it("preserves Collier's saved preferences without creating a duplicate", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    const collier = teams.u8.roster.find((player) => player.id === "u8-p10")!;
    collier.preferredRoles = ["midfielder", "forward"];
    const migrated = migrateStoredState({
      version: INITIAL_STATE.version,
      teams,
      activeGame: null,
    });
    expect(migrated.teams).toEqual(teams);
    expect(
      migrated.teams.u8.roster.filter((player) => player.id === collier.id),
    ).toEqual([collier]);
  });

  it("fills Collier's previously unset preferences without changing a game", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    const collier = teams.u8.roster.find((player) => player.id === "u8-p10")!;
    collier.preferredRoles = [];
    const game = createGame(
      teams.u8,
      "5-2-2",
      teams.u8.roster.map((player) => player.id),
      40,
      1_000,
    );
    const migrated = migrateStoredState({
      version: 19,
      teams,
      activeGame: game,
    });
    expect(
      migrated.teams.u8.roster.find((player) => player.id === collier.id),
    ).toEqual({
      ...collier,
      preferredRoles: ["defender", "midfielder", "forward"],
    });
    expect(migrated.activeGame).toEqual(game);
    expect(migrated.teams.u12).toEqual(teams.u12);
    expect(collier.preferredRoles).toEqual([]);
    expect(migrateStoredState(migrated)).toEqual(migrated);
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

    expect(migrated.version).toBe(INITIAL_STATE.version);
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
      "Collier",
    ]);
    expect(migrated.teams.u8.roster[2].active).toBe(true);
    expect(migrated.activeGame?.presentIds).toEqual(activeGame.presentIds);
    expect(migrated.activeGame?.unavailableIds).toEqual([
      "u8-p3",
      "u8-p9",
      "u8-p10",
    ]);
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

    expect(migrated.version).toBe(INITIAL_STATE.version);
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
    expect(migrated.teams.u8.defaultDurationMinutes).toBe(50);
    expect(migrated.teams.u12.defaultDurationMinutes).toBe(60);
    expect(migrated.teams.u8.defaultPeriodCount).toBe(2);
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

    expect(loadState().activeGame).toEqual({
      ...game,
      startingLineup: {
        starterIds: Object.values(game.assignments),
        presentIds: [...Object.values(game.assignments), ...game.benchIds],
      },
    });
  });

  it("persists a queued substitution plan with the active game", () => {
    const team = INITIAL_STATE.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const queued = queueSubstitutions(
      game,
      suggestSubstitutions(game, 2, team),
    );
    saveState({ ...structuredClone(INITIAL_STATE), activeGame: queued });

    expect(loadState().activeGame?.queuedSubstitutions).toEqual(
      queued.queuedSubstitutions,
    );
  });

  it("preserves game-only guest players during active-game recovery", () => {
    const team = structuredClone(INITIAL_STATE.teams.u8);
    const guest: Player = {
      id: "guest-u8-test",
      name: "Borrowed Alex",
      number: 31,
      preferredRoles: ["defender", "midfielder", "forward"],
      active: true,
      guest: true,
    };
    const gameTeam = { ...team, roster: [...team.roster, guest] };
    const game = createGame(
      gameTeam,
      "5-1-2-1",
      [...team.roster.slice(0, 4).map((player) => player.id), guest.id],
      40,
      1_000,
    );
    game.guestPlayers = [guest];
    saveState({ ...structuredClone(INITIAL_STATE), activeGame: game });

    expect(loadState().activeGame?.guestPlayers).toEqual([guest]);
    expect(loadState().activeGame?.presentIds).toContain(guest.id);
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

    expect(migrated.version).toBe(INITIAL_STATE.version);
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

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(
      migrated.teams.u8.roster.find((player) => player.name === "Simon")
        ?.number,
    ).toBe(10);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.number,
    ).toBe(82);
  });

  it("migrates version 10 rosters to include position preferences", () => {
    const oldTeams = structuredClone(INITIAL_STATE.teams);
    Object.values(oldTeams).forEach((team) => {
      team.roster.forEach((player) => {
        delete (player as Partial<typeof player>).preferredRoles;
      });
    });

    const migrated = migrateStoredState({
      version: 10,
      teams: oldTeams,
      activeGame: null,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(
      migrated.teams.u8.roster.every(
        (player) => player.preferredRoles.length >= 2,
      ),
    ).toBe(true);
    expect(
      migrated.teams.u12.roster.every(
        (player) => player.preferredRoles.length >= 2,
      ),
    ).toBe(true);
  });

  it("migrates version 11 to the current goalkeeper preferences", () => {
    const oldTeams = structuredClone(INITIAL_STATE.teams);
    oldTeams.u8.roster[0].preferredRoles = [
      "goalkeeper",
      "defender",
      "midfielder",
    ];
    oldTeams.u8.roster[5].preferredRoles = ["defender", "goalkeeper"];
    oldTeams.u8.roster[6].number = 12;
    oldTeams.u12.roster[9].preferredRoles = ["goalkeeper", "defender"];
    oldTeams.u12.roster[14].preferredRoles = [
      "goalkeeper",
      "defender",
      "midfielder",
    ];

    const migrated = migrateStoredState({
      version: 11,
      teams: oldTeams,
      activeGame: null,
    });
    const preferences = Object.fromEntries(
      migrated.teams.u8.roster.map((player) => [
        player.name,
        player.preferredRoles,
      ]),
    );

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(preferences.Maddox).toEqual(["goalkeeper", "midfielder", "forward"]);
    expect(preferences.Henry).toEqual(["forward", "midfielder", "goalkeeper"]);
    expect(preferences.Ollie).toEqual([
      "defender",
      "goalkeeper",
      "midfielder",
      "forward",
    ]);
    expect(preferences.Evan).toEqual(["goalkeeper", "forward", "midfielder"]);
    expect(
      migrated.teams.u8.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Maddox", "Ollie", "Henry", "Evan"]);
    expect(
      migrated.teams.u8.roster.find((player) => player.name === "Henry")
        ?.number,
    ).toBe(12);
    expect(
      migrated.teams.u12.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Jackson", "William", "Obasi", "Matt", "Rayek", "Jack"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.preferredRoles,
    ).toEqual(["goalkeeper", "defender", "midfielder"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Matt")
        ?.preferredRoles,
    ).toEqual(["forward", "midfielder", "goalkeeper"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "William")
        ?.preferredRoles,
    ).toEqual(["midfielder", "defender", "goalkeeper"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Rayek")
        ?.preferredRoles,
    ).toEqual(["defender", "forward", "goalkeeper", "midfielder"]);
  });

  it("migrates active version 12 games to explicit period timing", () => {
    const team = INITIAL_STATE.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    delete (game as Partial<typeof game>).period;
    delete (game as Partial<typeof game>).periodEnds;
    game.clock = {
      elapsedSeconds: 10 * 60,
      running: false,
      lastStartedAt: null,
    };
    game.periodBreak = { completedPeriod: 1, final: false };

    const migrated = migrateStoredState({
      version: 12,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: game,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(migrated.activeGame?.period).toEqual({
      current: 1,
      startedAtSeconds: 0,
    });
    expect(migrated.activeGame?.periodEnds).toEqual([
      { period: 1, atSeconds: 10 * 60 },
    ]);
  });

  it("does not infer skipped periods from elapsed time during recovery", () => {
    const team = INITIAL_STATE.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    delete (game as Partial<typeof game>).period;
    delete (game as Partial<typeof game>).periodEnds;
    game.clock = {
      elapsedSeconds: 25 * 60,
      running: true,
      lastStartedAt: 1_000,
    };

    const migrated = migrateStoredState({
      version: 14,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: game,
    });

    expect(migrated.activeGame?.period).toEqual({
      current: 1,
      startedAtSeconds: 0,
    });
    expect(migrated.activeGame?.periodEnds).toEqual([]);
  });

  it("migrates William's role order and applies the current U12 CSV", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    const william = teams.u12.roster.find(
      (player) => player.name === "William",
    )!;
    const jackson = teams.u12.roster.find(
      (player) => player.name === "Jackson",
    )!;
    william.preferredRoles = ["forward", "midfielder"];
    jackson.preferredRoles = ["defender", "goalkeeper"];

    const migrated = migrateStoredState({
      version: 14,
      teams,
      activeGame: null,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "William")
        ?.preferredRoles,
    ).toEqual(["midfielder", "defender", "goalkeeper"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.preferredRoles,
    ).toEqual(["goalkeeper", "defender", "midfielder"]);
  });

  it("migrates version 13 period starts into timeline boundaries", () => {
    const team = INITIAL_STATE.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    delete (game as Partial<typeof game>).periodEnds;
    game.period = { current: 2, startedAtSeconds: 10 * 60 + 8 };
    game.clock = {
      elapsedSeconds: 12 * 60,
      running: false,
      lastStartedAt: null,
    };

    const migrated = migrateStoredState({
      version: 13,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: game,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(migrated.activeGame?.periodEnds).toEqual([
      { period: 1, atSeconds: 10 * 60 + 8 },
    ]);
  });

  it("moves existing U8 teams to the 2-2 default without changing an active formation", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    teams.u8.defaultFormationId = "5-1-2-1";
    const activeGame = createGame(
      teams.u8,
      "5-1-2-1",
      teams.u8.roster.map((player) => player.id),
      40,
      1_000,
    );

    const migrated = migrateStoredState({
      version: 15,
      teams,
      activeGame,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(migrated.teams.u8.defaultFormationId).toBe("5-2-2");
    expect(migrated.activeGame?.formationId).toBe("5-1-2-1");
  });

  it("preserves queued goalkeeper handoffs when migrating version 16", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    const activeGame = createGame(
      teams.u8,
      "5-1-2-1",
      teams.u8.roster.map((player) => player.id),
      40,
      1_000,
    );
    const fromPositionId = "dl";
    activeGame.queuedSubstitutions = [
      {
        positionId: "gk",
        outPlayerId: activeGame.assignments.gk,
        inPlayerId: activeGame.benchIds[0],
        keeperHandoff: {
          playerId: activeGame.assignments[fromPositionId],
          fromPositionId,
        },
      },
    ];

    const migrated = migrateStoredState({
      version: 16,
      teams,
      activeGame,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(migrated.activeGame?.queuedSubstitutions?.[0].keeperHandoff).toEqual(
      activeGame.queuedSubstitutions[0].keeperHandoff,
    );
  });

  it("updates Jack's preferences and applies the current U12 CSV", () => {
    const teams = structuredClone(INITIAL_STATE.teams);
    const jack = teams.u12.roster.find((player) => player.name === "Jack")!;
    const jackson = teams.u12.roster.find(
      (player) => player.name === "Jackson",
    )!;
    jack.preferredRoles = ["forward", "midfielder"];
    jackson.preferredRoles = ["defender", "goalkeeper"];

    const migrated = migrateStoredState({
      version: 17,
      teams,
      activeGame: null,
    });

    expect(migrated.version).toBe(INITIAL_STATE.version);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jack")
        ?.preferredRoles,
    ).toEqual(["defender", "midfielder", "goalkeeper"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.preferredRoles,
    ).toEqual(["goalkeeper", "defender", "midfielder"]);
  });
});
