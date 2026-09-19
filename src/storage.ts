import {
  INITIAL_STATE,
  isImmediateSubstitution,
  updateActiveGame,
} from "./domain";
import type { ActiveGame, AppState, StartingLineup, TeamId } from "./types";

export const STORAGE_KEY = "sideline-state-v1";
export const ACTIVE_GAME_KEY = "sideline-active-game";

type StoredState = Omit<Partial<AppState>, "version"> & {
  version?: number;
};

const applyCurrentRosterPreferences = (
  teams: AppState["teams"],
  teamIds: readonly TeamId[] = ["u8", "u12"],
): AppState["teams"] => {
  const nextTeams = structuredClone(teams);
  teamIds.forEach((teamId) => {
    const currentPreferences = new Map(
      INITIAL_STATE.teams[teamId].roster.map((player) => [
        player.id,
        player.preferredRoles,
      ]),
    );
    nextTeams[teamId].roster = nextTeams[teamId].roster.map((player) => ({
      ...player,
      preferredRoles: [
        ...(currentPreferences.get(player.id) ?? player.preferredRoles),
      ],
    }));
  });
  return nextTeams;
};

const applyWilliamPreferences = (
  teams: AppState["teams"],
): AppState["teams"] => {
  const nextTeams = structuredClone(teams);
  const currentWilliam = INITIAL_STATE.teams.u12.roster.find(
    (player) => player.id === "u12-p6",
  );
  nextTeams.u12.roster = nextTeams.u12.roster.map((player) =>
    player.id === currentWilliam?.id
      ? {
          ...player,
          preferredRoles: [...currentWilliam.preferredRoles],
        }
      : player,
  );
  return nextTeams;
};

const applyJackPreferences = (teams: AppState["teams"]): AppState["teams"] => {
  const nextTeams = structuredClone(teams);
  const currentJack = INITIAL_STATE.teams.u12.roster.find(
    (player) => player.id === "u12-p14",
  );
  nextTeams.u12.roster = nextTeams.u12.roster.map((player) =>
    player.id === currentJack?.id
      ? {
          ...player,
          preferredRoles: [...currentJack.preferredRoles],
        }
      : player,
  );
  return nextTeams;
};

const applyU8DefaultFormation = (
  teams: AppState["teams"],
): AppState["teams"] => ({
  ...teams,
  u8: {
    ...teams.u8,
    defaultFormationId: INITIAL_STATE.teams.u8.defaultFormationId,
  },
});

const normalizeActiveGame = (game: ActiveGame): ActiveGame => {
  const team = INITIAL_STATE.teams[game.teamId];
  const periodCount = game.periodCount ?? (game.teamId === "u8" ? 4 : 2);
  const periodLength = game.durationSeconds / periodCount;
  const legacyCompletedPeriod = game.periodBreak?.completedPeriod;
  const currentPeriod = Math.min(
    periodCount,
    Math.max(1, legacyCompletedPeriod ?? 1),
  );
  const period = game.period ?? {
    current: currentPeriod,
    startedAtSeconds: (currentPeriod - 1) * periodLength,
  };
  const completedPeriodCount =
    game.periodBreak?.completedPeriod ?? Math.max(0, period.current - 1);
  const periodEnds =
    game.periodEnds ??
    Array.from({ length: completedPeriodCount }, (_, index) => {
      const completedPeriod = index + 1;
      const atSeconds =
        game.periodBreak && completedPeriod === period.current
          ? game.clock.elapsedSeconds
          : completedPeriod === period.current - 1
            ? period.startedAtSeconds
            : completedPeriod * periodLength;
      return { period: completedPeriod, atSeconds };
    });
  const guestPlayers = (game.guestPlayers ?? []).filter(
    (player) => player.guest && player.active,
  );
  const rosterIds = [
    ...team.roster.filter((player) => player.active).map((player) => player.id),
    ...guestPlayers.map((player) => player.id),
  ];
  const rosterIdSet = new Set(rosterIds);
  const presentIds = game.presentIds.filter((id) => rosterIdSet.has(id));
  const unavailableIds = [
    ...new Set([
      ...(game.unavailableIds ?? []).filter((id) => rosterIdSet.has(id)),
      ...rosterIds.filter((id) => !presentIds.includes(id)),
    ]),
  ];
  const totals = { ...game.totals };
  rosterIds.forEach((id) => {
    totals[id] ??= { fieldSeconds: 0, benchSeconds: 0 };
  });

  return {
    ...game,
    ...(guestPlayers.length ? { guestPlayers } : {}),
    periodCount,
    period,
    periodEnds,
    presentIds,
    unavailableIds,
    totals,
    history: game.history.map((event) =>
      event.substitutionKind === undefined && isImmediateSubstitution(event)
        ? { ...event, substitutionKind: "immediate" }
        : event,
    ),
  };
};

const migratePriorState = (parsed: StoredState): AppState => {
  if (!parsed.teams?.u8 || !parsed.teams?.u12) {
    return structuredClone(INITIAL_STATE);
  }

  if (
    parsed.version === 1 ||
    parsed.version === 2 ||
    parsed.version === 3 ||
    parsed.version === 4 ||
    parsed.version === 5 ||
    parsed.version === 6 ||
    parsed.version === 7 ||
    parsed.version === 8 ||
    parsed.version === 9 ||
    parsed.version === 10
  ) {
    return {
      version: INITIAL_STATE.version,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 11) {
    return {
      version: INITIAL_STATE.version,
      teams: applyU8DefaultFormation(
        applyCurrentRosterPreferences(parsed.teams as AppState["teams"]),
      ),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 12) {
    return {
      version: INITIAL_STATE.version,
      teams: applyU8DefaultFormation(
        applyJackPreferences(
          applyWilliamPreferences(parsed.teams as AppState["teams"]),
        ),
      ),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 13) {
    return {
      version: INITIAL_STATE.version,
      teams: applyU8DefaultFormation(
        applyJackPreferences(
          applyWilliamPreferences(parsed.teams as AppState["teams"]),
        ),
      ),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 14) {
    return {
      ...(parsed as AppState),
      version: INITIAL_STATE.version,
      teams: applyU8DefaultFormation(
        applyJackPreferences(
          applyWilliamPreferences(parsed.teams as AppState["teams"]),
        ),
      ),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 15) {
    return {
      ...(parsed as AppState),
      version: INITIAL_STATE.version,
      teams: applyU8DefaultFormation(
        applyJackPreferences(parsed.teams as AppState["teams"]),
      ),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 16) {
    return {
      ...(parsed as AppState),
      version: INITIAL_STATE.version,
      teams: applyJackPreferences(parsed.teams as AppState["teams"]),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 17) {
    return {
      ...(parsed as AppState),
      version: INITIAL_STATE.version,
      teams: applyJackPreferences(parsed.teams as AppState["teams"]),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (
    parsed.version === 18 ||
    parsed.version === 19 ||
    parsed.version === 20 ||
    parsed.version === 21 ||
    parsed.version === 22 ||
    parsed.version === 23
  ) {
    return {
      ...(parsed as AppState),
      version: INITIAL_STATE.version,
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  return structuredClone(INITIAL_STATE);
};

const isStartingLineup = (value: unknown): value is StartingLineup => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("starterIds" in value) ||
    !("presentIds" in value)
  )
    return false;
  const { starterIds, presentIds } = value;
  return (
    Array.isArray(starterIds) &&
    Array.isArray(presentIds) &&
    starterIds.length > 0 &&
    starterIds.length <= 5 &&
    presentIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(presentIds).size === presentIds.length &&
    new Set(starterIds).size === starterIds.length &&
    starterIds.every((id) => presentIds.includes(id))
  );
};

const restoreStartingHistory = (state: AppState): AppState => {
  const invalidTeamHistory =
    state.teams.u8.lastStartingLineup !== undefined &&
    !isStartingLineup(state.teams.u8.lastStartingLineup);
  const invalidGameHistory =
    state.activeGame?.teamId === "u8" &&
    state.activeGame.startingLineup !== undefined &&
    !isStartingLineup(state.activeGame.startingLineup);
  const next =
    invalidTeamHistory || invalidGameHistory ? structuredClone(state) : state;
  if (invalidTeamHistory || invalidGameHistory) {
    console.warn(
      "Sideline ignored invalid U8 starting-lineup history; game data was preserved.",
    );
    if (invalidTeamHistory) delete next.teams.u8.lastStartingLineup;
    if (invalidGameHistory && next.activeGame)
      delete next.activeGame.startingLineup;
  }
  return next.activeGame ? updateActiveGame(next, next.activeGame) : next;
};

export const migrateStoredState = (parsed: StoredState): AppState => {
  let state = restoreStartingHistory(migratePriorState(parsed));
  const previousVersion = parsed.version;
  if (previousVersion !== undefined && previousVersion <= 21) {
    const preferences = new Map(
      INITIAL_STATE.teams.u8.roster
        .filter(
          (player) =>
            previousVersion <= 20 || ["u8-p4", "u8-p7"].includes(player.id),
        )
        .map((player) => [player.id, player.preferredRoles]),
    );
    state = {
      ...state,
      teams: {
        ...state.teams,
        u8: {
          ...state.teams.u8,
          roster: state.teams.u8.roster.map((player) => {
            const roles = preferences.get(player.id);
            return roles ? { ...player, preferredRoles: [...roles] } : player;
          }),
        },
      },
    };
  }
  if (previousVersion !== undefined && previousVersion <= 22) {
    state = {
      ...state,
      teams: applyCurrentRosterPreferences(state.teams, ["u12"]),
    };
  }
  const existingCollier = state.teams.u8.roster.find(
    (player) => player.id === "u8-p10",
  );
  if (existingCollier && existingCollier.preferredRoles.length > 0) {
    return state;
  }
  const collier = INITIAL_STATE.teams.u8.roster.find(
    (player) => player.id === "u8-p10",
  );
  if (!collier) throw new Error("Collier is missing from the fixed U8 roster.");
  return {
    ...state,
    teams: {
      ...state.teams,
      u8: {
        ...state.teams.u8,
        roster: existingCollier
          ? state.teams.u8.roster.map((player) =>
              player.id === collier.id
                ? { ...player, preferredRoles: [...collier.preferredRoles] }
                : player,
            )
          : [...state.teams.u8.roster, structuredClone(collier)],
      },
    },
  };
};

export const loadState = (): AppState => {
  let state = structuredClone(INITIAL_STATE);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = migrateStoredState(JSON.parse(raw) as StoredState);
  } catch (error) {
    console.error("Sideline could not load saved data.", error);
  }

  if (!state.activeGame) {
    const recoveryGame = readActiveGameRecovery();
    if (recoveryGame) state.activeGame = recoveryGame;
  }
  return restoreStartingHistory(state);
};

export const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (state.activeGame) {
    const activeGame = JSON.stringify(state.activeGame);
    localStorage.setItem(ACTIVE_GAME_KEY, activeGame);
    sessionStorage.setItem(ACTIVE_GAME_KEY, activeGame);
  } else {
    localStorage.removeItem(ACTIVE_GAME_KEY);
    sessionStorage.removeItem(ACTIVE_GAME_KEY);
  }
};

const readActiveGameRecovery = (): ActiveGame | null => {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(ACTIVE_GAME_KEY);
      if (!raw) continue;
      const game = JSON.parse(raw) as Partial<ActiveGame>;
      if (
        game.teamId &&
        game.assignments &&
        game.clock &&
        game.presentIds &&
        game.benchIds
      ) {
        return {
          ...normalizeActiveGame(game as ActiveGame),
        };
      }
    } catch (error) {
      console.error("Sideline could not recover the active game.", error);
    }
  }
  return null;
};
