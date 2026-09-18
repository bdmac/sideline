import { beforeEach, describe, expect, it } from "vitest";
import {
  createGame,
  INITIAL_STATE,
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

describe("persistence migrations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

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
      teams.u12.roster[0].preferredRoles = ["forward"];
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
      expect(migrated.version).toBe(21);
      expect(migrated.teams.u8.roster).toEqual(
        teams.u8.roster.map((player) => ({
          ...player,
          preferredRoles:
            INITIAL_STATE.teams.u8.roster.find(
              (current) => current.id === player.id,
            )?.preferredRoles ?? player.preferredRoles,
        })),
      );
      expect(migrated.teams.u8.defaultDurationMinutes).toBe(48);
      expect(migrated.teams.u12).toEqual(teams.u12);
      expect(migrated.activeGame).toEqual(activeGame);
      expect({ teams, activeGame }).toEqual(original);
      migrated.teams.u8.roster[0].preferredRoles = ["goalkeeper"];
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
    expect(preferences.Henry).toEqual(["goalkeeper", "forward", "midfielder"]);
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
    ).toEqual(["Jackson", "William", "Matt", "Rayek", "Jack"]);
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
    ).toEqual(["midfielder", "forward", "goalkeeper", "defender"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Rayek")
        ?.preferredRoles,
    ).toEqual(["goalkeeper", "defender", "midfielder", "forward"]);
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

  it("migrates William's role order without resetting other players", () => {
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
    ).toEqual(["midfielder", "forward", "goalkeeper", "defender"]);
    expect(
      migrated.teams.u12.roster.find((player) => player.name === "Jackson")
        ?.preferredRoles,
    ).toEqual(["defender", "goalkeeper"]);
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

  it("updates Jack's preferences without resetting another player", () => {
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
    ).toEqual(["defender", "goalkeeper"]);
  });
});
