import { INITIAL_STATE } from "./domain";
import type { ActiveGame, AppState } from "./types";

export const STORAGE_KEY = "sideline-state-v1";
export const ACTIVE_GAME_KEY = "sideline-active-game";

type StoredState = Omit<Partial<AppState>, "version"> & {
  version?: number;
};

const normalizeActiveGame = (game: ActiveGame): ActiveGame => {
  const team = INITIAL_STATE.teams[game.teamId];
  const rosterIds = team.roster
    .filter((player) => player.active)
    .map((player) => player.id);
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
    periodCount: game.periodCount ?? (game.teamId === "u8" ? 4 : 2),
    presentIds,
    unavailableIds,
    totals,
  };
};

export const migrateStoredState = (parsed: StoredState): AppState => {
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
      version: 11,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: parsed.activeGame
        ? normalizeActiveGame(parsed.activeGame)
        : null,
    };
  }

  if (parsed.version === 11) {
    return parsed as AppState;
  }

  return structuredClone(INITIAL_STATE);
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
  return state;
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
