import { INITIAL_STATE } from "./domain";
import type { ActiveGame, AppState } from "./types";

export const STORAGE_KEY = "sideline-state-v1";
export const ACTIVE_GAME_KEY = "sideline-active-game";

type StoredState = Omit<Partial<AppState>, "version"> & {
  version?: number;
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
    parsed.version === 6
  ) {
    return {
      version: 7,
      teams: structuredClone(INITIAL_STATE.teams),
      activeGame: parsed.activeGame
        ? {
            ...parsed.activeGame,
            periodCount:
              parsed.activeGame.periodCount ??
              (parsed.activeGame.teamId === "u8" ? 4 : 2),
          }
        : null,
    };
  }

  if (parsed.version === 7) {
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
          ...(game as ActiveGame),
          periodCount: game.periodCount ?? (game.teamId === "u8" ? 4 : 2),
        };
      }
    } catch (error) {
      console.error("Sideline could not recover the active game.", error);
    }
  }
  return null;
};
