import {
  INITIAL_STATE,
  applySubstitutions,
  createGame,
  fastForwardGame,
  getFormation,
  queueSubstitutions,
} from "../domain";
import type { SubstitutionPair, TeamId } from "../types";

export const keeperHandoffGame = (teamId: TeamId = "u8") => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams[teamId];
  let game = createGame(
    team,
    team.id === "u8" ? "5-1-2-1" : team.defaultFormationId,
    team.roster.map((player) => player.id),
    team.defaultDurationMinutes,
    1_000,
    2,
  );
  if (teamId === "u8") {
    game.assignments = {
      gk: "u8-p9",
      dl: "u8-p1",
      dr: "u8-p4",
      m: "u8-p6",
      f: "u8-p10",
    };
    game.benchIds = team.roster
      .map((player) => player.id)
      .filter((id) => !Object.values(game.assignments).includes(id));
    game = fastForwardGame(game, 375, 1_000);
    const incoming = ["u8-p3", "u8-p2", "u8-p7", "u8-p8", "u8-p5"];
    game = applySubstitutions(
      game,
      Object.entries(game.assignments).map(
        ([positionId, outPlayerId], index) => ({
          positionId,
          outPlayerId,
          inPlayerId: incoming[index],
        }),
      ),
      team.sideSize,
      2_000,
    );
    game = fastForwardGame(game, 750, 2_000);
  }
  const moverId = teamId === "u8" ? "u8-p7" : "u12-p6";
  const fromPositionId = Object.entries(game.assignments).find(
    ([, id]) => id === moverId,
  )![0];
  const formation = getFormation(game.formationId);
  const goalkeeperPosition = formation.positions.find(
    (position) => position.role === "goalkeeper",
  )!;
  const outgoingPositions = Object.keys(game.assignments).filter(
    (positionId) =>
      positionId !== goalkeeperPosition.id && positionId !== fromPositionId,
  );
  const pairs: SubstitutionPair[] = [
    {
      positionId: goalkeeperPosition.id,
      outPlayerId: game.assignments[goalkeeperPosition.id],
      inPlayerId: game.benchIds[0],
      keeperHandoff: { playerId: moverId, fromPositionId },
    },
    ...outgoingPositions.slice(0, 3).map((positionId, index) => ({
      positionId,
      outPlayerId: game.assignments[positionId],
      inPlayerId: game.benchIds[index + 1],
    })),
  ];
  game = queueSubstitutions(game, pairs);
  state.activeGame = game;
  return { state, team, game, pairs, moverId, fromPositionId };
};
