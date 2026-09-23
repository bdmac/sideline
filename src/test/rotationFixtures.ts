import {
  INITIAL_STATE,
  applySubstitutions,
  assignStartingPlayersByPreference,
  createGame,
  fastForwardGame,
  getFormation,
  getRecommendedSubstitutionCount,
  getSubstitutionReminderStatus,
  suggestSubstitutions,
} from "../domain";
import type { Player } from "../types";

export const u12ThirdRotation = () => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u12;
  // Preserve the preferences from the recorded game, not today's roster.
  const recordedPreferences: Record<string, Player["preferredRoles"]> = {
    Jackson: ["goalkeeper", "defender", "midfielder"],
    Lazar: ["defender", "midfielder"],
    Nikola: ["defender", "midfielder"],
    Kai: ["midfielder", "defender"],
    Elliott: ["midfielder", "defender"],
    William: ["midfielder", "forward", "goalkeeper", "defender"],
    Obasi: ["defender", "midfielder"],
    Andrew: ["midfielder", "forward"],
    Matt: ["forward", "midfielder", "goalkeeper"],
    John: ["forward", "midfielder", "defender"],
    Eli: ["midfielder", "forward"],
    Aaron: ["midfielder", "defender", "forward"],
    Rayek: ["goalkeeper", "forward", "defender", "midfielder"],
    Jack: ["defender", "midfielder", "goalkeeper"],
    Ryan: ["defender", "midfielder"],
  };
  team.roster.forEach((player) => {
    const roles = recordedPreferences[player.name];
    if (!roles) throw new Error(`Missing fixture preferences: ${player.name}`);
    player.preferredRoles = [...roles];
    player.active = true;
  });
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

export const u8RepeatKeeperRotation = (
  durationMinutes = 40,
  {
    removeOllie = true,
    henryOutfieldFirst = false,
    turns = 6,
  }: {
    removeOllie?: boolean;
    henryOutfieldFirst?: boolean;
    turns?: number;
  } = {},
) => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u8;
  const ollie = team.roster.find((player) => player.name === "Ollie")!;
  ollie.preferredRoles = removeOllie
    ? ["forward", "midfielder"]
    : ["forward", "midfielder", "goalkeeper"];
  const henry = team.roster.find((player) => player.name === "Henry")!;
  henry.preferredRoles = henryOutfieldFirst
    ? ["forward", "midfielder", "goalkeeper"]
    : ["goalkeeper", "forward", "midfielder"];
  let game = createGame(
    team,
    team.defaultFormationId,
    team.roster.map((player) => player.id),
    durationMinutes,
    1_000,
    4,
  );
  game.assignments = assignStartingPlayersByPreference(
    getFormation(game.formationId),
    game.presentIds,
    team.roster,
  );
  game.benchIds = game.presentIds.filter(
    (id) => !Object.values(game.assignments).includes(id),
  );
  const interval = getSubstitutionReminderStatus(game).intervalSeconds;
  for (let turn = 1; turn <= turns; turn++) {
    const now = 1_000 + turn * interval * 1_000;
    game = fastForwardGame(game, interval, now);
    const current = Math.floor(turn / 2) + 1;
    game.period = {
      current,
      startedAtSeconds: (current - 1) * interval * 2,
    };
    const pairs = suggestSubstitutions(
      game,
      getRecommendedSubstitutionCount(game, team),
      team,
    );
    game = applySubstitutions(game, pairs, team.sideSize, now);
  }
  state.activeGame = game;
  return { state, team, game, interval };
};
