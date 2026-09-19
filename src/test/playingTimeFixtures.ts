import {
  INITIAL_STATE,
  addGuestPlayerToBench,
  applySubstitutions,
  createGame,
  endCurrentPeriod,
  fastForwardGame,
  setClockRunning,
  startNextPeriod,
} from "../domain";
import type { ActiveGame, Player } from "../types";

export const advanceMatchTo = (game: ActiveGame, seconds: number) => {
  const periodLength = game.durationSeconds / game.periodCount;
  while (
    game.period.current < game.periodCount &&
    seconds >= game.period.startedAtSeconds + periodLength
  ) {
    const delta =
      game.period.startedAtSeconds + periodLength - game.clock.elapsedSeconds;
    if (delta > 0) game = fastForwardGame(game, delta, 1_000);
    game = startNextPeriod(endCurrentPeriod(game, 1_000), 1_000);
  }
  const delta = seconds - game.clock.elapsedSeconds;
  return delta > 0
    ? fastForwardGame(game, delta, 1_000)
    : setClockRunning(game, false, 1_000);
};

export const lateHaruGame = (atMinutes = 30) => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u8;
  const guest: Player = {
    ...team.roster.find((player) => player.name === "Haru")!,
    id: "guest-haru",
    guest: true,
  };
  let game = createGame(
    team,
    "5-2-2",
    team.roster
      .filter((player) => player.name !== "Haru")
      .map((player) => player.id),
    50,
    1_000,
    2,
  );
  game = advanceMatchTo(game, 3 * 60);
  game = addGuestPlayerToBench(game, guest, 5, 1_000);
  const positionId = "fl";
  const originalPlayerId = game.assignments[positionId];
  game = advanceMatchTo(game, 5 * 60);
  game = applySubstitutions(
    game,
    [{ positionId, outPlayerId: originalPlayerId, inPlayerId: guest.id }],
    5,
    2_000,
  );
  game = advanceMatchTo(game, 12 * 60);
  game = applySubstitutions(
    game,
    [{ positionId, outPlayerId: guest.id, inPlayerId: originalPlayerId }],
    5,
    3_000,
  );
  game = advanceMatchTo(game, atMinutes * 60);
  state.activeGame = game;
  return { state, team, game, guest, positionId, originalPlayerId };
};
