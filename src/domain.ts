import type {
  ActiveGame,
  AppState,
  Formation,
  GameEvent,
  Player,
  PlayerGameSummary,
  PlayerTotals,
  PositionRole,
  StartingLineup,
  SubstitutionPair,
  Team,
  TeamId,
} from "./types";

const position = (
  id: string,
  label: string,
  shortLabel: string,
  mediumLabel: string,
  x: number,
  y: number,
  role: Formation["positions"][number]["role"],
) => ({ id, label, shortLabel, mediumLabel, x, y, role });

export const FORMATIONS: Formation[] = [
  {
    id: "5-2-2",
    name: "2-2",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 90, "goalkeeper"),
      position("dl", "Left Back", "LB", "Left Back", 30, 64, "defender"),
      position("dr", "Right Back", "RB", "Right Back", 70, 64, "defender"),
      position("fl", "Left Striker", "LS", "Left Striker", 30, 24, "forward"),
      position("fr", "Right Striker", "RS", "Right Striker", 70, 24, "forward"),
    ],
  },
  {
    id: "5-1-2-1",
    name: "1-2-1",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 90, "goalkeeper"),
      position("dl", "Center Back", "CB", "Center Back", 50, 66, "defender"),
      position("dr", "Left Midfielder", "LM", "Left Mid", 30, 42, "midfielder"),
      position(
        "m",
        "Right Midfielder",
        "RM",
        "Right Mid",
        70,
        42,
        "midfielder",
      ),
      position("f", "Striker", "ST", "Striker", 50, 22, "forward"),
    ],
  },
  {
    id: "5-1-1-2",
    name: "1-1-2",
    sideSize: 5,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 90, "goalkeeper"),
      position("d", "Center Back", "CB", "Center Back", 50, 66, "defender"),
      position(
        "m",
        "Center Midfielder",
        "CM",
        "Center Mid",
        50,
        46,
        "midfielder",
      ),
      position("fl", "Left Striker", "LS", "Left Striker", 30, 24, "forward"),
      position("fr", "Right Striker", "RS", "Right Striker", 70, 24, "forward"),
    ],
  },
  {
    id: "9-3-3-2",
    name: "3-3-2",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", "Left Back", 20, 72, "defender"),
      position("dc", "Center Back", "CB", "Center Back", 50, 75, "defender"),
      position("dr", "Right Back", "RB", "Right Back", 80, 72, "defender"),
      position("ml", "Left Midfielder", "LM", "Left Mid", 20, 48, "midfielder"),
      position(
        "mc",
        "Center Midfielder",
        "CM",
        "Center Mid",
        50,
        50,
        "midfielder",
      ),
      position(
        "mr",
        "Right Midfielder",
        "RM",
        "Right Mid",
        80,
        48,
        "midfielder",
      ),
      position("fl", "Left Striker", "LS", "Left Striker", 36, 23, "forward"),
      position("fr", "Right Striker", "RS", "Right Striker", 64, 23, "forward"),
    ],
  },
  {
    id: "9-3-2-3",
    name: "3-2-3",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", "Left Back", 20, 74, "defender"),
      position("dc", "Center Back", "CB", "Center Back", 50, 76, "defender"),
      position("dr", "Right Back", "RB", "Right Back", 80, 74, "defender"),
      position(
        "ml",
        "Left Center Midfielder",
        "LCM",
        "Left Center Mid",
        35,
        49,
        "midfielder",
      ),
      position(
        "mr",
        "Right Center Midfielder",
        "RCM",
        "Right Center Mid",
        65,
        49,
        "midfielder",
      ),
      position("fl", "Left Winger", "LW", "Left Wing", 18, 23, "forward"),
      position("fc", "Striker", "ST", "Striker", 50, 19, "forward"),
      position("fr", "Right Winger", "RW", "Right Wing", 82, 23, "forward"),
    ],
  },
  {
    id: "9-2-3-3",
    name: "2-3-3",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", "Left Back", 32, 73, "defender"),
      position("dr", "Right Back", "RB", "Right Back", 68, 73, "defender"),
      position("ml", "Left Midfielder", "LM", "Left Mid", 20, 49, "midfielder"),
      position(
        "mc",
        "Center Midfielder",
        "CM",
        "Center Mid",
        50,
        52,
        "midfielder",
      ),
      position(
        "mr",
        "Right Midfielder",
        "RM",
        "Right Mid",
        80,
        49,
        "midfielder",
      ),
      position("fl", "Left Winger", "LW", "Left Wing", 18, 23, "forward"),
      position("fc", "Striker", "ST", "Striker", 50, 19, "forward"),
      position("fr", "Right Winger", "RW", "Right Wing", 82, 23, "forward"),
    ],
  },
  {
    id: "9-3-1-3-1",
    name: "3-1-3-1",
    sideSize: 9,
    positions: [
      position("gk", "Goalkeeper", "GK", "Keeper", 50, 92, "goalkeeper"),
      position("dl", "Left Back", "LB", "Left Back", 20, 76, "defender"),
      position("dc", "Center Back", "CB", "Center Back", 50, 78, "defender"),
      position("dr", "Right Back", "RB", "Right Back", 80, 76, "defender"),
      position(
        "dm",
        "Holding Midfielder",
        "HM",
        "Holding Mid",
        50,
        60,
        "midfielder",
      ),
      position("ml", "Left Midfielder", "LM", "Left Mid", 20, 42, "midfielder"),
      position(
        "mc",
        "Center Midfielder",
        "CM",
        "Center Mid",
        50,
        44,
        "midfielder",
      ),
      position(
        "mr",
        "Right Midfielder",
        "RM",
        "Right Mid",
        80,
        42,
        "midfielder",
      ),
      position("f", "Striker", "ST", "Striker", 50, 20, "forward"),
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
    "Collier",
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
  u8: [10, 7, 14, 23, 9, 4, 12, 49, 2, 56],
  u12: [82, 15, 17, 8, 19, 78, 6, 11, 18, 90, 13, 21, 22, 5, 30],
};

const rosterPreferences: Record<TeamId, PositionRole[][]> = {
  u8: [
    ["forward", "midfielder", "defender"],
    ["defender", "midfielder", "forward"],
    ["goalkeeper", "midfielder", "forward"],
    ["defender", "goalkeeper", "midfielder", "forward"],
    ["forward", "midfielder"],
    ["defender", "midfielder"],
    ["forward", "midfielder", "goalkeeper"],
    ["midfielder", "defender", "forward"],
    ["goalkeeper", "forward", "midfielder"],
    ["defender", "midfielder", "forward"],
  ],
  u12: [
    ["goalkeeper", "defender", "midfielder"],
    ["defender", "midfielder"],
    ["defender", "midfielder"],
    ["midfielder", "defender"],
    ["midfielder", "defender"],
    ["midfielder", "forward", "goalkeeper", "defender"],
    ["defender", "midfielder"],
    ["midfielder", "forward"],
    ["forward", "midfielder", "goalkeeper"],
    ["forward", "midfielder", "defender"],
    ["midfielder", "forward"],
    ["midfielder", "defender", "forward"],
    ["goalkeeper", "forward", "defender", "midfielder"],
    ["defender", "midfielder", "goalkeeper"],
    ["defender", "midfielder"],
  ],
};

const makeRoster = (teamId: TeamId, names: string[]): Player[] =>
  names.map((name, index) => ({
    id: `${teamId}-p${index + 1}`,
    name,
    number: rosterNumbers[teamId][index],
    preferredRoles: rosterPreferences[teamId][index],
    active: true,
  }));

export const INITIAL_TEAMS: Record<TeamId, Team> = {
  u8: {
    id: "u8",
    name: "Golden Dragons",
    ageGroup: "U8",
    sideSize: 5,
    defaultDurationMinutes: 50,
    defaultPeriodCount: 2,
    defaultFormationId: "5-2-2",
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
  version: 25,
  teams: INITIAL_TEAMS,
  activeGame: null,
};

export const updateActiveGame = (
  state: AppState,
  game: ActiveGame,
): AppState => {
  if (
    game.teamId !== "u8" ||
    (!game.startingLineup &&
      !game.clock.running &&
      game.clock.elapsedSeconds === 0)
  ) {
    return { ...state, activeGame: game };
  }
  // Older active games have no snapshot. Events after kickoff retain the
  // lineup following any pre-game edits made at 0:00.
  const firstPlayedEvent = game.history.find((event) => event.atSeconds > 0);
  const starterIds = Object.values(
    firstPlayedEvent?.beforeAssignments ?? game.assignments,
  );
  const startingLineup = game.startingLineup ?? {
    starterIds: [...starterIds],
    presentIds: [
      ...new Set([
        ...starterIds,
        ...(firstPlayedEvent?.beforeBenchIds ?? game.benchIds),
      ]),
    ],
  };
  return {
    ...state,
    activeGame: game.startingLineup ? game : { ...game, startingLineup },
    teams: {
      ...state.teams,
      u8: { ...state.teams.u8, lastStartingLineup: startingLineup },
    },
  };
};

export const comparePlayersByNameThenNumber = (a: Player, b: Player) =>
  a.name.localeCompare(b.name) ||
  (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER);

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
    period: { current: 1, startedAtSeconds: 0 },
    periodEnds: [],
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

export const fastForwardGame = (
  game: ActiveGame,
  offsetSeconds: number,
  now = Date.now(),
): ActiveGame => {
  const delta = Math.floor(offsetSeconds);
  if (!Number.isFinite(offsetSeconds) || delta <= 0) {
    throw new Error("Fast-forward time must be greater than zero.");
  }

  const materialized = materializeGame(game, now);
  const target = materialized.clock.elapsedSeconds + delta;

  const totals = structuredClone(materialized.totals);
  addSeconds(
    totals,
    Object.values(materialized.assignments),
    "fieldSeconds",
    delta,
  );
  addSeconds(totals, materialized.benchIds, "benchSeconds", delta);

  return {
    ...materialized,
    totals,
    clock: {
      elapsedSeconds: target,
      running: false,
      lastStartedAt: null,
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
    periodBreak: running ? undefined : current.periodBreak,
    clock: {
      ...current.clock,
      running,
      lastStartedAt: running ? now : null,
    },
  };
};

export const endCurrentPeriod = (
  game: ActiveGame,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  const status = getPeriodStatus(
    current.durationSeconds,
    current.clock.elapsedSeconds,
    current.periodCount,
    current.period,
  );
  if (!status.regulationReached) {
    throw new Error(
      `${status.label} ${status.current} still has time remaining`,
    );
  }
  return {
    ...current,
    periodEnds: [
      ...current.periodEnds.filter(
        (periodEnd) => periodEnd.period !== current.period.current,
      ),
      {
        period: current.period.current,
        atSeconds: current.clock.elapsedSeconds,
      },
    ].sort((a, b) => a.period - b.period),
    periodBreak: {
      completedPeriod: current.period.current,
      final: current.period.current >= current.periodCount,
    },
    clock: {
      ...current.clock,
      running: false,
      lastStartedAt: null,
    },
  };
};

export const finalizeGame = (
  game: ActiveGame,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  return {
    ...current,
    periodEnds: [
      ...current.periodEnds.filter(
        (periodEnd) => periodEnd.period !== current.period.current,
      ),
      {
        period: current.period.current,
        atSeconds: current.clock.elapsedSeconds,
      },
    ].sort((a, b) => a.period - b.period),
    clock: {
      ...current.clock,
      running: false,
      lastStartedAt: null,
    },
  };
};

export const startNextPeriod = (
  game: ActiveGame,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (!current.periodBreak || current.periodBreak.final) {
    throw new Error("The current period must end before starting the next one");
  }
  const nextPeriod = current.periodBreak.completedPeriod + 1;
  return {
    ...current,
    period: {
      current: nextPeriod,
      startedAtSeconds: current.clock.elapsedSeconds,
    },
    periodBreak: undefined,
    clock: {
      ...current.clock,
      running: true,
      lastStartedAt: now,
    },
  };
};

export const getDisplayedSeconds = (game: ActiveGame, now = Date.now()) =>
  materializeGame(game, now).clock.elapsedSeconds;

export const getMatchClockSeconds = (
  game: ActiveGame,
  elapsedSeconds = game.clock.elapsedSeconds,
) => {
  const periodLength = game.durationSeconds / game.periodCount;
  const periodStarts = [
    { period: 1, atSeconds: 0 },
    ...game.periodEnds
      .filter((periodEnd) => game.period.current > periodEnd.period)
      .map((periodEnd) => ({
        period: periodEnd.period + 1,
        atSeconds: periodEnd.atSeconds,
      })),
  ].sort((a, b) => a.atSeconds - b.atSeconds);
  const activePeriod =
    periodStarts
      .filter((periodStart) => periodStart.atSeconds <= elapsedSeconds)
      .at(-1) ?? periodStarts[0];
  return (
    (activePeriod.period - 1) * periodLength +
    Math.max(0, elapsedSeconds - activePeriod.atSeconds)
  );
};

export const isImmediateSubstitution = (event: GameEvent) =>
  event.type === "substitution" &&
  (event.substitutionKind === "immediate" ||
    // Released versions identified immediate swaps only in their history note.
    (event.substitutionKind === undefined &&
      event.note?.startsWith("Sent immediately.") === true));

export const getSubstitutionReminderStatus = (game: ActiveGame) => {
  const rotations = game.teamId === "u8" ? 8 : 4;
  const intervalSeconds = Math.round(game.durationSeconds / rotations);
  const lastExecutedSubstitution = game.history
    .filter(
      (event) =>
        event.type === "substitution" ||
        (event.type === "unavailable" && event.pairs.length > 0),
    )
    .at(-1);
  const lastPlannedSubstitution = game.history
    .filter(
      (event) =>
        event.type === "substitution" && !isImmediateSubstitution(event),
    )
    .at(-1);
  const secondsSinceLastSubstitution = Math.max(
    0,
    game.clock.elapsedSeconds - (lastPlannedSubstitution?.atSeconds ?? 0),
  );

  return {
    cycleKey: `${game.id}:${lastPlannedSubstitution?.id ?? "start"}`,
    due: secondsSinceLastSubstitution >= intervalSeconds,
    // Personnel changes affect planning even when they do not reset cadence.
    hasExecutedSubstitution: Boolean(lastExecutedSubstitution),
    intervalSeconds,
    secondsSinceLastSubstitution,
  };
};

export const getMinimumPlayingTimePace = (game: ActiveGame): number | null => {
  const availableCount = game.presentIds.filter(
    (id) => !game.unavailableIds.includes(id),
  ).length;
  if (availableCount === 0) return null;
  const { sideSize } = getFormation(game.formationId);
  return Math.min(0.5, (4 * sideSize) / (5 * availableCount));
};

export type PlayingTimeWarning = {
  playerId: string;
  playedSeconds: number;
  availableSeconds: number;
  minimumSeconds: number;
  targetSeconds: number;
  shortfallSeconds: number;
  neededSeconds: number;
  minimumPace: number;
  urgent: boolean;
};

export const getPlayingTimeWarnings = (
  game: ActiveGame,
  ending = false,
): PlayingTimeWarning[] => {
  const minimumPace = getMinimumPlayingTimePace(game);
  if (minimumPace === null) return [];
  const remainingSeconds = ending
    ? 0
    : getPeriodStatus(
        game.durationSeconds,
        game.clock.elapsedSeconds,
        game.periodCount,
        game.period,
      ).regulationRemainingSeconds;
  const { intervalSeconds } = getSubstitutionReminderStatus(game);
  const nextRotationWait = Math.max(
    0,
    getNextSubstitutionSeconds(game) - game.clock.elapsedSeconds,
  );
  // Allow ordinary rotation-sized swings, not a new grace period after every swap.
  const rotationAllowance = (intervalSeconds + 60) * minimumPace;
  return game.presentIds
    .filter((id) => !game.unavailableIds.includes(id))
    .flatMap((playerId): PlayingTimeWarning[] => {
      const totals = game.totals[playerId];
      const playedSeconds = totals?.fieldSeconds ?? 0;
      // These counters exclude pre-arrival time, pauses, and time out of the game,
      // and remain accurate when an assignment/availability change is undone.
      const availableSeconds = playedSeconds + (totals?.benchSeconds ?? 0);
      const minimumSeconds = availableSeconds * minimumPace;
      const shortfallSeconds = Math.max(0, minimumSeconds - playedSeconds);
      if (shortfallSeconds < 1) return [];
      const targetSeconds = minimumSeconds + remainingSeconds * minimumPace;
      const neededSeconds = Math.max(0, targetSeconds - playedSeconds);
      const lastChance = remainingSeconds <= neededSeconds + 60;
      const urgent =
        lastChance ||
        (game.benchIds.includes(playerId) &&
          remainingSeconds <= neededSeconds + nextRotationWait);
      if (!ending && !lastChance && shortfallSeconds <= rotationAllowance)
        return [];
      return [
        {
          playerId,
          playedSeconds,
          availableSeconds,
          minimumSeconds,
          targetSeconds,
          shortfallSeconds,
          neededSeconds,
          minimumPace,
          urgent,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        b.shortfallSeconds - a.shortfallSeconds ||
        a.playerId.localeCompare(b.playerId),
    );
};

export const getPlayingTimePaceWarning = (
  game: ActiveGame,
  playerId: string,
): number | null =>
  getPlayingTimeWarnings(game).find((warning) => warning.playerId === playerId)
    ?.minimumPace ?? null;

export const getSubstitutionTimeBandSize = (game: ActiveGame) =>
  Math.max(
    2 * 60,
    Math.round(getSubstitutionReminderStatus(game).intervalSeconds / 5 / 60) *
      60,
  );

export const getNextSubstitutionSeconds = (game: ActiveGame) => {
  const reminder = getSubstitutionReminderStatus(game);
  const scheduledSeconds =
    game.clock.elapsedSeconds +
    Math.max(
      0,
      reminder.intervalSeconds - reminder.secondsSinceLastSubstitution,
    );
  const period = getPeriodStatus(
    game.durationSeconds,
    game.clock.elapsedSeconds,
    game.periodCount,
    game.period,
  );
  const periodEndSeconds =
    game.period.startedAtSeconds + period.periodLengthSeconds;
  if (
    period.current < period.count &&
    scheduledSeconds <= periodEndSeconds &&
    periodEndSeconds - scheduledSeconds <= getSubstitutionTimeBandSize(game)
  ) {
    return periodEndSeconds;
  }
  return scheduledSeconds;
};

export const getRoutineRotationStatus = (game: ActiveGame) => {
  const bufferSeconds = getSubstitutionTimeBandSize(game);
  const period = getPeriodStatus(
    game.durationSeconds,
    game.clock.elapsedSeconds,
    game.periodCount,
    game.period,
  );
  const secondsUntilRotation =
    getNextSubstitutionSeconds(game) - game.clock.elapsedSeconds;
  return {
    bufferSeconds,
    recommended:
      period.regulationRemainingSeconds - secondsUntilRotation > bufferSeconds,
    promptRecommended:
      !game.periodBreak &&
      period.remainingSeconds - secondsUntilRotation > bufferSeconds,
  };
};

export const getSubstitutionPlanningSnapshot = (
  game: ActiveGame,
): ActiveGame => {
  const reminder = getSubstitutionReminderStatus(game);
  if (!reminder.hasExecutedSubstitution) return game;
  const nextRotationSeconds = getNextSubstitutionSeconds(game);
  if (nextRotationSeconds === game.clock.elapsedSeconds) return game;

  return {
    ...game,
    clock: {
      ...game.clock,
      elapsedSeconds: nextRotationSeconds,
    },
  };
};

const toSubstitutionTimeBand = (seconds: number, bandSize: number) =>
  Math.floor(Math.max(0, seconds) / bandSize) * bandSize;

export const getCurrentPositionStintSeconds = (
  game: ActiveGame,
  positionId: string,
) => {
  let enteredAt = 0;
  game.history.forEach((event, index) => {
    const afterAssignments =
      game.history[index + 1]?.beforeAssignments ?? game.assignments;
    if (event.beforeAssignments[positionId] !== afterAssignments[positionId]) {
      enteredAt = event.atSeconds;
    }
  });
  return Math.max(0, game.clock.elapsedSeconds - enteredAt);
};

export const getScore = (game: ActiveGame) =>
  game.history.reduce(
    (score, event) => {
      if (event.type === "goal-for") score.us += 1;
      if (event.type === "goal-against") score.opponent += 1;
      return score;
    },
    { us: 0, opponent: 0 },
  );

export const recordGoal = (
  game: ActiveGame,
  side: "us" | "opponent",
  playerId?: string,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (!current.clock.running) {
    throw new Error("Start the clock before recording a goal");
  }
  if (side === "us") {
    if (!playerId) throw new Error("Choose the player who scored");
    if (!Object.values(current.assignments).includes(playerId)) {
      throw new Error("The scorer must be on the field");
    }
  }
  return {
    ...current,
    history: [
      ...current.history,
      {
        id: `goal-${side}-${now}`,
        type: side === "us" ? "goal-for" : "goal-against",
        atSeconds: current.clock.elapsedSeconds,
        pairs: [],
        playerId: side === "us" ? playerId : undefined,
        note: side === "us" ? "Goal scored" : "Opponent scored",
        beforeAssignments: current.assignments,
        beforeBenchIds: current.benchIds,
        beforeUnavailableIds: current.unavailableIds,
        beforePresentIds: current.presentIds,
      },
    ],
  };
};

export const getPeriodStatus = (
  durationSeconds: number,
  elapsedSeconds: number,
  periodCount: 2 | 4,
  periodState = {
    current: Math.min(
      periodCount,
      Math.floor(elapsedSeconds / (durationSeconds / periodCount)) + 1,
    ),
    startedAtSeconds:
      Math.min(
        periodCount,
        Math.floor(elapsedSeconds / (durationSeconds / periodCount)) + 1,
      ) *
        (durationSeconds / periodCount) -
      durationSeconds / periodCount,
  },
) => {
  const periodLength = durationSeconds / periodCount;
  const current = Math.min(periodCount, Math.max(1, periodState.current));
  const periodElapsed = Math.max(
    0,
    elapsedSeconds - periodState.startedAtSeconds,
  );
  const remainingSeconds = Math.max(0, periodLength - periodElapsed);
  const addedTimeSeconds = Math.max(0, periodElapsed - periodLength);
  return {
    current,
    count: periodCount,
    label: periodCount === 4 ? "Quarter" : "Half",
    periodLengthSeconds: periodLength,
    periodElapsedSeconds: periodElapsed,
    matchClockSeconds: (current - 1) * periodLength + periodElapsed,
    remainingSeconds,
    regulationRemainingSeconds:
      (periodCount - current) * periodLength + remainingSeconds,
    regulationReached: periodElapsed >= periodLength,
    addedTimeSeconds,
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

const preferenceScore = (player: Player, role: PositionRole) => {
  const preferenceIndex = player.preferredRoles.indexOf(role);
  return preferenceIndex === -1 ? 0 : (4 - preferenceIndex) * 1_000;
};

export type SubstitutionDestinationSortKey = {
  alreadyPlanned: boolean;
  preferenceIndex: number;
  currentFieldSeconds: number;
  totalFieldSeconds: number;
  formationIndex: number;
  timeBandSeconds: number;
  rotationIntervalSeconds: number;
};

const getRestPriority = (
  currentFieldSeconds: number,
  timeBandSeconds: number,
  rotationIntervalSeconds: number,
) => {
  if (currentFieldSeconds >= rotationIntervalSeconds) return 2;
  if (currentFieldSeconds < timeBandSeconds) return 0;
  return 1;
};

const destinationTotalScore = (
  totalFieldSeconds: number,
  preferenceIndex: number,
  timeBandSeconds: number,
) =>
  toSubstitutionTimeBand(totalFieldSeconds, timeBandSeconds) -
  (Number.isFinite(preferenceIndex) ? 0 : timeBandSeconds);

export const compareSubstitutionDestinations = (
  a: SubstitutionDestinationSortKey,
  b: SubstitutionDestinationSortKey,
) =>
  Number(a.alreadyPlanned) - Number(b.alreadyPlanned) ||
  getRestPriority(
    b.currentFieldSeconds,
    b.timeBandSeconds,
    b.rotationIntervalSeconds,
  ) -
    getRestPriority(
      a.currentFieldSeconds,
      a.timeBandSeconds,
      a.rotationIntervalSeconds,
    ) ||
  destinationTotalScore(
    b.totalFieldSeconds,
    b.preferenceIndex,
    b.timeBandSeconds,
  ) -
    destinationTotalScore(
      a.totalFieldSeconds,
      a.preferenceIndex,
      a.timeBandSeconds,
    ) ||
  toSubstitutionTimeBand(b.currentFieldSeconds, b.timeBandSeconds) -
    toSubstitutionTimeBand(a.currentFieldSeconds, a.timeBandSeconds) ||
  a.preferenceIndex - b.preferenceIndex ||
  b.totalFieldSeconds - a.totalFieldSeconds ||
  b.currentFieldSeconds - a.currentFieldSeconds ||
  a.formationIndex - b.formationIndex;

const REPEATED_LINE_PENALTY_SECONDS = 60;
const COMPLETE_LINE_PENALTY_SECONDS = 120;

const combinationsOf = <T>(items: T[], count: number): T[][] => {
  if (count === 0) return [[]];
  if (count > items.length) return [];

  const combinations: T[][] = [];
  items.forEach((item, index) => {
    combinationsOf(items.slice(index + 1), count - 1).forEach((rest) => {
      combinations.push([item, ...rest]);
    });
  });
  return combinations;
};

export const assignPlayersByPreference = (
  formation: Formation,
  playerIds: string[],
  roster: Player[],
  outfieldPenalties: Readonly<Record<string, number>> = {},
  selectionBonuses: Readonly<Record<string, number>> = {},
) => {
  const playerById = new Map(roster.map((player) => [player.id, player]));
  const players = playerIds
    .map((id) => playerById.get(id))
    .filter((player): player is Player => Boolean(player));
  const positions = formation.positions.slice(
    0,
    Math.min(formation.positions.length, players.length),
  );
  const memo = new Map<string, { score: number; playerIndexes: number[] }>();

  const solve = (
    positionIndex: number,
    usedMask: number,
  ): { score: number; playerIndexes: number[] } => {
    if (positionIndex === positions.length) {
      return { score: 0, playerIndexes: [] };
    }
    const key = `${positionIndex}:${usedMask}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best: { score: number; playerIndexes: number[] } | null = null;
    players.forEach((player, playerIndex) => {
      const playerBit = 1 << playerIndex;
      if (usedMask & playerBit) return;
      const rest = solve(positionIndex + 1, usedMask | playerBit);
      const candidate = {
        score:
          preferenceScore(player, positions[positionIndex].role) +
          (selectionBonuses[player.id] ?? 0) +
          (positions[positionIndex].role === "goalkeeper"
            ? 0
            : -(outfieldPenalties[player.id] ?? 0)) +
          (players.length - playerIndex) +
          rest.score,
        playerIndexes: [playerIndex, ...rest.playerIndexes],
      };
      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score &&
          candidate.playerIndexes.join(",") < best.playerIndexes.join(","))
      ) {
        best = candidate;
      }
    });

    const result = best ?? { score: 0, playerIndexes: [] };
    memo.set(key, result);
    return result;
  };

  const result = solve(0, 0);
  return Object.fromEntries(
    positions.map((positionItem, index) => [
      positionItem.id,
      players[result.playerIndexes[index]]?.id ?? "",
    ]),
  );
};

export const getStarterHistoryBonuses = (
  formation: Formation,
  previousLineup?: StartingLineup,
): Readonly<Record<string, number>> => {
  if (formation.sideSize !== 5 || !previousLineup) return {};
  // Half a preference-rank step: enough to break recurring starter ties,
  // without forcing a complete lineup change at the expense of position fit.
  return Object.fromEntries(
    previousLineup.presentIds
      .filter((id) => !previousLineup.starterIds.includes(id))
      .map((id) => [id, 500]),
  );
};

export const assignStartingPlayersByPreference = (
  formation: Formation,
  playerIds: string[],
  roster: Player[],
  previousLineup?: StartingLineup,
) => {
  const keepers = roster.filter(
    (p) => playerIds.includes(p.id) && p.preferredRoles.includes("goalkeeper"),
  );
  const rotations = formation.sideSize === 5 ? 8 : 4;
  const equalShare = formation.sideSize / Math.max(1, playerIds.length);
  // Allow an outfield start unless its first turn plus an equal share of
  // goalkeeper duty would substantially exceed the player's playing budget.
  const penalty =
    keepers.length > 1
      ? Math.max(0, 1 / keepers.length + 1 / rotations - equalShare) *
        rotations *
        2_000
      : 0;
  return assignPlayersByPreference(
    formation,
    playerIds,
    roster,
    Object.fromEntries(keepers.map((p) => [p.id, penalty])),
    getStarterHistoryBonuses(formation, previousLineup),
  );
};

export const fillStartingLineup = (
  formation: Formation,
  assignments: Record<string, string>,
  presentIds: string[],
  roster: Player[],
  previousLineup?: StartingLineup,
) => {
  const present = roster.filter(
    (player) => player.active && presentIds.includes(player.id),
  );
  const presentSet = new Set(present.map((player) => player.id));
  const clean = Object.fromEntries(
    formation.positions.map((position) => [
      position.id,
      presentSet.has(assignments[position.id]) ? assignments[position.id] : "",
    ]),
  );
  const assigned = new Set(Object.values(clean));
  if (!Object.values(clean).some(Boolean)) {
    return {
      ...clean,
      ...assignStartingPlayersByPreference(
        formation,
        present.map((player) => player.id),
        roster,
        previousLineup,
      ),
    };
  }
  return {
    ...clean,
    ...assignPlayersByPreference(
      {
        ...formation,
        positions: formation.positions.filter(
          (position) => !clean[position.id],
        ),
      },
      present
        .filter((player) => !assigned.has(player.id))
        .map((player) => player.id),
      roster,
      {},
      getStarterHistoryBonuses(formation, previousLineup),
    ),
  };
};

export const getGoalkeeperStintSeconds = (game: ActiveGame) =>
  2 * getSubstitutionReminderStatus(game).intervalSeconds;

export const getRotationTimingGraceSeconds = (game: ActiveGame) =>
  Math.round(getSubstitutionReminderStatus(game).intervalSeconds / 5);

const getMinimumRotationRestSeconds = (game: ActiveGame) =>
  getSubstitutionReminderStatus(game).intervalSeconds -
  getRotationTimingGraceSeconds(game);

export const isReadyFromBench = (
  game: ActiveGame,
  playerId: string,
  atSeconds = game.clock.elapsedSeconds,
) =>
  game.benchIds.includes(playerId) &&
  !game.unavailableIds.includes(playerId) &&
  getCurrentBenchSeconds(game, playerId) +
    Math.max(0, atSeconds - game.clock.elapsedSeconds) >=
    getMinimumRotationRestSeconds(game);

const getLastCompletedBenchSeconds = (game: ActiveGame, playerId: string) => {
  let benchStart = 0;
  let lastRest = 0;
  game.history.forEach((event, index) => {
    const afterBench = game.history[index + 1]?.beforeBenchIds ?? game.benchIds;
    const wasBenched = event.beforeBenchIds.includes(playerId);
    const isBenched = afterBench.includes(playerId);
    if (!wasBenched && isBenched) benchStart = event.atSeconds;
    if (wasBenched && !isBenched) lastRest = event.atSeconds - benchStart;
  });
  return lastRest;
};

const hasGoalkeeperRest = (
  game: ActiveGame,
  playerId: string,
  atSeconds: number,
) => {
  const delta = Math.max(0, atSeconds - game.clock.elapsedSeconds);
  if (game.benchIds.includes(playerId))
    return isReadyFromBench(game, playerId, atSeconds);
  return (
    Object.values(game.assignments).includes(playerId) &&
    getCurrentFieldSeconds(game, playerId) + delta <
      getSubstitutionTimeBandSize(game) &&
    getLastCompletedBenchSeconds(game, playerId) >=
      getMinimumRotationRestSeconds(game)
  );
};

export const getGoalkeeperChangeStatus = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
  atSeconds = game.clock.elapsedSeconds,
  team?: Team,
) => {
  const keeperPosition = getFormation(game.formationId).positions.find(
    (position) => position.role === "goalkeeper",
  )!;
  const pair = pairs.find((item) => item.positionId === keeperPosition.id);
  if (!pair) return null;
  const incomingPlayerId = pair.keeperHandoff?.playerId ?? pair.inPlayerId;
  const targetSeconds = team
    ? getBudgetedGoalkeeperStintSeconds(game, getGoalkeeperBudget(game, team))
    : getGoalkeeperStintSeconds(game);
  const graceSeconds = getRotationTimingGraceSeconds(game);
  const delta = Math.max(0, atSeconds - game.clock.elapsedSeconds);
  return {
    outgoingPlayerId: pair.outPlayerId,
    incomingPlayerId,
    targetSeconds,
    intervalSeconds: getSubstitutionReminderStatus(game).intervalSeconds,
    early:
      getCurrentPositionStintSeconds(game, keeperPosition.id) + delta <
      targetSeconds - graceSeconds,
    needsRest: !hasGoalkeeperRest(game, incomingPlayerId, atSeconds),
  };
};

const getGoalkeeperSecondsByPlayer = (game: ActiveGame) => {
  const position = getFormation(game.formationId).positions.find(
    (entry) => entry.role === "goalkeeper",
  )!;
  return new Map(
    summarizePlayerPositions(game).map((summary) => [
      summary.playerId,
      summary.positions.find((entry) => entry.positionId === position.id)
        ?.seconds ?? 0,
    ]),
  );
};

const getGoalkeeperBudget = (game: ActiveGame, team: Team) => {
  const availableIds = [
    ...new Set([...Object.values(game.assignments), ...game.benchIds]),
  ].filter((id) => !game.unavailableIds.includes(id));
  const roster = [...team.roster, ...(game.guestPlayers ?? [])];
  const goalkeeperIds = availableIds.filter((id) =>
    roster
      .find((player) => player.id === id)
      ?.preferredRoles.includes("goalkeeper"),
  );
  const intervalSeconds = getSubstitutionReminderStatus(game).intervalSeconds;
  const nominalStintSeconds = getGoalkeeperStintSeconds(game);
  const fairBudgetSeconds =
    (game.durationSeconds * getFormation(game.formationId).sideSize) /
    Math.max(1, availableIds.length);
  const outfieldTargetSeconds = Math.min(
    intervalSeconds,
    Math.max(
      0,
      fairBudgetSeconds -
        Math.max(
          nominalStintSeconds,
          game.durationSeconds / Math.max(1, goalkeeperIds.length),
        ),
    ),
  );
  const goalkeeperSecondsByPlayer = getGoalkeeperSecondsByPlayer(game);
  return {
    goalkeeperIds,
    fairBudgetSeconds,
    intervalSeconds,
    nominalStintSeconds,
    forPlayer: (id: string, additionalOutfieldSeconds = 0) => {
      const player = roster.find((entry) => entry.id === id);
      const playedSeconds =
        (game.totals[id]?.fieldSeconds ?? 0) + additionalOutfieldSeconds;
      const goalkeeperSeconds = goalkeeperSecondsByPlayer.get(id) ?? 0;
      const outfieldDeficitSeconds = Math.max(
        0,
        outfieldTargetSeconds - Math.max(0, playedSeconds - goalkeeperSeconds),
      );
      return {
        goalkeeperPreferenceScore: player
          ? preferenceScore(player, "goalkeeper")
          : 0,
        primaryGoalkeeper: player?.preferredRoles[0] === "goalkeeper",
        playedSeconds,
        goalkeeperSeconds,
        outfieldDeficitSeconds,
        remainingKeeperSeconds: Math.max(
          0,
          fairBudgetSeconds - playedSeconds - outfieldDeficitSeconds,
        ),
      };
    },
  };
};

const getBudgetedGoalkeeperStintSeconds = (
  game: ActiveGame,
  budget: ReturnType<typeof getGoalkeeperBudget>,
) => {
  const position = getFormation(game.formationId).positions.find(
    (entry) => entry.role === "goalkeeper",
  )!;
  const keeperId = game.assignments[position.id];
  const playerBudget = budget.forPlayer(keeperId);
  const stint = getCurrentPositionStintSeconds(game, position.id);
  if (playerBudget.goalkeeperSeconds <= stint && playerBudget.primaryGoalkeeper)
    return budget.nominalStintSeconds;
  // Shorten at a normal rotation, never to an extra mid-rotation stoppage.
  return Math.min(
    budget.nominalStintSeconds,
    Math.max(
      budget.intervalSeconds,
      Math.floor(
        (stint + playerBudget.remainingKeeperSeconds) / budget.intervalSeconds,
      ) * budget.intervalSeconds,
    ),
  );
};

export const getGoalkeeperPreparation = (
  game: ActiveGame,
  team: Team,
  atSeconds = game.clock.elapsedSeconds,
) => {
  const intervalSeconds = getSubstitutionReminderStatus(game).intervalSeconds;
  const budget = getGoalkeeperBudget(game, team);
  const targetSeconds = getBudgetedGoalkeeperStintSeconds(game, budget);
  const graceSeconds = getRotationTimingGraceSeconds(game);
  const delta = Math.max(0, atSeconds - game.clock.elapsedSeconds);
  const remainingSeconds = Math.max(
    0,
    getPeriodStatus(
      game.durationSeconds,
      game.clock.elapsedSeconds,
      game.periodCount,
      game.period,
    ).regulationRemainingSeconds - delta,
  );
  const formation = getFormation(game.formationId);
  const position = formation.positions.find((p) => p.role === "goalkeeper")!;
  const keeperId = game.assignments[position.id];
  const elapsedInGoal =
    getCurrentPositionStintSeconds(game, position.id) + delta;
  const dueInSeconds =
    keeperId && budget.goalkeeperIds.includes(keeperId)
      ? Math.max(0, targetSeconds - elapsedInGoal)
      : 0;
  const upcomingStintSeconds = Math.min(
    budget.nominalStintSeconds,
    Math.max(0, remainingSeconds - dueInSeconds),
  );
  const { fairBudgetSeconds } = budget;
  const band = getSubstitutionTimeBandSize(game);
  const candidates = budget.goalkeeperIds
    .filter((id) => id !== keeperId)
    .map((id) => {
      const benched = game.benchIds.includes(id);
      const futureOutfieldSeconds = benched
        ? 0
        : delta + Math.max(0, dueInSeconds - intervalSeconds);
      const playerBudget = budget.forPlayer(id, futureOutfieldSeconds);
      const stintSeconds = Math.min(
        upcomingStintSeconds,
        playerBudget.goalkeeperSeconds === 0 && playerBudget.primaryGoalkeeper
          ? budget.nominalStintSeconds
          : Math.max(
              intervalSeconds,
              Math.floor(
                playerBudget.remainingKeeperSeconds / intervalSeconds,
              ) * intervalSeconds,
            ),
      );
      return {
        id,
        benched,
        ready: hasGoalkeeperRest(game, id, atSeconds),
        playedSeconds:
          (game.totals[id]?.fieldSeconds ?? 0) + (benched ? 0 : delta),
        goalkeeperSeconds: playerBudget.goalkeeperSeconds,
        goalkeeperPreferenceScore: playerBudget.goalkeeperPreferenceScore,
        outfieldDeficitSeconds: playerBudget.outfieldDeficitSeconds,
        stintSeconds,
        projectedLoad:
          playerBudget.playedSeconds +
          stintSeconds +
          playerBudget.outfieldDeficitSeconds,
      };
    })
    .sort(
      (a, b) =>
        (dueInSeconds <= graceSeconds
          ? Number(b.ready) - Number(a.ready)
          : 0) ||
        toSubstitutionTimeBand(
          Math.max(0, a.projectedLoad - fairBudgetSeconds),
          band,
        ) -
          toSubstitutionTimeBand(
            Math.max(0, b.projectedLoad - fairBudgetSeconds),
            band,
          ) ||
        b.goalkeeperPreferenceScore - a.goalkeeperPreferenceScore ||
        toSubstitutionTimeBand(a.goalkeeperSeconds, band) -
          toSubstitutionTimeBand(b.goalkeeperSeconds, band) ||
        toSubstitutionTimeBand(a.outfieldDeficitSeconds, band) -
          toSubstitutionTimeBand(b.outfieldDeficitSeconds, band) ||
        toSubstitutionTimeBand(a.projectedLoad, band) -
          toSubstitutionTimeBand(b.projectedLoad, band) ||
        Number(b.benched) - Number(a.benched) ||
        a.goalkeeperSeconds - b.goalkeeperSeconds ||
        a.projectedLoad - b.projectedLoad ||
        a.id.localeCompare(b.id),
    );
  const successor = upcomingStintSeconds > 0 ? candidates[0] : undefined;
  const prepareNow = Boolean(
    successor && dueInSeconds <= intervalSeconds + graceSeconds,
  );
  const restPlayerId =
    prepareNow && successor && !successor.benched && !successor.ready
      ? successor.id
      : null;
  const protectedBenchId =
    successor?.benched &&
    (prepareNow ||
      successor.playedSeconds + intervalSeconds + successor.stintSeconds >
        fairBudgetSeconds + band)
      ? successor.id
      : null;
  return {
    keeperId,
    positionId: position.id,
    targetSeconds,
    intervalSeconds,
    graceSeconds,
    dueInSeconds,
    upcomingStintSeconds,
    fairBudgetSeconds,
    successorId: successor?.id ?? null,
    successorReady: successor?.ready ?? false,
    restPlayerId,
    protectedBenchId,
    due: dueInSeconds <= graceSeconds && upcomingStintSeconds > 0,
    hasBench: game.benchIds.some((id) => !game.unavailableIds.includes(id)),
    candidateIds: candidates.map((c) => c.id),
  };
};

export const getGoalkeeperPreparationWarning = (
  game: ActiveGame,
  team: Team,
) => {
  const plan = getGoalkeeperPreparation(game, team);
  if (
    plan.upcomingStintSeconds === 0 ||
    plan.dueInSeconds > plan.intervalSeconds + plan.graceSeconds
  )
    return null;
  if (!plan.successorId) {
    return "No other goalkeeper is available. Choose a willing player before the next keeper change.";
  }
  if (!plan.hasBench) {
    return "No bench is available for a rest. Use Change positions to switch goalkeepers when needed.";
  }
  const roster = [...team.roster, ...(game.guestPlayers ?? [])];
  const name =
    roster.find((p) => p.id === plan.successorId)?.name ??
    "The next goalkeeper";
  const queued = game.queuedSubstitutions ?? [];
  if (
    queued.length > 0 &&
    validateSubstitutionPairs(game, queued).length === 0
  ) {
    const rotationAt = getNextSubstitutionSeconds(game);
    const keeperChange = getGoalkeeperChangeStatus(
      game,
      queued,
      rotationAt,
      team,
    );
    if (keeperChange) {
      const incomingName =
        roster.find((p) => p.id === keeperChange.incomingPlayerId)?.name ??
        "The next goalkeeper";
      return keeperChange.needsRest &&
        !queued.some(
          (pair) =>
            pair.keeperHandoff?.playerId === keeperChange.incomingPlayerId,
        )
        ? `${incomingName} needs more bench rest before the planned goalkeeper change.`
        : null;
    }
    const incomingIds = new Set(queued.map((pair) => pair.inPlayerId));
    const outgoingIds = new Set(queued.map((pair) => pair.outPlayerId));
    const handoffAt = game.clock.elapsedSeconds + plan.dueInSeconds;
    const hasCoverage = roster.some(
      (player) =>
        player.id !== plan.keeperId &&
        player.preferredRoles.includes("goalkeeper") &&
        !game.unavailableIds.includes(player.id) &&
        !incomingIds.has(player.id) &&
        (outgoingIds.has(player.id)
          ? handoffAt - rotationAt >= getMinimumRotationRestSeconds(game)
          : hasGoalkeeperRest(game, player.id, handoffAt)),
    );
    if (hasCoverage) return null;
  }
  const queuesSuccessorOutfield = queued.some(
    (pair) =>
      pair.inPlayerId === plan.successorId &&
      pair.positionId !== plan.positionId,
  );
  if (queuesSuccessorOutfield) {
    return `${name} is lined up outfield. Keep them resting for the next keeper turn, or choose another goalkeeper.`;
  }
  if (plan.due && !plan.successorReady) {
    return `${name} needs a full bench turn before taking over. Keep the current keeper in goal until then.`;
  }
  if (
    plan.restPlayerId &&
    (plan.dueInSeconds < plan.intervalSeconds - plan.graceSeconds ||
      (queued.length > 0 &&
        !queued.some((pair) => pair.outPlayerId === plan.restPlayerId)))
  ) {
    return `Rest ${name} at the next rotation. Delay the keeper change until they have had a full bench turn.`;
  }
  return null;
};

const getIncomingCandidateOrder = (
  game: ActiveGame,
  team: Team,
  goalkeeperTimingGame = game,
  forceGoalkeeperChange = false,
) => {
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const formation = getFormation(game.formationId);
  const goalkeeperPosition = formation.positions.find(
    (positionItem) => positionItem.role === "goalkeeper",
  );
  const goalkeeperId = goalkeeperPosition
    ? game.assignments[goalkeeperPosition.id]
    : undefined;
  const isGoalkeeper = (playerId: string) =>
    team.roster
      .find((player) => player.id === playerId)
      ?.preferredRoles.includes("goalkeeper") ?? false;
  const planningAt = Math.max(
    game.clock.elapsedSeconds,
    getNextSubstitutionSeconds(goalkeeperTimingGame),
  );
  const readyBenchIds = new Set(
    game.benchIds.filter((id) => isReadyFromBench(game, id, planningAt)),
  );
  const bench = game.benchIds
    .filter((id) => !game.unavailableIds.includes(id))
    .sort(
      (a, b) =>
        Number(readyBenchIds.has(b)) - Number(readyBenchIds.has(a)) ||
        (readyBenchIds.has(a) && readyBenchIds.has(b)
          ? toSubstitutionTimeBand(
              getCurrentBenchSeconds(game, b),
              timeBandSeconds,
            ) -
            toSubstitutionTimeBand(
              getCurrentBenchSeconds(game, a),
              timeBandSeconds,
            )
          : 0) ||
        toSubstitutionTimeBand(
          game.totals[a]?.fieldSeconds ?? 0,
          timeBandSeconds,
        ) -
          toSubstitutionTimeBand(
            game.totals[b]?.fieldSeconds ?? 0,
            timeBandSeconds,
          ) ||
        toSubstitutionTimeBand(
          getCurrentBenchSeconds(game, b),
          timeBandSeconds,
        ) -
          toSubstitutionTimeBand(
            getCurrentBenchSeconds(game, a),
            timeBandSeconds,
          ) ||
        (game.totals[a]?.fieldSeconds ?? 0) -
          (game.totals[b]?.fieldSeconds ?? 0) ||
        getCurrentBenchSeconds(game, b) - getCurrentBenchSeconds(game, a) ||
        (game.totals[b]?.benchSeconds ?? 0) -
          (game.totals[a]?.benchSeconds ?? 0) ||
        a.localeCompare(b),
    );
  const keeperPlan = getGoalkeeperPreparation(
    goalkeeperTimingGame,
    team,
    planningAt,
  );
  const goalkeeperCandidate = forceGoalkeeperChange
    ? (keeperPlan.candidateIds.find(
        (id) => bench.includes(id) && readyBenchIds.has(id),
      ) ?? keeperPlan.candidateIds.find((id) => bench.includes(id)))
    : keeperPlan.successorReady && bench.includes(keeperPlan.successorId ?? "")
      ? (keeperPlan.successorId ?? undefined)
      : undefined;
  const shouldRotateGoalkeeper = Boolean(
    goalkeeperId &&
    goalkeeperCandidate &&
    (keeperPlan.due || forceGoalkeeperChange),
  );
  const goalkeeperHandoff =
    keeperPlan.due && keeperPlan.successorReady
      ? Object.entries(game.assignments).find(
          ([positionId, id]) =>
            positionId !== goalkeeperPosition?.id &&
            id === keeperPlan.successorId,
        )
      : undefined;
  let nextKeeperPlan: ReturnType<typeof getGoalkeeperPreparation> | undefined;
  if (
    shouldRotateGoalkeeper &&
    goalkeeperCandidate &&
    goalkeeperPosition &&
    goalkeeperId
  ) {
    const paused = {
      ...goalkeeperTimingGame,
      clock: { ...goalkeeperTimingGame.clock, running: false },
    };
    const delta = Math.max(
      0,
      planningAt - goalkeeperTimingGame.clock.elapsedSeconds,
    );
    const projected = delta > 0 ? fastForwardGame(paused, delta, 0) : paused;
    if (validateGame(projected, formation.sideSize).length === 0) {
      const changed = applySubstitutions(
        projected,
        [
          {
            positionId: goalkeeperPosition.id,
            outPlayerId: goalkeeperId,
            inPlayerId: goalkeeperCandidate,
          },
        ],
        formation.sideSize,
        0,
      );
      const preparation = getGoalkeeperPreparation(changed, team);
      // A one-rotation keeper turn needs its successor resting in this same batch.
      if (preparation.targetSeconds <= preparation.intervalSeconds) {
        nextKeeperPlan = preparation;
      }
    }
  }
  const outfieldKeeperPlan = nextKeeperPlan ?? keeperPlan;
  const goalkeeperBudget = getGoalkeeperBudget(goalkeeperTimingGame, team);
  const keeperRestCandidates = Object.entries(game.assignments)
    .filter(
      ([positionId, id]) =>
        positionId !== goalkeeperPosition?.id &&
        !game.unavailableIds.includes(id) &&
        isGoalkeeper(id) &&
        (!outfieldKeeperPlan.protectedBenchId ||
          toSubstitutionTimeBand(
            goalkeeperBudget.forPlayer(id).goalkeeperSeconds,
            timeBandSeconds,
          ) <=
            toSubstitutionTimeBand(
              goalkeeperBudget.forPlayer(outfieldKeeperPlan.protectedBenchId)
                .goalkeeperSeconds,
              timeBandSeconds,
            )) &&
        getCurrentFieldSeconds(game, id) +
          Math.max(0, planningAt - game.clock.elapsedSeconds) >=
          getMinimumRotationRestSeconds(game),
    )
    .map(([, id]) => id);
  const returningKeeperId =
    (!shouldRotateGoalkeeper || nextKeeperPlan !== undefined) &&
    outfieldKeeperPlan.protectedBenchId &&
    readyBenchIds.has(outfieldKeeperPlan.protectedBenchId) &&
    keeperRestCandidates.length > 0
      ? outfieldKeeperPlan.protectedBenchId
      : null;
  const preferredOutfieldBench = bench.filter(
    (id) =>
      id !== (shouldRotateGoalkeeper ? goalkeeperCandidate : undefined) &&
      (forceGoalkeeperChange ||
        id !== outfieldKeeperPlan.protectedBenchId ||
        id === returningKeeperId),
  );
  const preferredIncomingIds = [
    ...(shouldRotateGoalkeeper && goalkeeperCandidate
      ? [goalkeeperCandidate]
      : []),
    ...preferredOutfieldBench,
  ].filter(
    (playerId, index, playerIds) => playerIds.indexOf(playerId) === index,
  );
  const fallbackIncomingIds = bench.filter(
    (playerId) => !preferredIncomingIds.includes(playerId),
  );
  return {
    formation,
    goalkeeperPosition,
    goalkeeperId,
    goalkeeperCandidate,
    shouldRotateGoalkeeper,
    goalkeeperHandoff,
    restPlayerId:
      keeperPlan.restPlayerId ?? nextKeeperPlan?.restPlayerId ?? null,
    returningKeeperId,
    keeperRestCandidates,
    readyIncomingIds: preferredIncomingIds.filter((id) =>
      readyBenchIds.has(id),
    ),
    preferredIncomingCount: preferredIncomingIds.length,
    incomingIds: [...preferredIncomingIds, ...fallbackIncomingIds],
  };
};

const getSubstitutionCapacity = (
  game: ActiveGame,
  goalkeeperPositionId: string | undefined,
  rotatesGoalkeeper: boolean,
) =>
  Math.min(
    game.benchIds.filter((id) => !game.unavailableIds.includes(id)).length,
    Object.entries(game.assignments).filter(
      ([positionId, playerId]) =>
        !game.unavailableIds.includes(playerId) &&
        (positionId !== goalkeeperPositionId || rotatesGoalkeeper),
    ).length,
  );

export const getMaxSubstitutionCount = (game: ActiveGame, team: Team) => {
  const { goalkeeperPosition, shouldRotateGoalkeeper } =
    getIncomingCandidateOrder(
      getSubstitutionPlanningSnapshot(game),
      team,
      game,
    );
  return getSubstitutionCapacity(
    game,
    goalkeeperPosition?.id,
    shouldRotateGoalkeeper,
  );
};

export const suggestSubstitutions = (
  game: ActiveGame,
  count: number,
  team: Team,
  options: { allowEarlyKeeperChange?: boolean } = {},
): SubstitutionPair[] => {
  const goalkeeperTimingGame = game;
  const fullTeamRotation =
    (options.allowEarlyKeeperChange ||
      !getSubstitutionReminderStatus(game).hasExecutedSubstitution) &&
    count >= Object.keys(game.assignments).length &&
    game.benchIds.filter((id) => !game.unavailableIds.includes(id)).length >=
      Object.keys(game.assignments).length;
  game = getSubstitutionPlanningSnapshot(game);
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const rotationIntervalSeconds =
    getSubstitutionReminderStatus(game).intervalSeconds;
  const {
    formation,
    goalkeeperPosition,
    goalkeeperId,
    goalkeeperCandidate,
    shouldRotateGoalkeeper,
    goalkeeperHandoff,
    restPlayerId,
    returningKeeperId,
    keeperRestCandidates,
    incomingIds: orderedIncomingIds,
  } = getIncomingCandidateOrder(
    game,
    team,
    goalkeeperTimingGame,
    fullTeamRotation,
  );
  const substitutionCount = Math.min(
    Math.max(0, count),
    getSubstitutionCapacity(
      game,
      goalkeeperPosition?.id,
      shouldRotateGoalkeeper,
    ),
    orderedIncomingIds.length,
  );
  const incomingIds = orderedIncomingIds.slice(0, substitutionCount);
  const roleByPosition = new Map(
    formation.positions.map((positionItem) => [
      positionItem.id,
      positionItem.role,
    ]),
  );
  const goalkeeperPair =
    shouldRotateGoalkeeper &&
    goalkeeperPosition &&
    goalkeeperId &&
    goalkeeperCandidate &&
    incomingIds.includes(goalkeeperCandidate)
      ? {
          positionId: goalkeeperPosition.id,
          outPlayerId: goalkeeperId,
          inPlayerId: goalkeeperCandidate,
        }
      : null;
  const usesGoalkeeperHandoff =
    !goalkeeperPair &&
    Boolean(
      goalkeeperPosition &&
      goalkeeperId &&
      goalkeeperHandoff &&
      incomingIds.length,
    );
  const remainingIncomingIds = incomingIds.filter(
    (playerId) => playerId !== goalkeeperPair?.inPlayerId,
  );
  const incomingPlayers = remainingIncomingIds
    .map((id) => team.roster.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));
  const rankedOnField = Object.entries(game.assignments)
    .filter(([, playerId]) => !game.unavailableIds.includes(playerId))
    .filter(([positionId]) => positionId !== goalkeeperPosition?.id)
    .filter(
      ([positionId]) =>
        !usesGoalkeeperHandoff || positionId !== goalkeeperHandoff?.[0],
    )
    .sort(([positionA, playerA], [positionB, playerB]) => {
      const playerACurrentSeconds = getCurrentFieldSeconds(game, playerA);
      const playerBCurrentSeconds = getCurrentFieldSeconds(game, playerB);
      const restPriorityDifference =
        getRestPriority(
          playerBCurrentSeconds,
          timeBandSeconds,
          rotationIntervalSeconds,
        ) -
        getRestPriority(
          playerACurrentSeconds,
          timeBandSeconds,
          rotationIntervalSeconds,
        );
      if (restPriorityDifference) return restPriorityDifference;
      const totalDifference =
        toSubstitutionTimeBand(
          game.totals[playerB]?.fieldSeconds ?? 0,
          timeBandSeconds,
        ) -
        toSubstitutionTimeBand(
          game.totals[playerA]?.fieldSeconds ?? 0,
          timeBandSeconds,
        );
      if (totalDifference) return totalDifference;
      const fitA = Math.max(
        ...incomingPlayers.map((player) =>
          preferenceScore(player, roleByPosition.get(positionA)!),
        ),
        0,
      );
      const fitB = Math.max(
        ...incomingPlayers.map((player) =>
          preferenceScore(player, roleByPosition.get(positionB)!),
        ),
        0,
      );
      return (
        fitB - fitA ||
        toSubstitutionTimeBand(playerBCurrentSeconds, timeBandSeconds) -
          toSubstitutionTimeBand(playerACurrentSeconds, timeBandSeconds) ||
        (game.totals[playerB]?.fieldSeconds ?? 0) -
          (game.totals[playerA]?.fieldSeconds ?? 0) ||
        playerBCurrentSeconds - playerACurrentSeconds ||
        playerA.localeCompare(playerB)
      );
    });
  const roleCounts = new Map<PositionRole, number>();
  rankedOnField.forEach(([positionId]) => {
    const role = roleByPosition.get(positionId)!;
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  });
  const playerById = new Map(team.roster.map((player) => [player.id, player]));
  const ordinarySelectionCount =
    remainingIncomingIds.length - (usesGoalkeeperHandoff ? 1 : 0);
  const needsReplacementKeeperRest =
    returningKeeperId !== null && incomingIds.includes(returningKeeperId);
  const selections = combinationsOf(
    rankedOnField,
    ordinarySelectionCount,
  ).filter(
    (entries) =>
      !needsReplacementKeeperRest ||
      entries.some(([, id]) => keeperRestCandidates.includes(id)),
  );
  const onField =
    selections.reduce<
      | {
          entries: Array<[string, string]>;
          preparesKeeper: number;
          restDueCount: number;
          freshCount: number;
          totalScore: number;
          currentScore: number;
          adjustmentScore: number;
          preference: number;
          exactTotalScore: number;
          exactCurrentScore: number;
          key: string;
        }
      | undefined
    >((best, entries) => {
      const selectedRoleCounts = new Map<PositionRole, number>();
      const assignmentEntries = usesGoalkeeperHandoff
        ? [goalkeeperHandoff!, ...entries]
        : entries;
      const selectedPositions = assignmentEntries
        .map(([positionId]) =>
          formation.positions.find((item) => item.id === positionId),
        )
        .filter((item): item is Formation["positions"][number] =>
          Boolean(item),
        );
      selectedPositions.forEach((positionItem) => {
        selectedRoleCounts.set(
          positionItem.role,
          (selectedRoleCounts.get(positionItem.role) ?? 0) + 1,
        );
      });
      const linePenalty = [...selectedRoleCounts].reduce(
        (penalty, [role, selectedCount]) =>
          penalty +
          Math.max(0, selectedCount - 1) * REPEATED_LINE_PENALTY_SECONDS +
          ((roleCounts.get(role) ?? 0) > 1 &&
          selectedCount === roleCounts.get(role)
            ? COMPLETE_LINE_PENALTY_SECONDS
            : 0),
        0,
      );
      const assignments = assignPlayersByPreference(
        { ...formation, positions: selectedPositions },
        remainingIncomingIds,
        team.roster,
      );
      const candidate = {
        entries,
        preparesKeeper: Number(entries.some(([, id]) => id === restPlayerId)),
        restDueCount: entries.filter(
          ([, playerId]) =>
            getRestPriority(
              getCurrentFieldSeconds(game, playerId),
              timeBandSeconds,
              rotationIntervalSeconds,
            ) === 2,
        ).length,
        freshCount: entries.filter(
          ([, playerId]) =>
            getRestPriority(
              getCurrentFieldSeconds(game, playerId),
              timeBandSeconds,
              rotationIntervalSeconds,
            ) === 0,
        ).length,
        totalScore:
          entries.reduce(
            (total, [, playerId]) =>
              total +
              toSubstitutionTimeBand(
                game.totals[playerId]?.fieldSeconds ?? 0,
                timeBandSeconds,
              ),
            0,
          ) -
          selectedPositions.reduce((penalty, positionItem) => {
            const player = playerById.get(assignments[positionItem.id]);
            return (
              penalty +
              (player?.preferredRoles.includes(positionItem.role)
                ? 0
                : timeBandSeconds)
            );
          }, 0),
        currentScore: entries.reduce(
          (total, [, playerId]) =>
            total +
            toSubstitutionTimeBand(
              getCurrentFieldSeconds(game, playerId),
              timeBandSeconds,
            ),
          0,
        ),
        adjustmentScore: -linePenalty,
        preference: selectedPositions.reduce((total, positionItem) => {
          const player = playerById.get(assignments[positionItem.id]);
          return (
            total + (player ? preferenceScore(player, positionItem.role) : 0)
          );
        }, 0),
        exactTotalScore: entries.reduce(
          (total, [, playerId]) =>
            total + (game.totals[playerId]?.fieldSeconds ?? 0),
          0,
        ),
        exactCurrentScore: entries.reduce(
          (total, [, playerId]) =>
            total + getCurrentFieldSeconds(game, playerId),
          0,
        ),
        key: entries.map(([positionId]) => positionId).join(","),
      };
      if (!best) return candidate;
      const rankingDifferences = [
        candidate.preparesKeeper - best.preparesKeeper,
        candidate.restDueCount - best.restDueCount,
        best.freshCount - candidate.freshCount,
        candidate.totalScore - best.totalScore,
        candidate.currentScore - best.currentScore,
        candidate.adjustmentScore - best.adjustmentScore,
        candidate.preference - best.preference,
        candidate.exactTotalScore - best.exactTotalScore,
        candidate.exactCurrentScore - best.exactCurrentScore,
        best.key.localeCompare(candidate.key),
      ];
      if (rankingDifferences.find((difference) => difference !== 0)! > 0) {
        return candidate;
      }
      return best;
    }, undefined)?.entries ?? [];
  const selectedPositions: Formation = {
    ...formation,
    positions: [
      ...(usesGoalkeeperHandoff ? [goalkeeperHandoff!] : []),
      ...onField,
    ]
      .map(([positionId]) =>
        formation.positions.find((item) => item.id === positionId),
      )
      .filter((positionItem): positionItem is Formation["positions"][number] =>
        Boolean(positionItem),
      ),
  };
  const incomingAssignments = assignPlayersByPreference(
    selectedPositions,
    remainingIncomingIds,
    team.roster,
  );

  return [
    ...(goalkeeperPair ? [goalkeeperPair] : []),
    ...(usesGoalkeeperHandoff && goalkeeperPosition && goalkeeperId
      ? [
          {
            positionId: goalkeeperPosition.id,
            outPlayerId: goalkeeperId,
            inPlayerId: incomingAssignments[goalkeeperHandoff![0]],
            keeperHandoff: {
              playerId: goalkeeperHandoff![1],
              fromPositionId: goalkeeperHandoff![0],
            },
          },
        ]
      : []),
    ...onField.map(([positionId, outPlayerId]) => ({
      positionId,
      outPlayerId,
      inPlayerId: incomingAssignments[positionId],
    })),
  ];
};

export const reassignIncomingSubstitution = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
  pairIndex: number,
  inPlayerId: string,
  team: Team,
): SubstitutionPair[] => {
  const currentPair = pairs[pairIndex];
  if (!currentPair || currentPair.inPlayerId === inPlayerId) return pairs;

  const existingPairIndex = pairs.findIndex(
    (pair, index) => index !== pairIndex && pair.inPlayerId === inPlayerId,
  );
  if (existingPairIndex === -1) {
    return pairs.map((pair, index) =>
      index === pairIndex ? { ...pair, inPlayerId } : pair,
    );
  }

  const reassignedPairs = pairs.map((pair, index) =>
    index === pairIndex ? { ...pair, inPlayerId } : pair,
  );
  const usedIncomingIds = new Set(
    reassignedPairs
      .filter((_, index) => index !== existingPairIndex)
      .map((pair) => pair.inPlayerId),
  );
  const pairToRefill = reassignedPairs[existingPairIndex];
  const candidateGame: ActiveGame = {
    ...game,
    assignments: {
      [pairToRefill.positionId]: pairToRefill.outPlayerId,
    },
    benchIds: game.benchIds.filter(
      (playerId) => !usedIncomingIds.has(playerId),
    ),
  };
  const targetPosition = getFormation(game.formationId).positions.find(
    (position) =>
      position.id ===
      (pairToRefill.keeperHandoff?.fromPositionId ?? pairToRefill.positionId),
  );
  if (!targetPosition) return pairs;
  const { incomingIds } = getIncomingCandidateOrder(candidateGame, team);
  const recommendedPlayerId = assignPlayersByPreference(
    {
      ...getFormation(game.formationId),
      positions: [targetPosition],
    },
    incomingIds,
    team.roster,
  )[targetPosition.id];

  if (!recommendedPlayerId) return pairs;
  return reassignedPairs.map((pair, index) =>
    index === existingPairIndex
      ? { ...pair, inPlayerId: recommendedPlayerId }
      : pair,
  );
};

export const reassignOutgoingSubstitution = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
  pairIndex: number,
  outPlayerId: string,
): SubstitutionPair[] => {
  const currentPair = pairs[pairIndex];
  if (!currentPair || currentPair.outPlayerId === outPlayerId) return pairs;

  const positionId = Object.entries(game.assignments).find(
    ([, assignedPlayerId]) => assignedPlayerId === outPlayerId,
  )?.[0];
  if (!positionId) return pairs;

  const existingPairIndex = pairs.findIndex(
    (pair, index) => index !== pairIndex && pair.outPlayerId === outPlayerId,
  );
  if (existingPairIndex === -1) {
    return pairs.map((pair, index) =>
      index === pairIndex ? { ...pair, outPlayerId, positionId } : pair,
    );
  }

  return pairs.map((pair, index) => {
    if (index === pairIndex) {
      return { ...pair, outPlayerId, positionId };
    }
    if (index === existingPairIndex) {
      return {
        ...pair,
        outPlayerId: currentPair.outPlayerId,
        positionId: currentPair.positionId,
      };
    }
    return pair;
  });
};

export const getRecommendedSubstitutionCount = (
  game: ActiveGame,
  team: Team,
) => {
  if (!getRoutineRotationStatus(game).recommended) return 0;
  const maxCount = getMaxSubstitutionCount(game, team);
  if (maxCount === 0) return 0;
  const goalkeeperTimingGame = game;
  game = getSubstitutionPlanningSnapshot(game);
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const {
    goalkeeperCandidate: requiredGoalkeeper,
    shouldRotateGoalkeeper,
    incomingIds,
    preferredIncomingCount,
    readyIncomingIds,
  } = getIncomingCandidateOrder(game, team, goalkeeperTimingGame);
  const goalkeeperConstrainedMax = Math.min(maxCount, preferredIncomingCount);
  const eligibleIncomingIds = incomingIds.slice(0, goalkeeperConstrainedMax);
  const requiredIncomingIds =
    shouldRotateGoalkeeper && requiredGoalkeeper ? [requiredGoalkeeper] : [];
  const cohortCandidates = eligibleIncomingIds.filter(
    (playerId) => !requiredIncomingIds.includes(playerId),
  );
  let cohortCount = cohortCandidates.length;
  const readyPrefixCount = cohortCandidates.reduce(
    (count, id, index) => (readyIncomingIds.includes(id) ? index + 1 : count),
    0,
  );
  for (let index = 0; index < cohortCandidates.length - 1; index += 1) {
    const currentPlayerId = cohortCandidates[index];
    const nextPlayerId = cohortCandidates[index + 1];
    const playedGap =
      toSubstitutionTimeBand(
        game.totals[nextPlayerId]?.fieldSeconds ?? 0,
        timeBandSeconds,
      ) -
      toSubstitutionTimeBand(
        game.totals[currentPlayerId]?.fieldSeconds ?? 0,
        timeBandSeconds,
      );
    const sittingGap =
      toSubstitutionTimeBand(
        getCurrentBenchSeconds(game, currentPlayerId),
        timeBandSeconds,
      ) -
      toSubstitutionTimeBand(
        getCurrentBenchSeconds(game, nextPlayerId),
        timeBandSeconds,
      );
    if (
      playedGap >= timeBandSeconds * 2 ||
      (playedGap <= timeBandSeconds && sittingGap >= timeBandSeconds * 2)
    ) {
      cohortCount = index + 1;
      break;
    }
  }
  return Math.min(
    goalkeeperConstrainedMax,
    requiredIncomingIds.length +
      Math.max(cohortCandidates.length ? 1 : 0, cohortCount, readyPrefixCount),
  );
};

export const getCurrentBenchSeconds = (game: ActiveGame, playerId: string) => {
  if (!game.benchIds.includes(playerId)) return 0;
  let enteredBenchAt = 0;
  game.history.forEach((event, index) => {
    const afterBenchIds =
      game.history[index + 1]?.beforeBenchIds ?? game.benchIds;
    if (
      !event.beforeBenchIds.includes(playerId) &&
      afterBenchIds.includes(playerId)
    ) {
      enteredBenchAt = event.atSeconds;
    }
  });
  return Math.max(0, game.clock.elapsedSeconds - enteredBenchAt);
};

export const getCurrentFieldSeconds = (game: ActiveGame, playerId: string) => {
  if (!Object.values(game.assignments).includes(playerId)) return 0;
  let enteredFieldAt = 0;
  game.history.forEach((event, index) => {
    const afterAssignments =
      game.history[index + 1]?.beforeAssignments ?? game.assignments;
    if (
      !Object.values(event.beforeAssignments).includes(playerId) &&
      Object.values(afterAssignments).includes(playerId)
    ) {
      enteredFieldAt = event.atSeconds;
    }
  });
  return Math.max(0, game.clock.elapsedSeconds - enteredFieldAt);
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

export const validateSubstitutionPairs = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
): string[] => {
  const errors: string[] = [];
  if (pairs.length === 0) {
    errors.push("Choose at least one substitution");
    return errors;
  }
  const outIds = pairs.map((pair) => pair.outPlayerId);
  const inIds = pairs.map((pair) => pair.inPlayerId);
  if (new Set(outIds).size !== outIds.length) {
    errors.push("Each outgoing player can only appear once");
  }
  if (new Set(inIds).size !== inIds.length) {
    errors.push("Each incoming player can only appear once");
  }
  pairs.forEach((pair) => {
    if (game.assignments[pair.positionId] !== pair.outPlayerId) {
      errors.push("An outgoing player no longer occupies the planned position");
    }
    if (!game.benchIds.includes(pair.inPlayerId)) {
      errors.push("An incoming player is no longer available on the bench");
    }
    if (pair.keeperHandoff) {
      if (
        pair.keeperHandoff.fromPositionId === pair.positionId ||
        game.assignments[pair.keeperHandoff.fromPositionId] !==
          pair.keeperHandoff.playerId
      ) {
        errors.push("The planned goalkeeper handoff is no longer available");
      }
      if (
        pairs.some(
          (otherPair) =>
            otherPair !== pair &&
            (otherPair.positionId === pair.keeperHandoff!.fromPositionId ||
              otherPair.outPlayerId === pair.keeperHandoff!.playerId),
        )
      ) {
        errors.push(
          "A goalkeeper handoff player cannot also leave in the same plan",
        );
      }
    }
  });
  return [...new Set(errors)];
};

export const queueSubstitutions = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
): ActiveGame => {
  const errors = validateSubstitutionPairs(game, pairs);
  if (errors.length) throw new Error(errors.join(". "));
  return {
    ...game,
    queuedSubstitutions: pairs.map((pair) => ({ ...pair })),
  };
};

const getBenchSubstitution = (
  game: ActiveGame,
  inPlayerId: string,
  outPlayerId: string,
): SubstitutionPair => {
  if (!game.benchIds.includes(inPlayerId)) {
    throw new Error("Incoming player is no longer available on the bench");
  }
  const positionId = Object.entries(game.assignments).find(
    ([, playerId]) => playerId === outPlayerId,
  )?.[0];
  if (!positionId) {
    throw new Error("Outgoing player is no longer on the field");
  }
  return { inPlayerId, outPlayerId, positionId };
};

export const previewBenchSubstitution = (
  game: ActiveGame,
  inPlayerId: string,
  outPlayerId: string,
): { pairs: SubstitutionPair[]; removedPlayerIds: string[] } => {
  const pair = getBenchSubstitution(game, inPlayerId, outPlayerId);
  const existingPairs = game.queuedSubstitutions ?? [];
  const nextPairs = existingPairs.filter(
    (existing) =>
      existing.inPlayerId !== inPlayerId &&
      existing.outPlayerId !== outPlayerId &&
      existing.positionId !== pair.positionId,
  );
  nextPairs.push(pair);
  const playerIds = (pairs: SubstitutionPair[]) =>
    pairs.flatMap((item) => [
      item.inPlayerId,
      item.outPlayerId,
      ...(item.keeperHandoff ? [item.keeperHandoff.playerId] : []),
    ]);
  const retainedIds = new Set(playerIds(nextPairs));
  return {
    pairs: nextPairs,
    removedPlayerIds: [...new Set(playerIds(existingPairs))].filter(
      (id) => !retainedIds.has(id),
    ),
  };
};

export const queueBenchSubstitution = (
  game: ActiveGame,
  inPlayerId: string,
  outPlayerId: string,
): ActiveGame =>
  queueSubstitutions(
    game,
    previewBenchSubstitution(game, inPlayerId, outPlayerId).pairs,
  );

export const removeQueuedSubstitution = (
  game: ActiveGame,
  inPlayerId: string,
): ActiveGame => {
  const existingPairs = game.queuedSubstitutions ?? [];
  const nextPairs = existingPairs.filter(
    (pair) => pair.inPlayerId !== inPlayerId,
  );
  if (nextPairs.length === existingPairs.length) {
    throw new Error("Player is not in the queued substitution plan");
  }
  return {
    ...game,
    queuedSubstitutions: nextPairs.length ? nextPairs : undefined,
  };
};

export const removeQueuedSubstitutionForOutgoing = (
  game: ActiveGame,
  outPlayerId: string,
): ActiveGame => {
  const existingPairs = game.queuedSubstitutions ?? [];
  const nextPairs = existingPairs.filter(
    (pair) => pair.outPlayerId !== outPlayerId,
  );
  if (nextPairs.length === existingPairs.length) {
    throw new Error("Player is not in the queued substitution plan");
  }
  return {
    ...game,
    queuedSubstitutions: nextPairs.length ? nextPairs : undefined,
  };
};

export const cancelQueuedSubstitutions = (game: ActiveGame): ActiveGame => {
  return { ...game, queuedSubstitutions: undefined };
};

export const applySubstitutions = (
  game: ActiveGame,
  pairs: SubstitutionPair[],
  sideSize: number,
  now = Date.now(),
  options: { kind?: GameEvent["substitutionKind"] } = {},
): ActiveGame => {
  const current = materializeGame(game, now);
  const pairErrors = validateSubstitutionPairs(current, pairs);
  if (pairErrors.length) throw new Error(pairErrors.join(". "));
  const outIds = pairs.map((pair) => pair.outPlayerId);
  const inIds = pairs.map((pair) => pair.inPlayerId);
  const assignments = { ...current.assignments };
  pairs.forEach((pair) => {
    if (pair.keeperHandoff) {
      assignments[pair.positionId] = pair.keeperHandoff.playerId;
      assignments[pair.keeperHandoff.fromPositionId] = pair.inPlayerId;
    } else {
      assignments[pair.positionId] = pair.inPlayerId;
    }
  });
  const benchIds = current.benchIds
    .filter((id) => !inIds.includes(id))
    .concat(outIds);
  const next: ActiveGame = {
    ...current,
    assignments,
    benchIds,
    queuedSubstitutions: undefined,
    history: [
      ...current.history,
      {
        id: `sub-${now}`,
        type: "substitution",
        substitutionKind: options.kind ?? "planned",
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

export const applyImmediateSubstitution = (
  game: ActiveGame,
  inPlayerId: string,
  outPlayerId: string,
  team: Team,
  now = Date.now(),
): ActiveGame => {
  if (game.teamId !== team.id) {
    throw new Error("The substitution must use the active game's team");
  }
  const pair = getBenchSubstitution(game, inPlayerId, outPlayerId);
  const next = applySubstitutions(game, [pair], team.sideSize, now, {
    kind: "immediate",
  });
  const previousPlan = game.queuedSubstitutions ?? [];
  const remainingCount = Math.max(0, previousPlan.length - 1);
  const planningGame = {
    ...next,
    benchIds: next.benchIds.filter((id) => id !== outPlayerId),
  };
  const count = remainingCount
    ? Math.min(
        remainingCount,
        getRecommendedSubstitutionCount(planningGame, team),
      )
    : 0;
  const refreshedPairs = count
    ? suggestSubstitutions(planningGame, count, team)
    : [];
  const refreshed = refreshedPairs.length
    ? queueSubstitutions(next, refreshedPairs)
    : next;
  const note = previousPlan.length
    ? refreshedPairs.length
      ? `Sent immediately. Refreshed the remaining plan with ${refreshedPairs.length} ${
          refreshedPairs.length === 1 ? "substitution" : "substitutions"
        }.`
      : "Sent immediately. No substitutions remain in the plan."
    : "Sent immediately. No plan was created.";
  return {
    ...refreshed,
    history: next.history.map((event, index) =>
      index === next.history.length - 1
        ? {
            ...event,
            note,
            beforeQueuedSubstitutions: structuredClone(previousPlan),
          }
        : event,
    ),
  };
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
    queuedSubstitutions: event.beforeQueuedSubstitutions
      ? event.beforeQueuedSubstitutions.length
        ? event.beforeQueuedSubstitutions
        : undefined
      : current.queuedSubstitutions,
    guestPlayers: event.beforeGuestPlayers ?? current.guestPlayers,
    history: current.history.slice(0, -1),
  };
};

export const summarizePlayerPositions = (
  game: ActiveGame,
): PlayerGameSummary[] => {
  const formation = getFormation(game.formationId);
  const secondsByPlayer = new Map<string, Map<string, number>>();
  const addInterval = (
    assignments: Record<string, string>,
    durationSeconds: number,
  ) => {
    if (durationSeconds <= 0) return;
    Object.entries(assignments).forEach(([positionId, playerId]) => {
      const positions = secondsByPlayer.get(playerId) ?? new Map();
      positions.set(
        positionId,
        (positions.get(positionId) ?? 0) + durationSeconds,
      );
      secondsByPlayer.set(playerId, positions);
    });
  };

  let previousSeconds = 0;
  game.history.forEach((event) => {
    const eventSeconds = Math.min(
      game.clock.elapsedSeconds,
      Math.max(previousSeconds, event.atSeconds),
    );
    addInterval(event.beforeAssignments, eventSeconds - previousSeconds);
    previousSeconds = eventSeconds;
  });
  addInterval(game.assignments, game.clock.elapsedSeconds - previousSeconds);

  return game.presentIds.map((playerId) => {
    const positionSeconds = secondsByPlayer.get(playerId) ?? new Map();
    const goals = game.history
      .filter(
        (event) => event.type === "goal-for" && event.playerId === playerId,
      )
      .map((event) => ({
        atSeconds: event.atSeconds,
        positionId:
          Object.entries(event.beforeAssignments).find(
            ([, assignedPlayerId]) => assignedPlayerId === playerId,
          )?.[0] ?? "",
      }))
      .filter((goal) => goal.positionId);
    return {
      playerId,
      totalSeconds: game.totals[playerId]?.fieldSeconds ?? 0,
      goals,
      positions: formation.positions
        .map((positionItem) => ({
          positionId: positionItem.id,
          seconds: positionSeconds.get(positionItem.id) ?? 0,
        }))
        .filter(
          (positionItem) =>
            positionItem.seconds > 0 ||
            goals.some((goal) => goal.positionId === positionItem.positionId),
        ),
    };
  });
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
  const queuedSubstitutions = current.queuedSubstitutions?.map((pair) => {
    const currentPositionId = Object.entries(assignments).find(
      ([, assignedPlayerId]) => assignedPlayerId === pair.outPlayerId,
    )?.[0];
    return currentPositionId
      ? { ...pair, positionId: currentPositionId }
      : { ...pair };
  });
  return {
    ...current,
    assignments,
    queuedSubstitutions,
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
        beforeQueuedSubstitutions: current.queuedSubstitutions?.map((pair) => ({
          ...pair,
        })),
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
  let note = "Player taken out of game";
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
      note = "Player left game; fairest bench player entered";
    } else {
      note = "Player left game; no replacement available";
    }
  }
  const queuedSubstitutions = current.queuedSubstitutions
    ?.filter(
      (pair) =>
        benchIds.includes(pair.inPlayerId) &&
        assignments[pair.positionId] === pair.outPlayerId,
    )
    .map((pair) => ({ ...pair }));
  const next: ActiveGame = {
    ...current,
    assignments,
    benchIds,
    unavailableIds: [...current.unavailableIds, playerId],
    queuedSubstitutions: queuedSubstitutions?.length
      ? queuedSubstitutions
      : undefined,
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
        beforeQueuedSubstitutions: current.queuedSubstitutions?.map((pair) => ({
          ...pair,
        })),
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
  let note = "Player added to game and joined the bench";

  if (Object.keys(assignments).length < Math.min(sideSize, presentIds.length)) {
    const openPosition = getFormation(current.formationId).positions.find(
      (positionItem) => !assignments[positionItem.id],
    );
    if (!openPosition) throw new Error("No open position is available");
    assignments[openPosition.id] = playerId;
    note = "Player added to game and entered an open position";
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

export const addGuestPlayer = (
  game: ActiveGame,
  player: Player,
  positionId: string,
  sideSize: number,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  const formation = getFormation(current.formationId);
  if (!player.guest) throw new Error("Guest player is not marked as a guest");
  if (!formation.positions.some((position) => position.id === positionId)) {
    throw new Error("Choose a valid open position");
  }
  if (current.assignments[positionId]) {
    throw new Error("That position is no longer open");
  }
  if (
    current.presentIds.includes(player.id) ||
    current.guestPlayers?.some((guest) => guest.id === player.id)
  ) {
    throw new Error("That guest player is already in the game");
  }

  const next: ActiveGame = {
    ...current,
    guestPlayers: [...(current.guestPlayers ?? []), { ...player }],
    presentIds: [...current.presentIds, player.id],
    assignments: { ...current.assignments, [positionId]: player.id },
    totals: {
      ...current.totals,
      [player.id]: { fieldSeconds: 0, benchSeconds: 0 },
    },
    history: [
      ...current.history,
      {
        id: `guest-${now}`,
        type: "available",
        atSeconds: current.clock.elapsedSeconds,
        pairs: [],
        playerId: player.id,
        note: "Guest player joined an open position",
        beforeAssignments: current.assignments,
        beforeBenchIds: current.benchIds,
        beforeUnavailableIds: current.unavailableIds,
        beforePresentIds: current.presentIds,
        beforeGuestPlayers: current.guestPlayers ?? [],
      },
    ],
  };
  const errors = validateGame(next, sideSize);
  if (errors.length) throw new Error(errors.join(". "));
  return next;
};

export const addGuestPlayerToBench = (
  game: ActiveGame,
  player: Player,
  sideSize: number,
  now = Date.now(),
): ActiveGame => {
  const current = materializeGame(game, now);
  if (!player.guest) throw new Error("Guest player is not marked as a guest");
  if (
    current.presentIds.includes(player.id) ||
    current.guestPlayers?.some((guest) => guest.id === player.id)
  ) {
    throw new Error("That guest player is already in the game");
  }

  const next: ActiveGame = {
    ...current,
    guestPlayers: [...(current.guestPlayers ?? []), { ...player }],
    presentIds: [...current.presentIds, player.id],
    benchIds: [...current.benchIds, player.id],
    totals: {
      ...current.totals,
      [player.id]: { fieldSeconds: 0, benchSeconds: 0 },
    },
    history: [
      ...current.history,
      {
        id: `guest-bench-${now}`,
        type: "available",
        atSeconds: current.clock.elapsedSeconds,
        pairs: [],
        playerId: player.id,
        note: "Guest player joined the bench",
        beforeAssignments: current.assignments,
        beforeBenchIds: current.benchIds,
        beforeUnavailableIds: current.unavailableIds,
        beforePresentIds: current.presentIds,
        beforeGuestPlayers: current.guestPlayers ?? [],
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
