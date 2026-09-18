export type TeamId = "u8" | "u12";

export type PositionRole = "goalkeeper" | "defender" | "midfielder" | "forward";

export type Player = {
  id: string;
  name: string;
  number?: number;
  preferredRoles: PositionRole[];
  active: boolean;
  guest?: boolean;
};

export type Team = {
  id: TeamId;
  name: string;
  ageGroup: "U8" | "U12";
  sideSize: 5 | 9;
  defaultDurationMinutes: number;
  defaultPeriodCount: 2 | 4;
  defaultFormationId: string;
  roster: Player[];
  lastStartingLineup?: StartingLineup;
};

export type StartingLineup = {
  starterIds: string[];
  presentIds: string[];
};

export type Position = {
  id: string;
  label: string;
  shortLabel: string;
  mediumLabel: string;
  x: number;
  y: number;
  role: PositionRole;
};

export type Formation = {
  id: string;
  name: string;
  sideSize: 5 | 9;
  positions: Position[];
};

export type PlayerTotals = {
  fieldSeconds: number;
  benchSeconds: number;
};

export type PlayerGameSummary = {
  playerId: string;
  totalSeconds: number;
  goals: Array<{
    atSeconds: number;
    positionId: string;
  }>;
  positions: Array<{
    positionId: string;
    seconds: number;
  }>;
};

export type ClockState = {
  elapsedSeconds: number;
  running: boolean;
  lastStartedAt: number | null;
};

export type PeriodState = {
  current: number;
  startedAtSeconds: number;
};

export type PeriodEnd = {
  period: number;
  atSeconds: number;
};

export type SubstitutionPair = {
  outPlayerId: string;
  inPlayerId: string;
  positionId: string;
  keeperHandoff?: {
    playerId: string;
    fromPositionId: string;
  };
};

export type GameEvent = {
  id: string;
  substitutionKind?: "planned" | "immediate";
  type:
    | "substitution"
    | "position-change"
    | "unavailable"
    | "available"
    | "goal-for"
    | "goal-against";
  atSeconds: number;
  pairs: SubstitutionPair[];
  playerId?: string;
  fromPositionId?: string;
  toPositionId?: string;
  note?: string;
  beforeAssignments: Record<string, string>;
  beforeBenchIds: string[];
  beforeUnavailableIds: string[];
  beforePresentIds?: string[];
  beforeQueuedSubstitutions?: SubstitutionPair[];
  beforeGuestPlayers?: Player[];
};

export type ActiveGame = {
  id: string;
  teamId: TeamId;
  startedAt: number;
  formationId: string;
  durationSeconds: number;
  periodCount: 2 | 4;
  presentIds: string[];
  unavailableIds: string[];
  assignments: Record<string, string>;
  benchIds: string[];
  clock: ClockState;
  period: PeriodState;
  periodEnds: PeriodEnd[];
  periodBreak?: {
    completedPeriod: number;
    final: boolean;
  };
  totals: Record<string, PlayerTotals>;
  history: GameEvent[];
  queuedSubstitutions?: SubstitutionPair[];
  guestPlayers?: Player[];
  startingLineup?: StartingLineup;
};

export type AppState = {
  version: 21;
  teams: Record<TeamId, Team>;
  activeGame: ActiveGame | null;
};
