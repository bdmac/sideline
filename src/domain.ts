import type {
  ActiveGame,
  AppState,
  Formation,
  Player,
  PlayerTotals,
  SubstitutionPair,
  Team,
  TeamId,
} from "./types";

const position = (
  id: string,
  label: string,
  shortLabel: string,
  x: number,
  y: number,
  role: Formation["positions"][number]["role"],
) => ({ id, label, shortLabel, x, y, role });

export const FORMATIONS: Formation[] = [
  {
    id: "5-1-2-1",
    name: "1-2-1",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 90, "goalkeeper"),
      position("dl", "Center Back", "CB", 50, 66, "defender"),
      position("dr", "Left Midfielder", "LM", 30, 42, "midfielder"),
      position("m", "Right Midfielder", "RM", 70, 42, "midfielder"),
      position("f", "Striker", "ST", 50, 16, "forward"),
    ],
  },
  {
    id: "5-2-2",
    name: "2-2",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 90, "goalkeeper"),
      position("dl", "Left Back", "LB", 30, 64, "defender"),
      position("dr", "Right Back", "RB", 70, 64, "defender"),
      position("fl", "Left Striker", "LS", 30, 25, "forward"),
      position("fr", "Right Striker", "RS", 70, 25, "forward"),
    ],
  },
  {
    id: "5-1-1-2",
    name: "1-1-2",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 90, "goalkeeper"),
      position("d", "Center Back", "CB", 50, 66, "defender"),
      position("m", "Center Midfielder", "CM", 50, 46, "midfielder"),
      position("fl", "Left Striker", "LS", 30, 20, "forward"),
      position("fr", "Right Striker", "RS", 70, 20, "forward"),
    ],
  },
  {
    id: "9-3-3-2",
    name: "3-3-2",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", 20, 72, "defender"),
      position("dc", "Center Back", "CB", 50, 75, "defender"),
      position("dr", "Right Back", "RB", 80, 72, "defender"),
      position("ml", "Left Midfielder", "LM", 20, 48, "midfielder"),
      position("mc", "Center Midfielder", "CM", 50, 50, "midfielder"),
      position("mr", "Right Midfielder", "RM", 80, 48, "midfielder"),
      position("fl", "Left Striker", "LS", 36, 20, "forward"),
      position("fr", "Right Striker", "RS", 64, 20, "forward"),
    ],
  },
  {
    id: "9-3-2-3",
    name: "3-2-3",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", 20, 74, "defender"),
      position("dc", "Center Back", "CB", 50, 76, "defender"),
      position("dr", "Right Back", "RB", 80, 74, "defender"),
      position("ml", "Left Center Midfielder", "LCM", 35, 49, "midfielder"),
      position("mr", "Right Center Midfielder", "RCM", 65, 49, "midfielder"),
      position("fl", "Left Winger", "LW", 18, 20, "forward"),
      position("fc", "Striker", "ST", 50, 16, "forward"),
      position("fr", "Right Winger", "RW", 82, 20, "forward"),
    ],
  },
  {
    id: "9-2-3-3",
    name: "2-3-3",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", 32, 73, "defender"),
      position("dr", "Right Back", "RB", 68, 73, "defender"),
      position("ml", "Left Midfielder", "LM", 20, 49, "midfielder"),
      position("mc", "Center Midfielder", "CM", 50, 52, "midfielder"),
      position("mr", "Right Midfielder", "RM", 80, 49, "midfielder"),
      position("fl", "Left Winger", "LW", 18, 20, "forward"),
      position("fc", "Striker", "ST", 50, 16, "forward"),
      position("fr", "Right Winger", "RW", 82, 20, "forward"),
    ],
  },
  {
    id: "9-3-1-3-1",
    name: "3-1-3-1",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", 20, 76, "defender"),
      position("dc", "Center Back", "CB", 50, 78, "defender"),
      position("dr", "Right Back", "RB", 80, 76, "defender"),
      position("dm", "Holding Midfielder", "HM", 50, 60, "midfielder"),
      position("ml", "Left Midfielder", "LM", 20, 42, "midfielder"),
      position("mc", "Center Midfielder", "CM", 50, 44, "midfielder"),
      position("mr", "Right Midfielder", "RM", 80, 42, "midfielder"),
      position("f", "Striker", "ST", 50, 15, "forward"),
    ],
  },
];

const sampleNames = {
  u8: [
    "Simon",
    "Noah",
    "Maddox",
    "Ollie",
    "Malik",
    "Dylan",
    "Henry",
    "Haru",
    "Evan",
  ],
  u12: [
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
  ],
};

const rosterNumbers: Record<TeamId, number[]> = {
  u8: [7, 10, 14, 23, 9, 4, 16, 11, 2],
  u12: [12, 5, 17, 8, 19, 78, 6, 15, 21, 3, 13, 18, 22, 24, 30],
};

const makeRoster = (teamId: TeamId, names: string[]): Player[] =>
  names.map((name, index) => ({
    id: `${teamId}-p${index + 1}`,
    name,
    number: rosterNumbers[teamId][index],
    active: true,
  }));

export const INITIAL_TEAMS: Record<TeamId, Team> = {
  u8: {
    id: "u8",
    name: "Golden Dragons",
    ageGroup: "U8",
    sideSize: 5,
    defaultDurationMinutes: 40,
    defaultPeriodCount: 4,
    defaultFormationId: "5-1-2-1",
    roster: makeRoster("u8", sampleNames.u8),
  },
  u12: {
    id: "u12",
    name: "Fireballers",
    ageGroup: "U12",
    sideSize: 9,
    defaultDurationMinutes: 60,
    defaultPeriodCount: 2,
    defaultFormationId: "9-3-1-3-1",
    roster: makeRoster("u12", sampleNames.u12),
  },
};

export const INITIAL_STATE: AppState = {
  version: 9,
  teams: INITIAL_TEAMS,
  activeGame: null,
};

export const getFormationsForTeam = (team: Team) =>
  FORMATIONS.filter((formation) => formation.sideSize === team.sideSize).sort(
    (a, b) =>
      Number(b.id === team.defaultFormationId) -
      Number(a.id === team.defaultFormationId),
  );

export const getFormation = (formationId: string) => {
  const formation = FORMATIONS.find((item) => item.id === formationId);
  if (!formation) throw new Error(`Unknown formation: ${formationId}`);
  return formation;
};

export const validateFormation = (formation: Formation): string[] => {
  const errors: string[] = [];
  if (formation.positions.length !== formation.sideSize) {
    errors.push(
      `${formation.name} has ${formation.positions.length} positions for ${formation.sideSize}v${formation.sideSize}`,
    );
  }
  if (
    formation.positions.filter((item) => item.role === "goalkeeper").length !==
    1
  ) {
    errors.push(`${formation.name} must contain exactly one goalkeeper`);
  }
  if (
    new Set(formation.positions.map((item) => item.id)).size !==
    formation.positions.length
  ) {
    errors.push(`${formation.name} contains duplicate position IDs`);
  }
  if (
    new Set(formation.positions.map((item) => item.shortLabel)).size !==
    formation.positions.length
  ) {
    errors.push(`${formation.name} contains duplicate position labels`);
  }
  return errors;
};

export const createGame = (
  team: Team,
  formationId: string,
  presentIds: string[],
  durationMinutes: number,
  now = Date.now(),
  periodCount = team.defaultPeriodCount,
): ActiveGame => {
  const formation = getFormation(formationId);
  if (formation.sideSize !== team.sideSize) {
    throw new Error("Formation does not match this team");
  }
  const validPresent = team.roster
    .filter((player) => player.active && presentIds.includes(player.id))
    .map((player) => player.id);
  const activeRosterIds = team.roster
    .filter((player) => player.active)
    .map((player) => player.id);
  const onField = validPresent.slice(0, team.sideSize);
  const assignments = Object.fromEntries(
    formation.positions
      .slice(0, onField.length)
      .map((positionItem, index) => [positionItem.id, onField[index]]),
  );
  const totals = Object.fromEntries(
    activeRosterIds.map((id) => [id, { fieldSeconds: 0, benchSeconds: 0 }]),
  );
  return {
    id: `${team.id}-${now}`,
    teamId: team.id,
    startedAt: now,
    formationId,
    durationSeconds: Math.max(1, durationMinutes) * 60,
    periodCount,
    presentIds: validPresent,
    unavailableIds: activeRosterIds.filter((id) => !validPresent.includes(id)),
    assignments,
    benchIds: validPresent.slice(team.sideSize),
    clock: { elapsedSeconds: 0, running: false, lastStartedAt: null },
    totals,
    history: [],
  };
};

const addSeconds = (
  totals: Record<string, PlayerTotals>,
  ids: string[],
  key: keyof PlayerTotals,
  seconds: number,
) => {
  ids.forEach((id) => {
    const current = totals[id] ?? { fieldSeconds: 0, benchSeconds: 0 };
    totals[id] = { ...current, [key]: current[key] + seconds };
  });
};

export const materializeGame = (
  game: ActiveGame,
  now = Date.now(),
): ActiveGame => {
  if (!game.clock.running || game.clock.lastStartedAt === null) return game;
  const delta = Math.max(
    0,
    Math.floor((now - game.clock.lastStartedAt) / 1000),
  );
  if (delta === 0) return game;
  const totals = structuredClone(game.totals);
  addSeconds(totals, Object.values(game.assignments), "fieldSeconds", delta);
  addSeconds(totals, game.benchIds, "benchSeconds", delta);
  return {
    ...game,
    totals,
    clock: {
      ...game.clock,
      elapsedSeconds: game.clock.elapsedSeconds + delta,
      lastStartedAt: now,
    },
  };
};

export const setClockRunning = (
  game: ActiveGame,
  running: boolean,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  return {
    ...current,
    clock: {
      ...current.clock,
      running,
      lastStartedAt: running ? now : null,
    },
  };
};

export const getDisplayedSeconds = (game: ActiveGame, now = Date.now()) =>
  materializeGame(game, now).clock.elapsedSeconds;

export const getPeriodStatus = (
  durationSeconds: number,
  elapsedSeconds: number,
  periodCount: 2 | 4,
) => {
  const periodLength = durationSeconds / periodCount;
  const current = Math.min(
    periodCount,
    Math.floor(elapsedSeconds / periodLength) + 1,
  );
  const periodElapsed =
    elapsedSeconds >= durationSeconds
      ? periodLength
      : elapsedSeconds % periodLength;
  return {
    current,
    count: periodCount,
    label: periodCount === 4 ? "Quarter" : "Half",
    remainingSeconds: Math.max(0, periodLength - periodElapsed),
  };
};

export const assignPlayerToPosition = (
  assignments: Record<string, string>,
  targetPositionId: string,
  playerId: string,
) => {
  const next = { ...assignments };
  const currentPlayer = next[targetPositionId];
  const sourcePosition = Object.entries(next).find(
    ([positionId, assignedPlayerId]) =>
      positionId !== targetPositionId && assignedPlayerId === playerId,
  )?.[0];

  next[targetPositionId] = playerId;
  if (sourcePosition) {
    if (currentPlayer) next[sourcePosition] = currentPlayer;
    else delete next[sourcePosition];
  }
  return next;
};

export const suggestSubstitutions = (
  game: ActiveGame,
  count: number,
): SubstitutionPair[] => {
  const onField = Object.entries(game.assignments)
    .filter(([, playerId]) => !game.unavailableIds.includes(playerId))
    .sort(
      ([, a], [, b]) =>
        (game.totals[b]?.fieldSeconds ?? 0) -
          (game.totals[a]?.fieldSeconds ?? 0) || a.localeCompare(b),
    );
  const bench = game.benchIds
    .filter((id) => !game.unavailableIds.includes(id))
    .sort(
      (a, b) =>
        (game.totals[b]?.benchSeconds ?? 0) -
          (game.totals[a]?.benchSeconds ?? 0) ||
        (game.totals[a]?.fieldSeconds ?? 0) -
          (game.totals[b]?.fieldSeconds ?? 0) ||
        a.localeCompare(b),
    );
  return Array.from(
    { length: Math.min(Math.max(0, count), onField.length, bench.length) },
    (_, index) => ({
      positionId: onField[index][0],
      outPlayerId: onField[index][1],
      inPlayerId: bench[index],
    }),
  );
};

export const validateGame = (game: ActiveGame, sideSize: number): string[] => {
  const errors: string[] = [];
  const fieldIds = Object.values(game.assignments);
  if (new Set(fieldIds).size !== fieldIds.length) {
    errors.push("A player is assigned to more than one position");
  }
  if (fieldIds.some((id) => game.benchIds.includes(id))) {
    errors.push("A player cannot be on the field and bench");
  }
  if (fieldIds.some((id) => game.unavailableIds.includes(id))) {
    errors.push("An unavailable player cannot be on the field");
  }
  if (game.benchIds.some((id) => game.unavailableIds.includes(id))) {
    errors.push("An unavailable player cannot be on the bench");
  }
  const availableCount = game.presentIds.filter(
    (id) => !game.unavailableIds.includes(id),
  ).length;
  const expectedFieldCount = Math.min(sideSize, availableCount);
  if (fieldIds.length !== expectedFieldCount) {
    errors.push(
      `Expected ${expectedFieldCount} players on the field, found ${fieldIds.length}`,
    );
  }
  return errors;
};

export const applySubstitutions = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
  sideSize: number,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (pairs.length === 0) throw new Error("Choose at least one substitution");
  const outIds = pairs.map((pair) => pair.outPlayerId);
  const inIds = pairs.map((pair) => pair.inPlayerId);
  if (
    new Set(outIds).size !== outIds.length ||
    new Set(inIds).size !== inIds.length
  ) {
    throw new Error("Each player can only appear in one swap");
  }
  pairs.forEach((pair) => {
    if (current.assignments[pair.positionId] !== pair.outPlayerId) {
      throw new Error("Outgoing player no longer occupies that position");
    }
    if (!current.benchIds.includes(pair.inPlayerId)) {
      throw new Error("Incoming player is not available on the bench");
    }
  });
  const assignments = { ...current.assignments };
  pairs.forEach((pair) => {
    assignments[pair.positionId] = pair.inPlayerId;
  });
  const benchIds = current.benchIds
    .filter((id) => !inIds.includes(id))
    .concat(outIds);
  const next: ActiveGame = {
    ...current,
    assignments,
    benchIds,
    history: [
      ...current.history,
      {
        id: `sub-${now}`,
        type: "substitution",
        atSeconds: current.clock.elapsedSeconds,
        pairs,
        beforeAssignments: current.assignments,
        beforeBenchIds: current.benchIds,
        beforeUnavailableIds: current.unavailableIds,
        beforePresentIds: current.presentIds,
      },
    ],
  };
  const errors = validateGame(next, sideSize);
  if (errors.length) throw new Error(errors.join(". "));
  return next;
};

export const undoLastEvent = (
  game: ActiveGame,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  const event = current.history.at(-1);
  if (!event) return current;
  return {
    ...current,
    assignments: event.beforeAssignments,
    benchIds: event.beforeBenchIds,
    unavailableIds: event.beforeUnavailableIds,
    presentIds: event.beforePresentIds ?? current.presentIds,
    history: current.history.slice(0, -1),
  };
};

export const movePlayer = (
  game: ActiveGame,
  playerId: string,
  targetPositionId: string,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  const sourceEntry = Object.entries(current.assignments).find(
    ([, id]) => id === playerId,
  );
  if (!sourceEntry) throw new Error("Player is not currently on the field");
  if (
    !getFormation(current.formationId).positions.some(
      (positionItem) => positionItem.id === targetPositionId,
    )
  ) {
    throw new Error("Target position does not exist");
  }
  if (sourceEntry[0] === targetPositionId) return current;
  const targetPlayer = current.assignments[targetPositionId];
  const assignments = { ...current.assignments };
  assignments[targetPositionId] = playerId;
  if (targetPlayer) assignments[sourceEntry[0]] = targetPlayer;
  else delete assignments[sourceEntry[0]];
  return {
    ...current,
    assignments,
    history: [
      ...current.history,
      {
        id: `position-${now}`,
        type: "position-change",
        atSeconds: current.clock.elapsedSeconds,
        pairs: [],
        playerId,
        fromPositionId: sourceEntry[0],
        toPositionId: targetPositionId,
        note: targetPlayer ? "Players swapped positions" : "Player moved",
        beforeAssignments: current.assignments,
        beforeBenchIds: current.benchIds,
        beforeUnavailableIds: current.unavailableIds,
        beforePresentIds: current.presentIds,
      },
    ],
  };
};

export const markUnavailable = (
  game: ActiveGame,
  playerId: string,
  sideSize: number,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (current.unavailableIds.includes(playerId)) return current;
  const beforeAssignments = current.assignments;
  const beforeBenchIds = current.benchIds;
  const beforeUnavailableIds = current.unavailableIds;
  const assignments = { ...current.assignments };
  const fieldPosition = Object.entries(assignments).find(
    ([, id]) => id === playerId,
  )?.[0];
  let benchIds = current.benchIds.filter((id) => id !== playerId);
  let note = "Player marked unavailable";
  const pairs: SubstitutionPair[] = [];
  if (fieldPosition) {
    delete assignments[fieldPosition];
    const replacement = benchIds
      .filter((id) => !current.unavailableIds.includes(id))
      .sort(
        (a, b) =>
          (current.totals[b]?.benchSeconds ?? 0) -
          (current.totals[a]?.benchSeconds ?? 0),
      )[0];
    if (replacement) {
      assignments[fieldPosition] = replacement;
      benchIds = benchIds.filter((id) => id !== replacement);
      pairs.push({
        positionId: fieldPosition,
        outPlayerId: playerId,
        inPlayerId: replacement,
      });
      note = "Player unavailable; fairest bench player entered";
    } else {
      note = "Player unavailable; no replacement available";
    }
  }
  const next: ActiveGame = {
    ...current,
    assignments,
    benchIds,
    unavailableIds: [...current.unavailableIds, playerId],
    history: [
      ...current.history,
      {
        id: `unavailable-${now}`,
        type: "unavailable",
        atSeconds: current.clock.elapsedSeconds,
        pairs,
        playerId,
        note,
        beforeAssignments,
        beforeBenchIds,
        beforeUnavailableIds,
        beforePresentIds: current.presentIds,
      },
    ],
  };
  const errors = validateGame(next, sideSize);
  if (errors.length) throw new Error(errors.join(". "));
  return next;
};

export const markAvailable = (
  game: ActiveGame,
  playerId: string,
  sideSize: number,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (!current.unavailableIds.includes(playerId)) return current;

  const beforeAssignments = current.assignments;
  const beforeBenchIds = current.benchIds;
  const beforeUnavailableIds = current.unavailableIds;
  const beforePresentIds = current.presentIds;
  const presentIds = current.presentIds.includes(playerId)
    ? current.presentIds
    : [...current.presentIds, playerId];
  const unavailableIds = current.unavailableIds.filter((id) => id !== playerId);
  const assignments = { ...current.assignments };
  let benchIds = current.benchIds;
  let note = "Player marked available and added to bench";

  if (Object.keys(assignments).length < Math.min(sideSize, presentIds.length)) {
    const openPosition = getFormation(current.formationId).positions.find(
      (positionItem) => !assignments[positionItem.id],
    );
    if (!openPosition) throw new Error("No open position is available");
    assignments[openPosition.id] = playerId;
    note = "Player marked available and entered an open position";
  } else if (!benchIds.includes(playerId)) {
    benchIds = [...benchIds, playerId];
  }

  const next: ActiveGame = {
    ...current,
    presentIds,
    unavailableIds,
    assignments,
    benchIds,
    totals: {
      ...current.totals,
      [playerId]: current.totals[playerId] ?? {
        fieldSeconds: 0,
        benchSeconds: 0,
      },
    },
    history: [
      ...current.history,
      {
        id: `available-${now}`,
        type: "available",
        atSeconds: current.clock.elapsedSeconds,
        pairs: [],
        playerId,
        note,
        beforeAssignments,
        beforeBenchIds,
        beforeUnavailableIds,
        beforePresentIds,
      },
    ],
  };
  const errors = validateGame(next, sideSize);
  if (errors.length) throw new Error(errors.join(". "));
  return next;
};

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};
