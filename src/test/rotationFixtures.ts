import {
  INITIAL_STATE,
  applySubstitutions,
  createGame,
  fastForwardGame,
} from "../domain";

export const u12ThirdRotation = () => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u12;
  const playerId = (name: string) => {
    const player = team.roster.find((item) => item.name === name);
    if (!player) throw new Error(`Missing fixture player: ${name}`);
    return player.id;
  };
  let game = createGame(
    team,
    "9-3-1-3-1",
    team.roster.map((player) => player.id),
    60,
    1_000,
    2,
  );
  game.assignments = Object.fromEntries(
    Object.entries({
      gk: "Jackson",
      dl: "John",
      dc: "William",
      dr: "Rayek",
      dm: "Jack",
      ml: "Ryan",
      mc: "Nikola",
      mr: "Eli",
      f: "Matt",
    }).map(([position, name]) => [position, playerId(name)]),
  );
  game.benchIds = game.presentIds.filter(
    (id) => !Object.values(game.assignments).includes(id),
  );
  const rotate = (seconds: number, incoming: Record<string, string>) => {
    game = fastForwardGame(game, seconds, 1_000);
    game = applySubstitutions(
      game,
      Object.entries(incoming).map(([positionId, name]) => ({
        positionId,
        outPlayerId: game.assignments[positionId],
        inPlayerId: playerId(name),
      })),
      team.sideSize,
      1_000,
    );
  };
  rotate(900, {
    dl: "Lazar",
    dr: "Obasi",
    dm: "Kai",
    ml: "Elliott",
    mc: "Andrew",
    f: "Aaron",
  });
  rotate(840, {
    gk: "Rayek",
    dc: "John",
    mr: "Jack",
    f: "Matt",
    dl: "Ryan",
    dm: "Nikola",
  });
  game = fastForwardGame(game, 842, 1_000);
  game.period = { current: 2, startedAtSeconds: 2_581 };
  state.activeGame = game;
  return { state, team, game, playerId };
};
