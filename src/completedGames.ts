import { finalizeGame } from "./domain";
import type { ActiveGame, AppState } from "./types";

export const saveCompletedGame = (
  state: AppState,
  game: ActiveGame,
  endedAt: number,
): AppState => ({
  ...state,
  activeGame: null,
  lastCompletedGames: {
    ...state.lastCompletedGames,
    [game.teamId]: {
      game: structuredClone(finalizeGame(game, endedAt)),
      team: structuredClone(state.teams[game.teamId]),
      endedAt,
    },
  },
  openSummaryTeamId: game.teamId,
});

export const closeCompletedSummary = (state: AppState): AppState => {
  const next = { ...state };
  delete next.openSummaryTeamId;
  return next;
};
