import { describe, expect, it } from "vitest";
import type { Player, TeamId } from "./types";
import {
  addGuestPlayer,
  addGuestPlayerToBench,
  applySubstitutions,
  assignPlayerToPosition,
  assignPlayersByPreference,
  assignStartingPlayersByPreference,
  comparePlayersByNameThenNumber,
  compareSubstitutionDestinations,
  createGame,
  endCurrentPeriod,
  fastForwardGame,
  FORMATIONS,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getFormation,
  getFormationsForTeam,
  getGoalkeeperPreparation,
  getGoalkeeperStintSeconds,
  getMatchClockSeconds,
  getMaxSubstitutionCount,
  getMinimumPlayingTimePace,
  getNextSubstitutionSeconds,
  getPeriodStatus,
  getPlayingTimePaceWarning,
  getRecommendedSubstitutionCount,
  getScore,
  getSubstitutionPlanningSnapshot,
  getSubstitutionReminderStatus,
  getSubstitutionTimeBandSize,
  INITIAL_TEAMS,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  previewBenchSubstitution,
  queueBenchSubstitution,
  queueSubstitutions,
  reassignIncomingSubstitution,
  reassignOutgoingSubstitution,
  recordGoal,
  removeQueuedSubstitution,
  removeQueuedSubstitutionForOutgoing,
  setClockRunning,
  startNextPeriod,
  suggestSubstitutions,
  summarizePlayerPositions,
  undoLastEvent,
  validateFormation,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";

describe("minimum playing-time pace", () => {
  const createPaceGame = (teamId: TeamId, count: number, duration?: number) => {
    const source = INITIAL_TEAMS[teamId];
    const team = { ...source, roster: [...source.roster] };
    while (team.roster.length < count) {
      team.roster.push({
        ...source.roster[0],
        id: `extra-${team.roster.length}`,
      });
    }
    return createGame(
      team,
      team.defaultFormationId,
      team.roster.slice(0, count).map((player) => player.id),
      duration ?? team.defaultDurationMinutes,
      1_000,
    );
  };

  it.each([
    { teamId: "u8", count: 10, floor: 0.4 },
    { teamId: "u8", count: 9, floor: 4 / 9 },
    { teamId: "u8", count: 8, floor: 0.5 },
    { teamId: "u8", count: 7, floor: 0.5 },
    { teamId: "u8", count: 5, floor: 0.5 },
    { teamId: "u8", count: 4, floor: 0.5 },
    { teamId: "u12", count: 15, floor: 0.48 },
    { teamId: "u12", count: 14, floor: 0.5 },
    { teamId: "u12", count: 12, floor: 0.5 },
    { teamId: "u12", count: 18, floor: 0.4 },
  ] as const)(
    "uses actual $teamId attendance of $count, including the goalkeeper",
    ({ teamId, count, floor }) => {
      const game = createPaceGame(teamId, count);
      const before = structuredClone(game);
      expect(getMinimumPlayingTimePace(game)).toBe(floor);
      expect(game).toEqual(before);
    },
  );

  it.each([
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 360,
      played: 0,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 600,
      played: 0,
      warn: true,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2400,
      played: 1080,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2400,
      played: 1020,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2400,
      played: 960,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2400,
      played: 959,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2460,
      played: 984,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2460,
      played: 983,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 40,
      elapsed: 2460,
      played: 923,
      warn: true,
    },
    {
      teamId: "u8",
      count: 9,
      duration: 40,
      elapsed: 900,
      played: 400,
      warn: false,
    },
    {
      teamId: "u8",
      count: 9,
      duration: 40,
      elapsed: 900,
      played: 399,
      warn: false,
    },
    {
      teamId: "u8",
      count: 7,
      duration: 40,
      elapsed: 2400,
      played: 1200,
      warn: false,
    },
    {
      teamId: "u8",
      count: 7,
      duration: 40,
      elapsed: 2400,
      played: 1199,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 80,
      elapsed: 660,
      played: 0,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 80,
      elapsed: 4800,
      played: 1920,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 80,
      elapsed: 4800,
      played: 1919,
      warn: false,
    },
    {
      teamId: "u8",
      count: 10,
      duration: 80,
      elapsed: 4800,
      played: 1859,
      warn: true,
    },
    {
      teamId: "u12",
      count: 15,
      duration: 60,
      elapsed: 900,
      played: 0,
      warn: false,
    },
    {
      teamId: "u12",
      count: 15,
      duration: 60,
      elapsed: 960,
      played: 0,
      warn: false,
    },
    {
      teamId: "u12",
      count: 15,
      duration: 60,
      elapsed: 961,
      played: 0,
      warn: true,
    },
    {
      teamId: "u12",
      count: 15,
      duration: 60,
      elapsed: 3600,
      played: 1728,
      warn: false,
    },
    {
      teamId: "u12",
      count: 15,
      duration: 60,
      elapsed: 3600,
      played: 1727,
      warn: false,
    },
    {
      teamId: "u12",
      count: 14,
      duration: 60,
      elapsed: 3600,
      played: 1800,
      warn: false,
    },
    {
      teamId: "u12",
      count: 14,
      duration: 60,
      elapsed: 3600,
      played: 1799,
      warn: false,
    },
  ] as const)(
    "handles $teamId/$count, $duration minutes, $elapsed elapsed and $played played",
    ({ teamId, count, duration, elapsed, played, warn }) => {
      const game = createPaceGame(teamId, count, duration);
      const id = game.benchIds[0];
      game.clock.elapsedSeconds = elapsed;
      if (elapsed >= game.durationSeconds) {
        game.period = {
          current: game.periodCount,
          startedAtSeconds:
            (game.durationSeconds * (game.periodCount - 1)) / game.periodCount,
        };
      }
      game.totals[id] = {
        fieldSeconds: played,
        benchSeconds: elapsed - played,
      };
      const before = structuredClone(game);
      expect(getPlayingTimePaceWarning(game, id)).toBe(
        warn ? getMinimumPlayingTimePace(game) : null,
      );
      expect(
        getPlayingTimePaceWarning(game, Object.values(game.assignments)[0]!),
      ).toBeNull();
      expect(getPlayingTimePaceWarning(game, "absent-player")).toBeNull();
      expect(game).toEqual(before);
    },
  );

  it.each(["u8", "u12"] as const)(
    "recalculates %s attendance for injuries, returns, and guests",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      const initialCount = team.roster.length;
      let game = createPaceGame(teamId, initialCount);
      const id = game.benchIds[0];
      game.clock.elapsedSeconds = game.durationSeconds / 2;
      game = markUnavailable(game, id, team.sideSize, 1_000);
      expect(getMinimumPlayingTimePace(game)).toBe(
        Math.min(0.5, (4 * team.sideSize) / (5 * (initialCount - 1))),
      );
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
      game = markAvailable(game, id, team.sideSize, 1_000);
      expect(getMinimumPlayingTimePace(game)).toBe(
        Math.min(0.5, (4 * team.sideSize) / (5 * initialCount)),
      );
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
      const guest = { ...team.roster[0], id: "late-guest", guest: true };
      game = addGuestPlayerToBench(game, guest, team.sideSize, 1_000);
      expect(getMinimumPlayingTimePace(game)).toBe(
        Math.min(0.5, (4 * team.sideSize) / (5 * (initialCount + 1))),
      );
      expect(getPlayingTimePaceWarning(game, guest.id)).toBeNull();
      expect(validateGame(game, team.sideSize)).toEqual([]);
      for (const playerId of [...game.presentIds]) {
        game = markUnavailable(game, playerId, team.sideSize, 1_000, {
          replacementPlayerId: game.benchIds[0],
        });
      }
      expect(getMinimumPlayingTimePace(game)).toBeNull();
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
    },
  );

  it.each(["u8", "u12"] as const)(
    "keeps ordinary alternating %s rotations quiet until accumulated time falls behind",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      let game = createPaceGame(teamId, team.sideSize * 2);
      const id = game.benchIds[0];
      const { intervalSeconds } = getSubstitutionReminderStatus(game);
      for (let turn = 0; turn < 2; turn++) {
        game = fastForwardGame(game, intervalSeconds, 1_000);
        game = applySubstitutions(
          game,
          Object.entries(game.assignments).map(
            ([positionId, outPlayerId], index) => ({
              positionId,
              outPlayerId,
              inPlayerId: game.benchIds[index],
            }),
          ),
          team.sideSize,
          1_000,
        );
      }
      game = fastForwardGame(game, intervalSeconds, 1_000);
      expect(
        game.totals[id].fieldSeconds / game.clock.elapsedSeconds,
      ).toBeLessThan(0.4);
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
      game = fastForwardGame(game, 60, 1_000);
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
      game = fastForwardGame(game, 1, 1_000);
      expect(getPlayingTimePaceWarning(game, id)).toBeNull();
      game = fastForwardGame(game, intervalSeconds, 1_000);
      expect(getPlayingTimePaceWarning(game, id)).toBe(0.4);
      expect(validateGame(game, team.sideSize)).toEqual([]);
    },
  );
});

describe("demo clock fast-forwarding", () => {
  it("adds an offset after materializing the running clock", () => {
    let game = createGame(
      INITIAL_TEAMS.u8,
      INITIAL_TEAMS.u8.defaultFormationId,
      INITIAL_TEAMS.u8.roster.map((player) => player.id),
      INITIAL_TEAMS.u8.defaultDurationMinutes,
      1_000,
    );
    const unavailableId = game.benchIds.at(-1)!;
    game = markUnavailable(
      game,
      unavailableId,
      INITIAL_TEAMS.u8.sideSize,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };

    const advanced = fastForwardGame(game, 6 * 60, 4_000);

    expect(advanced.clock).toEqual({
      elapsedSeconds: 6 * 60 + 3,
      running: false,
      lastStartedAt: null,
    });
    Object.values(advanced.assignments).forEach((playerId) => {
      expect(advanced.totals[playerId].fieldSeconds).toBe(6 * 60 + 3);
    });
    advanced.benchIds.forEach((playerId) => {
      expect(advanced.totals[playerId].benchSeconds).toBe(6 * 60 + 3);
    });
    expect(advanced.totals[unavailableId]).toEqual({
      fieldSeconds: 0,
      benchSeconds: 0,
    });
  });

  it("continues normal accounting after substitutions and a second jump", () => {
    let game = createGame(
      INITIAL_TEAMS.u8,
      INITIAL_TEAMS.u8.defaultFormationId,
      INITIAL_TEAMS.u8.roster.map((player) => player.id),
      INITIAL_TEAMS.u8.defaultDurationMinutes,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    game = fastForwardGame(game, 6 * 60, 1_000);

    const [positionId, outPlayerId] = Object.entries(game.assignments)[0];
    const inPlayerId = game.benchIds[0];
    game = applySubstitutions(
      game,
      [{ outPlayerId, inPlayerId, positionId }],
      INITIAL_TEAMS.u8.sideSize,
      1_000,
    );
    game = fastForwardGame(game, 9 * 60, 1_000);
    const continued = materializeGame(
      setClockRunning(game, true, 1_000),
      6_000,
    );

    expect(game.totals[outPlayerId]).toEqual({
      fieldSeconds: 6 * 60,
      benchSeconds: 9 * 60,
    });
    expect(game.totals[inPlayerId]).toEqual({
      fieldSeconds: 9 * 60,
      benchSeconds: 6 * 60,
    });
    expect(continued.clock.elapsedSeconds).toBe(15 * 60 + 5);
    expect(continued.totals[outPlayerId].benchSeconds).toBe(9 * 60 + 5);
    expect(continued.totals[inPlayerId].fieldSeconds).toBe(9 * 60 + 5);
  });

  it("fast-forwards paused clocks and rejects non-positive offsets", () => {
    const game = createGame(
      INITIAL_TEAMS.u8,
      INITIAL_TEAMS.u8.defaultFormationId,
      INITIAL_TEAMS.u8.roster.map((player) => player.id),
      INITIAL_TEAMS.u8.defaultDurationMinutes,
      1_000,
    );

    const advanced = fastForwardGame(game, 6 * 60, 1_000);
    expect(advanced.clock).toEqual({
      elapsedSeconds: 6 * 60,
      running: false,
      lastStartedAt: null,
    });

    expect(() => fastForwardGame(advanced, 0, 1_000)).toThrow(
      "Fast-forward time must be greater than zero.",
    );
  });
});

describe("substitution destination sorting", () => {
  it("scales fairness bands from the game rotation cadence", () => {
    const u8Game = createGame(
      INITIAL_TEAMS.u8,
      INITIAL_TEAMS.u8.defaultFormationId,
      INITIAL_TEAMS.u8.roster.map((player) => player.id),
      INITIAL_TEAMS.u8.defaultDurationMinutes,
      1_000,
    );
    const u12Game = createGame(
      INITIAL_TEAMS.u12,
      INITIAL_TEAMS.u12.defaultFormationId,
      INITIAL_TEAMS.u12.roster.map((player) => player.id),
      INITIAL_TEAMS.u12.defaultDurationMinutes,
      1_000,
    );

    expect(getSubstitutionTimeBandSize(u8Game)).toBe(2 * 60);
    expect(getSubstitutionTimeBandSize(u12Game)).toBe(3 * 60);
  });

  it("uses displayed timing bands before role fit and exact timing", () => {
    const candidates = [
      {
        id: "outside-long-stint",
        alreadyPlanned: false,
        preferenceIndex: Number.POSITIVE_INFINITY,
        currentFieldSeconds: 10 * 60,
        totalFieldSeconds: 20 * 60,
        formationIndex: 0,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "first-preference",
        alreadyPlanned: false,
        preferenceIndex: 0,
        currentFieldSeconds: 9 * 60 + 10,
        totalFieldSeconds: 18 * 60,
        formationIndex: 1,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "second-preference",
        alreadyPlanned: false,
        preferenceIndex: 1,
        currentFieldSeconds: 9 * 60 + 20,
        totalFieldSeconds: 18 * 60,
        formationIndex: 2,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "same-fit-more-total",
        alreadyPlanned: false,
        preferenceIndex: 1,
        currentFieldSeconds: 9 * 60 + 20,
        totalFieldSeconds: 19 * 60,
        formationIndex: 3,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "planned-longest",
        alreadyPlanned: true,
        preferenceIndex: 0,
        currentFieldSeconds: 30 * 60,
        totalFieldSeconds: 40 * 60,
        formationIndex: 4,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
    ];

    expect(
      candidates
        .sort(compareSubstitutionDestinations)
        .map((candidate) => candidate.id),
    ).toEqual([
      "first-preference",
      "same-fit-more-total",
      "second-preference",
      "outside-long-stint",
      "planned-longest",
    ]);
  });

  it("uses rest guardrails around aggregate playing-time fairness", () => {
    const candidates = [
      {
        id: "fresh-most-played",
        alreadyPlanned: false,
        preferenceIndex: 0,
        currentFieldSeconds: 2 * 60,
        totalFieldSeconds: 36 * 60,
        formationIndex: 0,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "normal-most-played",
        alreadyPlanned: false,
        preferenceIndex: 0,
        currentFieldSeconds: 6 * 60,
        totalFieldSeconds: 30 * 60,
        formationIndex: 1,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "normal-longer-current",
        alreadyPlanned: false,
        preferenceIndex: 0,
        currentFieldSeconds: 12 * 60,
        totalFieldSeconds: 27 * 60,
        formationIndex: 2,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
      {
        id: "rest-due-least-played",
        alreadyPlanned: false,
        preferenceIndex: 0,
        currentFieldSeconds: 15 * 60,
        totalFieldSeconds: 24 * 60,
        formationIndex: 3,
        timeBandSeconds: 3 * 60,
        rotationIntervalSeconds: 15 * 60,
      },
    ];

    expect(
      candidates
        .sort(compareSubstitutionDestinations)
        .map((candidate) => candidate.id),
    ).toEqual([
      "rest-due-least-played",
      "normal-most-played",
      "normal-longer-current",
      "fresh-most-played",
    ]);
  });
});

describe("formations", () => {
  it("defines exactly one goalkeeper and the correct total side size", () => {
    expect(FORMATIONS.flatMap(validateFormation)).toEqual([]);
    expect(
      FORMATIONS.filter((formation) => formation.sideSize === 5).map(
        (formation) => formation.name,
      ),
    ).toEqual(["2-2", "1-2-1", "1-1-2"]);
    expect(INITIAL_TEAMS.u8.defaultFormationId).toBe("5-2-2");
    expect(
      getFormationsForTeam(INITIAL_TEAMS.u12).map(
        (formation) => formation.name,
      ),
    ).toEqual(["3-1-3-1", "3-3-2", "3-2-3", "2-3-3"]);
  });

  it("provides short, medium, and full labels for every position", () => {
    FORMATIONS.forEach((formation) => {
      formation.positions.forEach((position) => {
        expect(position.shortLabel.length).toBeGreaterThan(0);
        expect(position.mediumLabel.length).toBeGreaterThan(
          position.shortLabel.length,
        );
        expect(position.label.length).toBeGreaterThanOrEqual(
          position.mediumLabel.length,
        );
      });
    });
  });

  it("keeps attacking lines clear of the goal area and in tactical order", () => {
    FORMATIONS.forEach((formation) => {
      const goalkeeper = formation.positions.find(
        (position) => position.role === "goalkeeper",
      )!;
      const forwards = formation.positions.filter(
        (position) => position.role === "forward",
      );
      const defenders = formation.positions.filter(
        (position) => position.role === "defender",
      );
      const midfielders = formation.positions.filter(
        (position) => position.role === "midfielder",
      );

      expect(goalkeeper.y).toBeGreaterThanOrEqual(88);
      forwards.forEach((forward) => {
        expect(forward.y).toBeGreaterThanOrEqual(18);
        expect(forward.y).toBeLessThanOrEqual(25);
      });
      if (midfielders.length) {
        expect(
          Math.max(...forwards.map((position) => position.y)),
        ).toBeLessThan(Math.min(...midfielders.map((position) => position.y)));
        expect(
          Math.max(...midfielders.map((position) => position.y)),
        ).toBeLessThan(Math.min(...defenders.map((position) => position.y)));
      }
    });
  });
});

describe("team rosters", () => {
  it("sorts by name, then numeric jersey number, with unnumbered players last", () => {
    const players: Player[] = [
      { ...INITIAL_TEAMS.u8.roster[0], id: "z", name: "Zoe", number: 1 },
      {
        ...INITIAL_TEAMS.u8.roster[0],
        id: "a",
        name: "Amy",
        number: undefined,
      },
      { ...INITIAL_TEAMS.u8.roster[0], id: "b", name: "Amy", number: 10 },
      { ...INITIAL_TEAMS.u8.roster[0], id: "c", name: "Amy", number: 2 },
      { ...INITIAL_TEAMS.u8.roster[0], id: "d", name: "Amy", number: 2 },
    ];
    expect(
      [...players].sort(comparePlayersByNameThenNumber).map((p) => p.id),
    ).toEqual(["c", "d", "b", "a", "z"]);
    expect(players.map((p) => p.id)).toEqual(["z", "a", "b", "c", "d"]);
    expect(comparePlayersByNameThenNumber(players[1], players[1])).toBe(0);
  });

  it("assigns unique jersey numbers including confirmed team metadata", () => {
    const players = [...INITIAL_TEAMS.u8.roster, ...INITIAL_TEAMS.u12.roster];
    const numbers = players.map((player) => player.number);
    const u8Numbers = Object.fromEntries(
      INITIAL_TEAMS.u8.roster.map((player) => [player.name, player.number]),
    );
    const u12Numbers = Object.fromEntries(
      INITIAL_TEAMS.u12.roster.map((player) => [player.name, player.number]),
    );

    expect(
      numbers.every((number) => number && number >= 1 && number <= 99),
    ).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(players.every((player) => player.preferredRoles.length >= 2)).toBe(
      true,
    );
    expect(
      INITIAL_TEAMS.u8.roster.find((player) => player.name === "Collier"),
    ).toEqual({
      id: "u8-p10",
      name: "Collier",
      number: 56,
      preferredRoles: ["defender", "midfielder", "forward"],
      active: true,
    });
    expect(players.every((player) => player.preferredRoles.length <= 4)).toBe(
      true,
    );
    expect(
      INITIAL_TEAMS.u8.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Maddox", "Ollie", "Henry", "Evan"]);
    expect(
      INITIAL_TEAMS.u12.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Jackson", "William", "Matt", "Rayek", "Jack"]);
    expect(
      INITIAL_TEAMS.u12.roster.find((player) => player.name === "Jack")
        ?.preferredRoles,
    ).toEqual(["defender", "midfielder", "goalkeeper"]);
    expect(u8Numbers).toMatchObject({
      Simon: 10,
      Ollie: 23,
      Henry: 12,
      Haru: 49,
    });
    expect(u12Numbers).toMatchObject({
      Jackson: 82,
      William: 78,
      Andrew: 11,
      Matt: 18,
      John: 90,
      Jack: 5,
    });
  });
});

describe("preference-aware assignments", () => {
  it("places starters into their strongest available roles", () => {
    const team = INITIAL_TEAMS.u8;
    const formation = FORMATIONS.find((item) => item.id === "5-1-2-1")!;
    const assignments = assignPlayersByPreference(
      formation,
      team.roster.slice(0, 5).map((player) => player.id),
      team.roster,
    );

    expect(assignments.gk).toBe(
      team.roster.find((player) => player.name === "Maddox")?.id,
    );
    expect(assignments.dl).toBe(
      team.roster.find((player) => player.name === "Ollie")?.id,
    );
    expect(assignments.f).toBe(
      team.roster.find((player) => player.name === "Malik")?.id,
    );
  });

  it("balances prospective keeper workload against starting position fit", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    const formation = FORMATIONS.find((item) => item.id === "5-1-2-1")!;
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    team.roster[0].preferredRoles = ["goalkeeper", "defender"];
    team.roster[1].preferredRoles = ["goalkeeper", "defender"];

    const assignments = assignStartingPlayersByPreference(
      formation,
      team.roster.slice(0, 7).map((player) => player.id),
      team.roster,
    );
    const assignedIds = Object.values(assignments);

    expect(assignedIds).toContain(team.roster[0].id);
    expect(assignedIds).not.toContain(team.roster[1].id);
  });
});

describe("time accounting", () => {
  it("accrues field and bench time deterministically", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const next = materializeGame(game, 11_000);

    Object.values(game.assignments).forEach((id) => {
      expect(next.totals[id].fieldSeconds).toBe(10);
    });

    game.benchIds.forEach((id) => {
      expect(next.totals[id].benchSeconds).toBe(10);
    });
    expect(next.clock.elapsedSeconds).toBe(10);
  });
});

describe("player availability", () => {
  it("starts non-attending roster players as unavailable", () => {
    const team = INITIAL_TEAMS.u8;
    const attendingIds = team.roster.slice(0, 7).map((player) => player.id);
    const game = createGame(team, "5-1-2-1", attendingIds, 40, 1_000);

    expect(game.presentIds).toEqual(attendingIds);
    expect(game.unavailableIds).toEqual(
      team.roster.slice(7).map((player) => player.id),
    );
    expect(validateGame(game, team.sideSize)).toEqual([]);
  });

  it("adds a late arrival to the bench and supports undo", () => {
    const team = INITIAL_TEAMS.u8;
    const latePlayer = team.roster.at(-1)!;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, -1).map((player) => player.id),
      40,
      1_000,
    );
    const available = markAvailable(game, latePlayer.id, team.sideSize, 2_000);

    expect(available.presentIds).toContain(latePlayer.id);
    expect(available.unavailableIds).not.toContain(latePlayer.id);
    expect(available.benchIds).toContain(latePlayer.id);
    expect(available.history.at(-1)?.playerId).toBe(latePlayer.id);
    expect(validateGame(available, team.sideSize)).toEqual([]);

    const undone = undoLastEvent(available, 3_000);
    expect(undone.presentIds).not.toContain(latePlayer.id);
    expect(undone.unavailableIds).toContain(latePlayer.id);
    expect(undone.benchIds).not.toContain(latePlayer.id);
  });

  it("places a late arrival into an open position when short-sided", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.slice(0, 7).map((player) => player.id),
      60,
      1_000,
    );
    const latePlayer = team.roster[7];
    const available = markAvailable(game, latePlayer.id, team.sideSize, 2_000);

    expect(Object.values(available.assignments)).toContain(latePlayer.id);
    expect(available.benchIds).not.toContain(latePlayer.id);
    expect(validateGame(available, team.sideSize)).toEqual([]);
  });
});

describe("period accounting", () => {
  it("uses nominal period boundaries for the soccer match clock", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      90,
      1_000,
    );
    game.clock.elapsedSeconds = 52 * 60;
    game.periodEnds = [{ period: 1, atSeconds: 52 * 60 }];
    game.period = { current: 2, startedAtSeconds: 52 * 60 };

    expect(getMatchClockSeconds(game)).toBe(45 * 60);

    game.clock.elapsedSeconds = 70 * 60 + 37;
    expect(getMatchClockSeconds(game)).toBe(63 * 60 + 37);
    expect(game.clock.elapsedSeconds).toBe(70 * 60 + 37);
  });

  it("removes each prior quarter's added time from later match-clock periods", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
      4,
    );
    game.periodEnds = [
      { period: 1, atSeconds: 11 * 60 },
      { period: 2, atSeconds: 22 * 60 + 30 },
    ];
    game.period = { current: 3, startedAtSeconds: 22 * 60 + 30 };
    game.clock.elapsedSeconds = 25 * 60 + 30;

    expect(getMatchClockSeconds(game)).toBe(23 * 60);
  });

  it("tracks U8 quarters and U12 halves at their boundaries", () => {
    expect(getPeriodStatus(40 * 60, 9 * 60, 4)).toMatchObject({
      current: 1,
      count: 4,
      label: "Quarter",
      remainingSeconds: 60,
    });
    expect(getPeriodStatus(40 * 60, 10 * 60, 4)).toMatchObject({
      current: 2,
      count: 4,
      label: "Quarter",
      remainingSeconds: 10 * 60,
    });
    expect(getPeriodStatus(60 * 60, 35 * 60, 2)).toMatchObject({
      current: 2,
      count: 2,
      label: "Half",
      remainingSeconds: 25 * 60,
    });
  });

  it("continues into added time until the coach ends the period", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
      4,
    );
    game.clock = {
      elapsedSeconds: 9 * 60 + 59,
      running: true,
      lastStartedAt: 1_000,
    };
    const addedTime = materializeGame(game, 6_000);

    expect(addedTime.clock).toEqual({
      elapsedSeconds: 10 * 60 + 4,
      running: true,
      lastStartedAt: 6_000,
    });
    expect(addedTime.periodBreak).toBeUndefined();
    expect(
      getPeriodStatus(
        addedTime.durationSeconds,
        addedTime.clock.elapsedSeconds,
        addedTime.periodCount,
        addedTime.period,
      ),
    ).toMatchObject({
      current: 1,
      regulationReached: true,
      addedTimeSeconds: 4,
    });
    Object.values(game.assignments).forEach((playerId) => {
      expect(addedTime.totals[playerId].fieldSeconds).toBe(5);
    });

    const ended = endCurrentPeriod(addedTime, 7_000);
    expect(ended.clock.running).toBe(false);
    expect(ended.clock.elapsedSeconds).toBe(10 * 60 + 5);
    expect(ended.periodBreak).toEqual({ completedPeriod: 1, final: false });
    expect(ended.periodEnds).toEqual([{ period: 1, atSeconds: 10 * 60 + 5 }]);

    const nextPeriod = startNextPeriod(ended, 8_000);
    expect(nextPeriod.period).toEqual({
      current: 2,
      startedAtSeconds: 10 * 60 + 5,
    });
    expect(getMatchClockSeconds(nextPeriod)).toBe(10 * 60);
    const nextAddedTime = materializeGame(nextPeriod, 608_000);
    expect(nextAddedTime.clock.elapsedSeconds).toBe(20 * 60 + 5);
    expect(getMatchClockSeconds(nextAddedTime)).toBe(20 * 60);
    expect(
      getPeriodStatus(
        nextAddedTime.durationSeconds,
        nextAddedTime.clock.elapsedSeconds,
        nextAddedTime.periodCount,
        nextAddedTime.period,
      ),
    ).toMatchObject({
      current: 2,
      matchClockSeconds: 20 * 60,
      regulationReached: true,
      addedTimeSeconds: 0,
    });
  });

  it("continues beyond final regulation while tracking added time", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      60,
      1_000,
    );
    game.clock = {
      elapsedSeconds: 59 * 60 + 58,
      running: true,
      lastStartedAt: 1_000,
    };
    game.period = { current: 2, startedAtSeconds: 30 * 60 };

    const completed = materializeGame(game, 11_000);
    expect(completed.clock.elapsedSeconds).toBe(60 * 60 + 8);
    expect(completed.clock.running).toBe(true);
    expect(completed.periodBreak).toBeUndefined();
    expect(
      getPeriodStatus(
        completed.durationSeconds,
        completed.clock.elapsedSeconds,
        completed.periodCount,
        completed.period,
      ),
    ).toMatchObject({
      current: 2,
      regulationReached: true,
      addedTimeSeconds: 8,
      regulationRemainingSeconds: 0,
    });
  });

  it("keeps reminders and event timestamps on actual added time", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = {
      elapsedSeconds: 9 * 60 + 59,
      running: true,
      lastStartedAt: 1_000,
    };

    const addedTime = materializeGame(game, 6_000);
    const scorerId = Object.values(addedTime.assignments).find(
      (playerId) => addedTime.assignments.gk !== playerId,
    )!;
    const scored = recordGoal(addedTime, "us", scorerId, 6_000);

    expect(getSubstitutionReminderStatus(addedTime)).toMatchObject({
      due: true,
      secondsSinceLastSubstitution: 10 * 60 + 4,
    });
    expect(scored.history.at(-1)).toMatchObject({
      type: "goal-for",
      atSeconds: 10 * 60 + 4,
    });
  });

  it("resumes the same period after an accidental period end", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
      4,
    );
    game.clock = {
      elapsedSeconds: 10 * 60,
      running: true,
      lastStartedAt: 1_000,
    };

    const ended = endCurrentPeriod(game, 1_000);
    const resumed = setClockRunning(ended, true, 2_000);

    expect(resumed.period).toEqual({ current: 1, startedAtSeconds: 0 });
    expect(resumed.periodBreak).toBeUndefined();
    expect(resumed.clock.running).toBe(true);
  });
});

describe("starter assignment", () => {
  it("swaps two starters instead of assigning one player twice", () => {
    expect(
      assignPlayerToPosition(
        { gk: "player-1", dl: "player-2", dr: "player-3" },
        "gk",
        "player-2",
      ),
    ).toEqual({
      gk: "player-2",
      dl: "player-1",
      dr: "player-3",
    });
  });

  it("replaces a starter cleanly when selecting a bench player", () => {
    expect(
      assignPlayerToPosition(
        { gk: "player-1", dl: "player-2" },
        "dl",
        "player-3",
      ),
    ).toEqual({
      gk: "player-1",
      dl: "player-3",
    });
  });
});

describe("position changes", () => {
  it("records and undoes a position swap", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    const beforeAssignments = structuredClone(game.assignments);
    const movedPlayerId = game.assignments.dr;
    const targetPlayerId = game.assignments.m;
    const changed = movePlayer(game, movedPlayerId, "m", 2_000);
    const event = changed.history.at(-1);

    expect(changed.assignments.m).toBe(movedPlayerId);
    expect(changed.assignments.dr).toBe(targetPlayerId);
    expect(event).toMatchObject({
      type: "position-change",
      playerId: movedPlayerId,
      fromPositionId: "dr",
      toPositionId: "m",
    });
    expect(undoLastEvent(changed, 3_000).assignments).toEqual(
      beforeAssignments,
    );
  });

  it("does not log a no-op move to the player's current position", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );

    expect(movePlayer(game, game.assignments.gk, "gk", 2_000).history).toEqual(
      [],
    );
  });
});

describe("game summaries", () => {
  it("attributes playing time to each position across a position swap", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const movedPlayerId = game.assignments.dr;
    const changed = movePlayer(game, movedPlayerId, "m", 11_000);
    const ended = setClockRunning(changed, false, 21_000);
    const summary = summarizePlayerPositions(ended).find(
      (playerSummary) => playerSummary.playerId === movedPlayerId,
    );

    expect(summary).toEqual({
      playerId: movedPlayerId,
      totalSeconds: 20,
      goals: [],
      positions: [
        { positionId: "dr", seconds: 10 },
        { positionId: "m", seconds: 10 },
      ],
    });
  });

  it("adds a guest directly to an open position and starts timing from entry", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 4).map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const guest = {
      id: "guest-u8-live",
      name: "Borrowed Alex",
      number: 31,
      preferredRoles: ["forward", "midfielder"] as Player["preferredRoles"],
      active: true,
      guest: true,
    };
    const added = addGuestPlayer(game, guest, "f", team.sideSize, 6_000);

    expect(added.clock.elapsedSeconds).toBe(5);
    expect(added.assignments.f).toBe(guest.id);
    expect(added.presentIds).toContain(guest.id);
    expect(added.guestPlayers).toEqual([guest]);
    expect(added.totals[guest.id]).toEqual({
      fieldSeconds: 0,
      benchSeconds: 0,
    });
    expect(undoLastEvent(added, 6_000).guestPlayers).toEqual([]);
  });

  it("adds a guest to the bench and starts bench timing from arrival", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const guest = {
      id: "guest-u8-bench",
      name: "Borrowed Casey",
      number: 44,
      preferredRoles: ["forward", "defender"] as Player["preferredRoles"],
      active: true,
      guest: true,
    };

    const added = addGuestPlayerToBench(game, guest, team.sideSize, 6_000);
    const later = materializeGame(added, 11_000);

    expect(added.clock.elapsedSeconds).toBe(5);
    expect(added.benchIds).toContain(guest.id);
    expect(added.presentIds).toContain(guest.id);
    expect(added.guestPlayers).toEqual([guest]);
    expect(getCurrentBenchSeconds(later, guest.id)).toBe(5);
    expect(undoLastEvent(added, 6_000).guestPlayers).toEqual([]);
  });

  it("attributes each goal to the scorer's position at that moment", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    const scorerId = game.assignments.dr;
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    game = recordGoal(game, "us", scorerId, 6_000);
    game = movePlayer(game, scorerId, "m", 11_000);
    game = recordGoal(game, "us", scorerId, 16_000);
    game = setClockRunning(game, false, 21_000);

    expect(
      summarizePlayerPositions(game).find(
        (summary) => summary.playerId === scorerId,
      )?.goals,
    ).toEqual([
      { atSeconds: 5, positionId: "dr" },
      { atSeconds: 15, positionId: "m" },
    ]);
  });
});

describe("scorekeeping", () => {
  it("records scorers on the field, opponent goals, and supports undo", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const scorerId = game.assignments.gk;
    const withOurGoal = recordGoal(game, "us", scorerId, 11_000);
    const level = recordGoal(withOurGoal, "opponent", undefined, 16_000);

    expect(getScore(level)).toEqual({ us: 1, opponent: 1 });
    expect(level.history[0]).toMatchObject({
      type: "goal-for",
      playerId: scorerId,
      atSeconds: 10,
    });
    expect(level.history[1]).toMatchObject({
      type: "goal-against",
      atSeconds: 15,
    });
    expect(getScore(undoLastEvent(level, 16_000))).toEqual({
      us: 1,
      opponent: 0,
    });
    expect(() => recordGoal(game, "us", game.benchIds[0], 2_000)).toThrow(
      "The scorer must be on the field",
    );
    expect(() =>
      recordGoal(
        {
          ...game,
          clock: { elapsedSeconds: 10, running: false, lastStartedAt: null },
        },
        "opponent",
        undefined,
        11_000,
      ),
    ).toThrow("Start the clock before recording a goal");
  });
});

describe("substitutions", () => {
  it.each([
    [2, false, false],
    [4, false, false],
    [2, true, false],
    [4, true, false],
    [2, false, true],
    [4, false, true],
    [2, true, true],
    [4, true, true],
  ] as const)(
    "honors keeper ranks and preserves outfield time with %i periods (Ollie out=%s, Henry outfield-first=%s)",
    (periodCount, removeOllie, henryOutfieldFirst) => {
      const team = structuredClone(INITIAL_TEAMS.u8);
      const henry = team.roster.find((player) => player.name === "Henry")!;
      henry.preferredRoles = henryOutfieldFirst
        ? ["forward", "midfielder", "goalkeeper"]
        : ["goalkeeper", "forward", "midfielder"];
      const ollie = team.roster.find((player) => player.name === "Ollie")!;
      ollie.preferredRoles = removeOllie
        ? ["forward", "midfielder"]
        : ["forward", "midfielder", "goalkeeper"];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
        periodCount,
      );
      game.assignments = assignStartingPlayersByPreference(
        getFormation(game.formationId),
        game.presentIds,
        team.roster,
      );
      game.benchIds = game.presentIds.filter(
        (id) => !Object.values(game.assignments).includes(id),
      );
      const firstKeeper = game.assignments.gk;
      for (let turn = 1; turn <= 8; turn++) {
        game = fastForwardGame(game, 300, 1_000);
        const periodLength = game.durationSeconds / periodCount;
        const current = Math.min(
          periodCount,
          Math.floor(game.clock.elapsedSeconds / periodLength) + 1,
        );
        game.period = {
          current,
          startedAtSeconds: (current - 1) * periodLength,
        };
        if (turn === 8) break;
        const count = getRecommendedSubstitutionCount(game, team);
        const pairs = suggestSubstitutions(game, count, team);
        expect(pairs).toHaveLength(count);
        expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
        game = applySubstitutions(game, pairs, team.sideSize, 1_000);
        expect(validateGame(game, team.sideSize)).toEqual([]);
        if (turn === 1) expect(game.assignments.gk).toBe(firstKeeper);
        if (turn === 2) expect(game.assignments.gk).not.toBe(firstKeeper);
      }
      const played = Object.values(game.totals).map(
        (time) => time.fieldSeconds,
      );
      expect(played.reduce((sum, seconds) => sum + seconds, 0)).toBe(12_000);
      for (const player of team.roster) {
        const total = game.totals[player.id];
        expect(total.fieldSeconds).toBe(1_200);
        expect(total.fieldSeconds + total.benchSeconds).toBe(2_400);
        if (
          total.fieldSeconds < 960 &&
          game.benchIds.includes(player.id) &&
          getCurrentBenchSeconds(game, player.id) > 360
        ) {
          expect(getPlayingTimePaceWarning(game, player.id)).toBe(0.4);
        }
      }
      const summaries = summarizePlayerPositions(game);
      const keeperTotals = team.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map(
          (player) =>
            summaries
              .find((summary) => summary.playerId === player.id)!
              .positions.find((position) => position.positionId === "gk")
              ?.seconds ?? 0,
        )
        .sort((a, b) => a - b);
      expect(keeperTotals).toEqual(
        removeOllie
          ? [600, 900, 900]
          : henryOutfieldFirst
            ? [300, 300, 900, 900]
            : [0, 600, 900, 900],
      );
      const expectedGoalSeconds: Record<string, number> = {
        Maddox: 900,
        Evan: henryOutfieldFirst || !removeOllie ? 900 : 600,
        Henry: henryOutfieldFirst
          ? removeOllie
            ? 600
            : 300
          : removeOllie
            ? 900
            : 600,
        Ollie: henryOutfieldFirst && !removeOllie ? 300 : 0,
      };
      for (const [name, seconds] of Object.entries(expectedGoalSeconds)) {
        const player = team.roster.find((entry) => entry.name === name)!;
        expect(
          summaries
            .find((entry) => entry.playerId === player.id)!
            .positions.find((position) => position.positionId === "gk")
            ?.seconds ?? 0,
        ).toBe(seconds);
      }
      for (const summary of summaries) {
        const keeperSeconds =
          summary.positions.find((position) => position.positionId === "gk")
            ?.seconds ?? 0;
        if (keeperSeconds > 0) {
          expect(
            game.totals[summary.playerId].fieldSeconds - keeperSeconds,
          ).toBeGreaterThanOrEqual(300);
        }
      }
      if (removeOllie) {
        const ollie = team.roster.find((player) => player.name === "Ollie")!;
        expect(
          summaries
            .find((summary) => summary.playerId === ollie.id)!
            .positions.some((position) => position.positionId === "gk"),
        ).toBe(false);
      }
    },
  );

  it("prompts U8 after five minutes and resets after an executed substitution", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      40,
      1_000,
      2,
    );

    game.clock.elapsedSeconds = 299;
    expect(getSubstitutionReminderStatus(game)).toMatchObject({
      due: false,
      hasExecutedSubstitution: false,
      intervalSeconds: 300,
      secondsSinceLastSubstitution: 299,
    });

    game.clock.elapsedSeconds = 300;
    expect(getSubstitutionReminderStatus(game).due).toBe(true);

    game = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      team.sideSize,
      2_000,
    );
    game.clock.elapsedSeconds = 599;
    expect(getSubstitutionReminderStatus(game).due).toBe(false);

    game.clock.elapsedSeconds = 600;
    expect(getSubstitutionReminderStatus(game)).toMatchObject({
      due: true,
      hasExecutedSubstitution: true,
      secondsSinceLastSubstitution: 300,
    });
  });

  it.each([
    ["u8", 40, 2, 300],
    ["u8", 40, 4, 300],
    ["u8", 48, 4, 360],
    ["u8", 48, 2, 360],
    ["u8", 50, 2, 375],
    ["u8", 60, 2, 450],
    ["u8", 60, 4, 450],
    ["u8", 41, 2, 308],
    ["u12", 40, 2, 600],
    ["u12", 40, 4, 600],
    ["u12", 48, 2, 720],
    ["u12", 60, 2, 900],
    ["u12", 60, 4, 900],
  ] as const)(
    "uses the configured cadence for %s, %i minutes, %i periods",
    (teamId, duration, periods, interval) => {
      const team = INITIAL_TEAMS[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        duration,
        1_000,
        periods,
      );
      const before = structuredClone(game);
      expect(getSubstitutionReminderStatus(game).intervalSeconds).toBe(
        interval,
      );
      expect(getGoalkeeperStintSeconds(game)).toBe(2 * interval);
      game.clock.elapsedSeconds = interval - 1;
      expect(getSubstitutionReminderStatus(game).due).toBe(false);
      game.clock.elapsedSeconds++;
      expect(getSubstitutionReminderStatus(game).due).toBe(true);
      expect(game.history).toEqual(before.history);
      expect(game.assignments).toEqual(before.assignments);
    },
  );

  it("uses a quarter-game cadence for the longer U12 interval", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
    );

    expect(getSubstitutionReminderStatus(game).intervalSeconds).toBe(900);
  });

  it.each(["u8", "u12"] as const)(
    "preserves the %s deadline after a coach-selected injury replacement",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const original = getSubstitutionReminderStatus(game);
      game.clock.elapsedSeconds = original.intervalSeconds / 3;
      game = markUnavailable(
        game,
        Object.values(game.assignments)[0],
        team.sideSize,
        2_000,
        { replacementPlayerId: game.benchIds[0] },
      );

      expect(game.history.at(-1)?.pairs).toHaveLength(1);
      expect(getSubstitutionReminderStatus(game)).toMatchObject({
        cycleKey: original.cycleKey,
        hasExecutedSubstitution: true,
        secondsSinceLastSubstitution: original.intervalSeconds / 3,
      });
      const replacement = game.history.at(-1)!.pairs[0].inPlayerId;
      expect(getCurrentFieldSeconds(game, replacement)).toBe(0);
      const snapshot = getSubstitutionPlanningSnapshot(game);
      expect(snapshot.clock.elapsedSeconds).toBe(original.intervalSeconds);
      game.clock.elapsedSeconds = original.intervalSeconds - 1;
      expect(getSubstitutionReminderStatus(game).due).toBe(false);
      game.clock.elapsedSeconds = original.intervalSeconds;
      expect(getSubstitutionReminderStatus(game).due).toBe(true);
      expect(getCurrentFieldSeconds(game, replacement)).toBeCloseTo(
        (original.intervalSeconds * 2) / 3,
      );
    },
  );

  it.each(["u8", "u12"] as const)(
    "restarts %s cadence for a deliberate partial batch, but not a later injury",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const original = getSubstitutionReminderStatus(game);
      game.clock.elapsedSeconds = original.intervalSeconds - 60;
      game = applySubstitutions(
        game,
        suggestSubstitutions(game, 3, team),
        team.sideSize,
        2_000,
      );
      const planned = getSubstitutionReminderStatus(game);
      expect(planned.secondsSinceLastSubstitution).toBe(0);
      expect(planned.cycleKey).not.toBe(original.cycleKey);
      game.clock.elapsedSeconds = original.intervalSeconds;
      expect(getSubstitutionReminderStatus(game).due).toBe(false);
      game = markUnavailable(
        game,
        Object.values(game.assignments)[0],
        team.sideSize,
        3_000,
        { replacementPlayerId: game.benchIds[0] },
      );
      expect(getSubstitutionReminderStatus(game)).toMatchObject({
        cycleKey: planned.cycleKey,
        secondsSinceLastSubstitution: 60,
        due: false,
      });
      game.clock.elapsedSeconds = original.intervalSeconds * 2 - 61;
      expect(getSubstitutionReminderStatus(game).due).toBe(false);
      game.clock.elapsedSeconds++;
      expect(getSubstitutionReminderStatus(game)).toMatchObject({
        cycleKey: planned.cycleKey,
        due: true,
      });
      game = undoLastEvent(game, 4_000);
      expect(getSubstitutionReminderStatus(game).cycleKey).toBe(
        planned.cycleKey,
      );
      game = undoLastEvent(game, 5_000);
      expect(getSubstitutionReminderStatus(game)).toMatchObject({
        cycleKey: original.cycleKey,
        due: true,
      });
    },
  );

  it("adds or updates one bench player inside the queued batch", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const initialPairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, initialPairs);
    const incomingPlayerId = game.benchIds.find(
      (playerId) => !initialPairs.some((pair) => pair.inPlayerId === playerId),
    )!;
    const replacementOutId = initialPairs[0].outPlayerId;
    const updated = queueBenchSubstitution(
      queued,
      incomingPlayerId,
      replacementOutId,
    );

    expect(updated.assignments).toEqual(game.assignments);
    expect(updated.queuedSubstitutions).toHaveLength(2);
    expect(updated.queuedSubstitutions).toContainEqual(initialPairs[1]);
    expect(updated.queuedSubstitutions).toContainEqual({
      inPlayerId: incomingPlayerId,
      outPlayerId: replacementOutId,
      positionId: initialPairs[0].positionId,
    });
  });

  it.each(["u8", "u12"] as const)(
    "replaces conflicting %s pairings without swapping their previous partners",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const pairs = Object.entries(game.assignments)
        .slice(0, 3)
        .map(([positionId, outPlayerId], index) => ({
          positionId,
          outPlayerId,
          inPlayerId: game.benchIds[index],
        }));
      const queued = queueSubstitutions(game, pairs);
      const before = structuredClone(queued);
      const preview = previewBenchSubstitution(
        queued,
        pairs[0].inPlayerId,
        pairs[1].outPlayerId,
      );
      const updated = queueBenchSubstitution(
        queued,
        pairs[0].inPlayerId,
        pairs[1].outPlayerId,
      );
      expect(updated.queuedSubstitutions).toEqual([
        pairs[2],
        { ...pairs[1], inPlayerId: pairs[0].inPlayerId },
      ]);
      expect(preview.pairs).toEqual(updated.queuedSubstitutions);
      expect(preview.removedPlayerIds).toEqual([
        pairs[0].outPlayerId,
        pairs[1].inPlayerId,
      ]);
      expect(
        previewBenchSubstitution(
          queued,
          pairs[0].inPlayerId,
          pairs[0].outPlayerId,
        ).removedPlayerIds,
      ).toEqual([]);
      expect(updated.assignments).toEqual(game.assignments);
      expect(updated.benchIds).toEqual(game.benchIds);
      expect(updated.history).toEqual(game.history);
      expect(queued).toEqual(before);
    },
  );

  it("removes one bench player without clearing the rest of the queued batch", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, pairs);
    const updated = removeQueuedSubstitution(queued, pairs[0].inPlayerId);

    expect(updated.queuedSubstitutions).toEqual([pairs[1]]);
    expect(
      removeQueuedSubstitution(updated, pairs[1].inPlayerId)
        .queuedSubstitutions,
    ).toBeUndefined();
  });

  it("removes one outgoing player without clearing the rest of the queued batch", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, pairs);
    const updated = removeQueuedSubstitutionForOutgoing(
      queued,
      pairs[0].outPlayerId,
    );

    expect(updated.queuedSubstitutions).toEqual([pairs[1]]);
  });

  it("removes an unavailable bench player from the queued batch", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, pairs);
    const unavailable = markUnavailable(
      queued,
      pairs[0].inPlayerId,
      team.sideSize,
      2_000,
    );

    expect(unavailable.queuedSubstitutions).toEqual([pairs[1]]);
    expect(undoLastEvent(unavailable, 3_000).queuedSubstitutions).toEqual(
      pairs,
    );
  });

  it("queues substitutions without changing the lineup or time totals", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    const pairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, pairs);

    expect(queued.assignments).toEqual(game.assignments);
    expect(queued.benchIds).toEqual(game.benchIds);
    expect(queued.totals).toEqual(game.totals);
    expect(queued.history).toEqual([]);
    expect(queued.queuedSubstitutions).toEqual(pairs);

    const executed = applySubstitutions(queued, pairs, team.sideSize, 11_000);
    expect(executed.queuedSubstitutions).toBeUndefined();
    expect(executed.history).toHaveLength(1);
    expect(executed.history[0].atSeconds).toBe(10);
    expect(executed.totals[pairs[0].outPlayerId].fieldSeconds).toBe(10);
    expect(executed.totals[pairs[0].inPlayerId].benchSeconds).toBe(10);

    const fiveSecondsLater = materializeGame(executed, 16_000);
    expect(fiveSecondsLater.totals[pairs[0].outPlayerId].benchSeconds).toBe(5);
    expect(fiveSecondsLater.totals[pairs[0].inPlayerId].fieldSeconds).toBe(5);
  });

  it("projects current intervals to the next rotation without changing real totals", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      "5-2-2",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock.elapsedSeconds = 5 * 60;
    const pair = suggestSubstitutions(game, 1, team)[0];
    game = applySubstitutions(game, [pair], team.sideSize, 2_000);

    const planningGame = getSubstitutionPlanningSnapshot(game);

    expect(getCurrentFieldSeconds(game, pair.inPlayerId)).toBe(0);
    expect(getCurrentFieldSeconds(planningGame, pair.inPlayerId)).toBe(300);
    expect(getCurrentBenchSeconds(game, pair.outPlayerId)).toBe(0);
    expect(getCurrentBenchSeconds(planningGame, pair.outPlayerId)).toBe(300);
    expect(planningGame.totals).toEqual(game.totals);
    expect(game.clock.elapsedSeconds).toBe(5 * 60);
  });

  it("includes both fairness groups when both will be rested at the next rotation", () => {
    const team = structuredClone(INITIAL_TEAMS.u12);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    let game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      60,
      1_000,
    );
    team.roster.find(
      (player) => player.id === game.assignments.gk,
    )!.preferredRoles = ["goalkeeper"];
    Object.values(game.assignments).forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 7 * 60;
    });
    game.benchIds.forEach((playerId) => {
      game.totals[playerId].benchSeconds = 7 * 60;
    });
    game.clock.elapsedSeconds = 7 * 60;
    const outfieldPositions = Object.keys(game.assignments).filter(
      (positionId) => positionId !== "gk",
    );
    const incomingIds = game.benchIds.slice(0, 2);
    game = applySubstitutions(
      game,
      incomingIds.map((inPlayerId, index) => ({
        positionId: outfieldPositions[index],
        outPlayerId: game.assignments[outfieldPositions[index]],
        inPlayerId,
      })),
      team.sideSize,
      2_000,
    );

    expect(getRecommendedSubstitutionCount(game, team)).toBe(6);
    expect(
      suggestSubstitutions(
        game,
        getRecommendedSubstitutionCount(game, team),
        team,
      ).map((pair) => pair.inPlayerId),
    ).toEqual(expect.arrayContaining(game.benchIds));
  });

  it("allows a full opening rotation before the starting keeper's stint is due", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.assignments = assignStartingPlayersByPreference(
      getFormation(game.formationId),
      game.presentIds,
      team.roster,
    );
    game.benchIds = game.presentIds.filter(
      (id) => !Object.values(game.assignments).includes(id),
    );
    expect(game.benchIds).toHaveLength(5);
    expect(getMaxSubstitutionCount(game, team)).toBe(4);
    expect(getRecommendedSubstitutionCount(game, team)).toBe(4);
    const pairs = suggestSubstitutions(game, 5, team);
    expect(pairs).toHaveLength(5);
    expect(pairs.some((pair) => pair.positionId === "gk")).toBe(true);
    expect(
      suggestSubstitutions(game, 4, team).every(
        (pair) => pair.positionId !== "gk",
      ),
    ).toBe(true);
    expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
    expect(
      validateGame(
        applySubstitutions(game, pairs, team.sideSize, 2_000),
        team.sideSize,
      ),
    ).toEqual([]);

    game.clock.elapsedSeconds =
      getSubstitutionReminderStatus(game).intervalSeconds;
    const fullRotation = suggestSubstitutions(game, 5, team);
    expect(fullRotation).toHaveLength(5);
    expect(fullRotation.some((pair) => pair.positionId === "gk")).toBe(true);
    expect(validateSubstitutionPairs(game, fullRotation)).toEqual([]);
    const rotated = applySubstitutions(
      game,
      fullRotation,
      team.sideSize,
      2_000,
    );
    expect(validateGame(rotated, team.sideSize)).toEqual([]);
    expect(undoLastEvent(rotated, team.sideSize).assignments).toEqual(
      game.assignments,
    );
  });

  it("fills the second plan after a complete five-player rotation", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const interval = getSubstitutionReminderStatus(game).intervalSeconds;
    const firstRotation = suggestSubstitutions(game, 5, team);
    expect(firstRotation).toHaveLength(5);
    game.clock.elapsedSeconds = interval;
    game = applySubstitutions(game, firstRotation, team.sideSize, 2_000);
    const freshGoalkeeperId = game.assignments.gk;
    game.clock.elapsedSeconds += 120;
    const count = getRecommendedSubstitutionCount(game, team);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4);
    const secondPlan = suggestSubstitutions(game, count, team);
    expect(secondPlan).toHaveLength(count);
    expect(
      secondPlan.some((pair) => pair.outPlayerId === freshGoalkeeperId),
    ).toBe(false);
    expect(validateSubstitutionPairs(game, secondPlan)).toEqual([]);
    expect(suggestSubstitutions(game, 5, team)).toHaveLength(4);

    const beforeOverride = structuredClone(game);
    const fullPlan = suggestSubstitutions(game, 5, team, {
      allowEarlyKeeperChange: true,
    });
    expect(fullPlan).toHaveLength(5);
    expect(fullPlan.find((pair) => pair.positionId === "gk")).toMatchObject({
      inPlayerId: team.roster.find((player) => player.name === "Maddox")!.id,
      outPlayerId: team.roster.find((player) => player.name === "Evan")!.id,
    });
    expect(validateSubstitutionPairs(game, fullPlan)).toEqual([]);
    expect(
      validateGame(
        applySubstitutions(game, fullPlan, team.sideSize, 3_000),
        team.sideSize,
      ),
    ).toEqual([]);
    expect(game).toEqual(beforeOverride);
    expect(
      suggestSubstitutions(game, 4, team, { allowEarlyKeeperChange: true }),
    ).toEqual(suggestSubstitutions(game, 4, team));

    game.clock.elapsedSeconds = interval + getGoalkeeperStintSeconds(game);
    const secondRotation = suggestSubstitutions(game, 5, team);
    expect(secondRotation).toHaveLength(5);
    expect(
      validateGame(
        applySubstitutions(game, secondRotation, team.sideSize, 3_000),
        team.sideSize,
      ),
    ).toEqual([]);
  });

  it.each(FORMATIONS)(
    "fills every offered count for $id across rotation cycles",
    (formation) => {
      const team = INITIAL_TEAMS[formation.sideSize === 5 ? "u8" : "u12"];
      let game = createGame(
        team,
        formation.id,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      game.assignments = assignStartingPlayersByPreference(
        formation,
        game.presentIds,
        team.roster,
      );
      game.benchIds = game.presentIds.filter(
        (id) => !Object.values(game.assignments).includes(id),
      );
      const interval = getSubstitutionReminderStatus(game).intervalSeconds;
      for (let cycle = 0; cycle < 3; cycle += 1) {
        for (const elapsed of [
          cycle * interval,
          cycle * interval + 120,
          (cycle + 1) * interval,
        ]) {
          game.clock.elapsedSeconds = elapsed;
          const maximum = getMaxSubstitutionCount(game, team);
          const recommended = getRecommendedSubstitutionCount(game, team);
          expect(recommended).toBeGreaterThan(0);
          expect(recommended).toBeLessThanOrEqual(maximum);
          for (let count = 1; count <= maximum; count += 1) {
            const pairs = suggestSubstitutions(game, count, team);
            expect(pairs).toHaveLength(count);
            expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
            expect(
              validateGame(
                applySubstitutions(game, pairs, team.sideSize, 2_000),
                team.sideSize,
              ),
            ).toEqual([]);
          }
        }
        game = applySubstitutions(
          game,
          suggestSubstitutions(
            game,
            getRecommendedSubstitutionCount(game, team),
            team,
          ),
          team.sideSize,
          2_000,
        );
      }
    },
  );

  it("keeps the full default when the newly benched players form one cohort", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster = team.roster.slice(0, 9);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    let game = createGame(
      team,
      "5-2-2",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    team.roster.find(
      (player) => player.id === game.assignments.gk,
    )!.preferredRoles = ["goalkeeper"];
    Object.values(game.assignments).forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 5 * 60;
    });
    game.clock.elapsedSeconds = 5 * 60;
    const outgoingPositions = Object.keys(game.assignments).filter(
      (positionId) => positionId !== "gk",
    );
    const incomingIds = [...game.benchIds];
    game = applySubstitutions(
      game,
      incomingIds.map((inPlayerId, index) => ({
        positionId: outgoingPositions[index],
        outPlayerId: game.assignments[outgoingPositions[index]],
        inPlayerId,
      })),
      team.sideSize,
      2_000,
    );

    expect(getRecommendedSubstitutionCount(game, team)).toBe(4);
    expect(suggestSubstitutions(game, 4, team)).toHaveLength(4);
  });

  it("keeps ready substitutions attached to outgoing players after position changes", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 1, team);
    const queued = queueSubstitutions(game, pairs);
    const originalPositionId = pairs[0].positionId;
    const targetPositionId = originalPositionId === "m" ? "f" : "m";
    const changed = movePlayer(
      queued,
      pairs[0].outPlayerId,
      targetPositionId,
      2_000,
    );

    expect(changed.queuedSubstitutions).toEqual([
      { ...pairs[0], positionId: targetPositionId },
    ]);
    expect(
      validateSubstitutionPairs(changed, changed.queuedSubstitutions!),
    ).toEqual([]);

    const applied = applySubstitutions(
      changed,
      changed.queuedSubstitutions!,
      team.sideSize,
      3_000,
    );
    expect(applied.assignments[targetPositionId]).toBe(pairs[0].inPlayerId);
    expect(applied.benchIds).toContain(pairs[0].outPlayerId);

    const undoneMove = undoLastEvent(changed, 3_000);
    expect(undoneMove.assignments).toEqual(queued.assignments);
    expect(undoneMove.queuedSubstitutions).toEqual(pairs);
  });

  it("updates both ready positions when planned outgoing players swap", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 2, team);
    const queued = queueSubstitutions(game, pairs);
    const changed = movePlayer(
      queued,
      pairs[0].outPlayerId,
      pairs[1].positionId,
      2_000,
    );

    expect(changed.queuedSubstitutions).toEqual([
      { ...pairs[0], positionId: pairs[1].positionId },
      { ...pairs[1], positionId: pairs[0].positionId },
    ]);
    expect(
      validateSubstitutionPairs(changed, changed.queuedSubstitutions!),
    ).toEqual([]);
  });

  it("suggests the least-played players and confirms swaps atomically", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const [firstBench, secondBench] = game.benchIds;
    game.totals[firstBench].fieldSeconds = 120;
    game.totals[secondBench].fieldSeconds = 30;
    const pairs = suggestSubstitutions(game, 2, team);

    expect(pairs.map((pair) => pair.inPlayerId)).toContain(secondBench);
    const next = applySubstitutions(game, pairs, team.sideSize, 2_000);
    expect(validateGame(next, team.sideSize)).toEqual([]);
    expect(Object.values(next.assignments)).toContain(firstBench);
    expect(Object.values(next.assignments)).toContain(secondBench);
    expect(next.history).toHaveLength(1);
  });

  it("keeps played-time fairness ahead of position preference", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const [leastPlayed, preferredBenchPlayer] = game.benchIds;
    game.totals[leastPlayed].fieldSeconds = 30;
    game.totals[preferredBenchPlayer].fieldSeconds = 300;
    team.roster.find((player) => player.id === leastPlayed)!.preferredRoles = [
      "forward",
    ];
    team.roster.find(
      (player) => player.id === preferredBenchPlayer,
    )!.preferredRoles = ["midfielder"];

    const [pair] = suggestSubstitutions(game, 1, team);

    expect(pair.inPlayerId).toBe(leastPlayed);
  });

  it("uses outside-preference destinations only as a fallback", () => {
    const team = structuredClone(INITIAL_TEAMS.u12);
    const game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      60,
      1_000,
    );
    const william = team.roster.find((player) => player.name === "William")!;
    william.preferredRoles = ["midfielder", "forward"];
    const goalkeeperId = game.assignments.gk;
    const strikerId = game.assignments.f;
    game.benchIds = [
      william.id,
      ...game.benchIds.filter((playerId) => playerId !== william.id),
    ];
    const williamPosition = Object.entries(game.assignments).find(
      ([, playerId]) => playerId === william.id,
    )?.[0];
    if (williamPosition) {
      game.assignments[williamPosition] = game.benchIds[1];
      game.benchIds = game.benchIds.filter(
        (playerId) => playerId !== game.assignments[williamPosition],
      );
    }
    game.benchIds
      .filter((playerId) => playerId !== william.id)
      .forEach((playerId) => {
        const player = team.roster.find((item) => item.id === playerId)!;
        game.totals[playerId].fieldSeconds = player.preferredRoles.includes(
          "goalkeeper",
        )
          ? 10 * 60
          : 60;
      });
    game.totals[goalkeeperId].fieldSeconds = 5 * 60;
    game.totals[strikerId].fieldSeconds = 3 * 60;

    const [pair] = suggestSubstitutions(game, 1, team);

    expect(pair.inPlayerId).toBe(william.id);
    expect(pair.positionId).toBe("f");
    expect(pair.outPlayerId).toBe(strikerId);
  });

  it("plans for recently entered players reaching the next rotation window", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    team.roster.find(
      (player) => player.id === game.assignments.gk,
    )!.preferredRoles = ["goalkeeper"];
    const formation = getFormation(game.formationId);
    const defender = formation.positions.find(
      (position) => position.role === "defender",
    )!;
    const forward = formation.positions.find(
      (position) => position.role === "forward",
    )!;
    const midfielders = formation.positions.filter(
      (position) => position.role === "midfielder",
    );
    const initialBench = [...game.benchIds];
    game.clock.elapsedSeconds = 500;
    game = applySubstitutions(
      game,
      [
        {
          positionId: defender.id,
          outPlayerId: game.assignments[defender.id],
          inPlayerId: initialBench[0],
        },
        {
          positionId: forward.id,
          outPlayerId: game.assignments[forward.id],
          inPlayerId: initialBench[1],
        },
      ],
      team.sideSize,
      2_000,
    );
    game.clock.elapsedSeconds = 600;

    const longStintPlayer = game.assignments[midfielders[0].id];
    const otherLongStintPlayer = game.assignments[midfielders[1].id];
    const recentlyEnteredPlayers = [
      game.assignments[defender.id],
      game.assignments[forward.id],
    ];
    game.totals[longStintPlayer].fieldSeconds = 900;
    game.totals[otherLongStintPlayer].fieldSeconds = 300;
    recentlyEnteredPlayers.forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 1_200;
    });
    game.totals[game.benchIds[0]].fieldSeconds = 0;
    game.totals[game.benchIds[1]].fieldSeconds = 1_200;
    team.roster.find(
      (player) => player.id === game.benchIds[0],
    )!.preferredRoles = ["midfielder"];

    const [pair] = suggestSubstitutions(game, 1, team);

    expect(recentlyEnteredPlayers).toContain(pair.outPlayerId);
  });

  it("projects fresh players to the next window before applying aggregate fairness", () => {
    const createScenario = (substitutionAtSeconds: number) => {
      const team = structuredClone(INITIAL_TEAMS.u12);
      team.roster.forEach((player) => {
        player.preferredRoles = player.preferredRoles.filter(
          (role) => role !== "goalkeeper",
        );
      });
      let game = createGame(
        team,
        "9-3-1-3-1",
        team.roster.slice(0, 12).map((player) => player.id),
        60,
        1_000,
      );
      team.roster.find(
        (player) => player.id === game.assignments.gk,
      )!.preferredRoles = ["goalkeeper"];
      const formation = getFormation(game.formationId);
      const defenders = formation.positions.filter(
        (position) => position.role === "defender",
      );
      const replacementId = game.benchIds[0];
      game.clock.elapsedSeconds = substitutionAtSeconds;
      game = applySubstitutions(
        game,
        [
          {
            positionId: defenders[0].id,
            outPlayerId: game.assignments[defenders[0].id],
            inPlayerId: replacementId,
          },
        ],
        team.sideSize,
        2_000,
      );
      game.clock.elapsedSeconds = 10 * 60;

      const normalComparisonId = game.assignments[defenders[1].id];
      game.totals[replacementId].fieldSeconds = 30 * 60;
      game.totals[normalComparisonId].fieldSeconds = 27 * 60;
      Object.values(game.assignments)
        .filter(
          (playerId) =>
            playerId !== replacementId &&
            playerId !== normalComparisonId &&
            playerId !== game.assignments.gk,
        )
        .forEach((playerId) => {
          game.totals[playerId].fieldSeconds = 0;
        });
      game.benchIds.forEach((playerId, index) => {
        game.totals[playerId].fieldSeconds = index === 0 ? 0 : 40 * 60;
      });
      team.roster.find(
        (player) => player.id === game.benchIds[0],
      )!.preferredRoles = ["defender"];

      return { game, team, replacementId, normalComparisonId };
    };

    const normalScenario = createScenario(4 * 60);
    expect(
      suggestSubstitutions(normalScenario.game, 1, normalScenario.team)[0]
        .outPlayerId,
    ).toBe(normalScenario.replacementId);

    const freshScenario = createScenario(9 * 60);
    expect(
      suggestSubstitutions(freshScenario.game, 1, freshScenario.team)[0]
        .outPlayerId,
    ).toBe(freshScenario.replacementId);
  });

  it("spreads near-equal substitutions across lines", () => {
    const team = structuredClone(INITIAL_TEAMS.u12);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    const game = createGame(
      team,
      "9-3-3-2",
      team.roster.slice(0, 12).map((player) => player.id),
      60,
      1_000,
    );
    const formation = FORMATIONS.find((item) => item.id === game.formationId)!;
    formation.positions.forEach((position) => {
      game.totals[game.assignments[position.id]].fieldSeconds =
        position.role === "defender"
          ? 600
          : position.role === "midfielder"
            ? 550
            : 0;
    });

    const roles = suggestSubstitutions(game, 3, team).map(
      (pair) =>
        formation.positions.find((position) => position.id === pair.positionId)!
          .role,
    );

    expect(roles.filter((role) => role === "defender")).toHaveLength(1);
    expect(roles.filter((role) => role === "midfielder")).toHaveLength(2);
  });

  it("still favors more of an overdue line when its fairness gap is substantial", () => {
    const team = structuredClone(INITIAL_TEAMS.u12);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    const game = createGame(
      team,
      "9-3-3-2",
      team.roster.slice(0, 12).map((player) => player.id),
      60,
      1_000,
    );
    const formation = FORMATIONS.find((item) => item.id === game.formationId)!;
    formation.positions.forEach((position) => {
      game.totals[game.assignments[position.id]].fieldSeconds =
        position.role === "defender"
          ? 600
          : position.role === "midfielder"
            ? 300
            : 0;
    });

    const roles = suggestSubstitutions(game, 3, team).map(
      (pair) =>
        formation.positions.find((position) => position.id === pair.positionId)!
          .role,
    );

    expect(roles.filter((role) => role === "defender")).toHaveLength(3);
    expect(roles.filter((role) => role === "midfielder")).toHaveLength(0);
  });

  it("recommends a fresh player only for the row displaced by an incoming conflict", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster.forEach((player) => {
      player.preferredRoles = ["midfielder"];
    });
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.benchIds.forEach((playerId, index) => {
      game.totals[playerId].fieldSeconds = index * 60;
    });
    const formation = FORMATIONS.find((item) => item.id === game.formationId)!;
    const defender = formation.positions.find(
      (position) => position.role === "defender",
    )!;
    const midfielder = formation.positions.find(
      (position) => position.role === "midfielder",
    )!;
    const forward = formation.positions.find(
      (position) => position.role === "forward",
    )!;
    const [recommended, chosen, unchanged, displaced] = game.benchIds;
    team.roster.find((player) => player.id === recommended)!.preferredRoles = [
      "defender",
    ];
    game.totals[recommended].fieldSeconds = 600;
    game.totals[displaced].fieldSeconds = 0;
    const pairs = [
      {
        positionId: defender.id,
        outPlayerId: game.assignments[defender.id],
        inPlayerId: chosen,
      },
      {
        positionId: midfielder.id,
        outPlayerId: game.assignments[midfielder.id],
        inPlayerId: displaced,
      },
      {
        positionId: forward.id,
        outPlayerId: game.assignments[forward.id],
        inPlayerId: unchanged,
      },
    ];

    const updated = reassignIncomingSubstitution(game, pairs, 1, chosen, team);

    expect(updated[1].inPlayerId).toBe(chosen);
    expect(updated[0].inPlayerId).toBe(recommended);
    expect(updated[0].inPlayerId).not.toBe(displaced);
    expect(updated[2]).toEqual(pairs[2]);
    expect(new Set(updated.map((pair) => pair.inPlayerId)).size).toBe(3);
  });

  it("swaps occupied outgoing destinations without creating duplicates", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 3, team);
    const updated = reassignOutgoingSubstitution(
      game,
      pairs,
      1,
      pairs[0].outPlayerId,
    );

    expect(updated[1]).toMatchObject({
      outPlayerId: pairs[0].outPlayerId,
      positionId: pairs[0].positionId,
      inPlayerId: pairs[1].inPlayerId,
    });
    expect(updated[0]).toMatchObject({
      outPlayerId: pairs[1].outPlayerId,
      positionId: pairs[1].positionId,
      inPlayerId: pairs[0].inPlayerId,
    });
    expect(updated[2]).toEqual(pairs[2]);
    expect(new Set(updated.map((pair) => pair.outPlayerId)).size).toBe(3);
  });

  it("selects a late arrival by played time rather than their short bench stint", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const [firstBench, lateArrival] = game.benchIds;
    game.totals[firstBench] = {
      fieldSeconds: 300,
      benchSeconds: 900,
    };
    game.totals[lateArrival] = {
      fieldSeconds: 0,
      benchSeconds: 30,
    };

    expect(suggestSubstitutions(game, 1, team)[0].inPlayerId).toBe(lateArrival);
  });

  it("prepares a benched successor for the two-interval keeper target", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    team.roster[0].preferredRoles = ["goalkeeper", "defender"];
    team.roster[5].preferredRoles = ["goalkeeper", "defender"];
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const goalkeeperId = game.assignments.gk;
    const reserveGoalkeeper = game.benchIds[0];
    team.roster.find(
      (player) => player.id === reserveGoalkeeper,
    )!.preferredRoles = ["goalkeeper", "defender"];

    game.clock.elapsedSeconds =
      getGoalkeeperStintSeconds(game) -
      getSubstitutionReminderStatus(game).intervalSeconds;
    expect(getRecommendedSubstitutionCount(game, team)).toBe(1);
    expect(suggestSubstitutions(game, 1, team)[0].inPlayerId).not.toBe(
      reserveGoalkeeper,
    );

    game.totals[goalkeeperId].fieldSeconds =
      getSubstitutionTimeBandSize(game) - 1;
    expect(getRecommendedSubstitutionCount(game, team)).toBe(1);
    expect(suggestSubstitutions(game, 1, team)[0].inPlayerId).not.toBe(
      reserveGoalkeeper,
    );

    game.clock.elapsedSeconds = getGoalkeeperStintSeconds(game);
    game.totals[goalkeeperId].fieldSeconds = game.clock.elapsedSeconds;
    game.totals[reserveGoalkeeper].fieldSeconds = 0;

    expect(getRecommendedSubstitutionCount(game, team)).toBe(2);
    expect(suggestSubstitutions(game, 2, team)[0]).toEqual({
      positionId: "gk",
      outPlayerId: goalkeeperId,
      inPlayerId: reserveGoalkeeper,
    });
  });

  it("returns Rayek outfield when the same rotation rests another keeper option", () => {
    const team = structuredClone(INITIAL_TEAMS.u12);
    let game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      60,
      1_000,
    );
    const rayek = team.roster.find((player) => player.name === "Rayek")!;
    const jackson = team.roster.find((player) => player.name === "Jackson")!;
    Object.values(game.assignments).forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 6 * 60;
    });
    game.benchIds.forEach((playerId) => {
      game.totals[playerId].benchSeconds = 6 * 60;
    });
    game.clock.elapsedSeconds = 6 * 60;
    const firstRotationPositions = Object.keys(game.assignments)
      .filter((positionId) => positionId !== "gk")
      .slice(0, 2);
    game = applySubstitutions(
      game,
      firstRotationPositions.map((positionId, index) => ({
        positionId,
        outPlayerId: game.assignments[positionId],
        inPlayerId: game.benchIds[index],
      })),
      team.sideSize,
      2_000,
    );

    expect(getRecommendedSubstitutionCount(game, team)).toBe(6);
    const stagedPlan = suggestSubstitutions(game, 6, team);
    const rayekPair = stagedPlan.find((pair) => pair.inPlayerId === rayek.id);
    expect(rayekPair).toBeDefined();
    expect(rayekPair?.positionId).not.toBe("gk");
    const atRotation = fastForwardGame(
      game,
      getNextSubstitutionSeconds(game) - game.clock.elapsedSeconds,
      2_000,
    );
    const rotated = applySubstitutions(
      atRotation,
      stagedPlan,
      team.sideSize,
      2_000,
    );
    const preparation = getGoalkeeperPreparation(
      rotated,
      team,
      getNextSubstitutionSeconds(rotated),
    );
    expect(preparation.successorReady).toBe(true);
    expect(stagedPlan.map((pair) => pair.outPlayerId)).toContain(
      preparation.successorId,
    );

    game.clock.elapsedSeconds = getGoalkeeperStintSeconds(game);
    game.totals[jackson.id].fieldSeconds = game.clock.elapsedSeconds;

    const dueCount = getRecommendedSubstitutionCount(game, team);
    expect(suggestSubstitutions(game, dueCount, team)[0]).toEqual({
      positionId: "gk",
      outPlayerId: jackson.id,
      inPlayerId: rayek.id,
    });
  });

  it("performs an atomic handoff to a rested on-field goalkeeper", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const goalkeeperId = game.assignments.gk;
    const reservePositionId = Object.keys(game.assignments).find(
      (positionId) => positionId !== "gk",
    )!;
    const originalOutfieldPlayerId = game.assignments[reservePositionId];
    const reserveGoalkeeperId = game.benchIds[0];
    team.roster.find((player) => player.id === goalkeeperId)!.preferredRoles = [
      "goalkeeper",
    ];
    team.roster.find(
      (player) => player.id === reserveGoalkeeperId,
    )!.preferredRoles = ["goalkeeper", "defender"];
    game.clock.elapsedSeconds = getGoalkeeperStintSeconds(game) - 30;
    game = markUnavailable(
      game,
      originalOutfieldPlayerId,
      team.sideSize,
      2_000,
      { replacementPlayerId: reserveGoalkeeperId },
    );
    game.clock.elapsedSeconds = getGoalkeeperStintSeconds(game);

    const handoff = suggestSubstitutions(game, 1, team)[0];
    expect(handoff).toMatchObject({
      positionId: "gk",
      outPlayerId: goalkeeperId,
      keeperHandoff: {
        playerId: reserveGoalkeeperId,
        fromPositionId: reservePositionId,
      },
    });
    expect(game.benchIds).toContain(handoff.inPlayerId);
    const handedOff = applySubstitutions(game, [handoff], team.sideSize, 3_000);
    expect(handedOff.assignments.gk).toBe(reserveGoalkeeperId);
    expect(handedOff.assignments[reservePositionId]).toBe(handoff.inPlayerId);
    expect(handedOff.benchIds).toContain(goalkeeperId);
    expect(handedOff.benchIds).not.toContain(reserveGoalkeeperId);

    const undone = undoLastEvent(handedOff, team.sideSize);
    expect(undone.assignments).toEqual(game.assignments);
    expect(undone.benchIds).toEqual(game.benchIds);
  });

  it("allows a third goalkeeper to play outfield while preserving a reserve", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster = team.roster.slice(0, 9);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    team.roster[0].preferredRoles = ["goalkeeper"];
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const benchGoalkeepers = [game.benchIds[0], game.benchIds.at(-1)!];
    benchGoalkeepers.forEach((playerId) => {
      team.roster.find((player) => player.id === playerId)!.preferredRoles = [
        "goalkeeper",
        "defender",
      ];
    });

    expect(getRecommendedSubstitutionCount(game, team)).toBe(3);
    const incomingIds = suggestSubstitutions(game, 3, team).map(
      (pair) => pair.inPlayerId,
    );
    expect(
      incomingIds.filter((playerId) => benchGoalkeepers.includes(playerId)),
    ).toHaveLength(1);
  });

  it("allows a rotated goalkeeper to return in an outfield role", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    team.roster.forEach((player) => {
      player.preferredRoles = player.preferredRoles.filter(
        (role) => role !== "goalkeeper",
      );
    });
    team.roster[0].preferredRoles = ["goalkeeper", "defender"];
    team.roster[5].preferredRoles = ["goalkeeper", "defender"];
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
      4,
    );
    const originalGoalkeeper = game.assignments.gk;
    const reserveGoalkeeper = game.benchIds[0];
    team.roster.find(
      (player) => player.id === reserveGoalkeeper,
    )!.preferredRoles = ["goalkeeper", "defender"];
    game.clock.elapsedSeconds = getGoalkeeperStintSeconds(game);
    game.period = { current: 3, startedAtSeconds: game.clock.elapsedSeconds };
    game.totals[originalGoalkeeper].fieldSeconds = game.clock.elapsedSeconds;
    game.totals[reserveGoalkeeper].fieldSeconds = 0;

    const goalkeeperRotation = suggestSubstitutions(game, 2, team).find(
      (pair) => pair.positionId === "gk",
    )!;
    game = applySubstitutions(game, [goalkeeperRotation], team.sideSize, 2_000);
    game.benchIds
      .filter((playerId) => playerId !== originalGoalkeeper)
      .forEach((playerId) => {
        game.totals[playerId].fieldSeconds =
          game.totals[originalGoalkeeper].fieldSeconds +
          getSubstitutionTimeBandSize(game);
      });

    const outfieldReturn = suggestSubstitutions(game, 2, team).find(
      (pair) => pair.inPlayerId === originalGoalkeeper,
    )!;
    expect(outfieldReturn).toBeDefined();
    const returnRole = getFormation(game.formationId).positions.find(
      (position) => position.id === outfieldReturn.positionId,
    )!.role;

    expect(outfieldReturn.inPlayerId).toBe(originalGoalkeeper);
    expect(returnRole).toBe("defender");
  });

  it("tracks the current bench stint separately from aggregate bench time", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const pair = suggestSubstitutions(game, 1, team)[0];
    const playerId = pair.inPlayerId;
    game.clock.elapsedSeconds = 300;
    expect(getCurrentBenchSeconds(game, playerId)).toBe(300);

    game = applySubstitutions(game, [pair], team.sideSize, 1_000);
    game.clock.elapsedSeconds = 420;
    game = applySubstitutions(
      game,
      [
        {
          positionId: pair.positionId,
          outPlayerId: pair.inPlayerId,
          inPlayerId: pair.outPlayerId,
        },
      ],
      team.sideSize,
      1_000,
    );
    game.clock.elapsedSeconds = 480;

    expect(getCurrentBenchSeconds(game, playerId)).toBe(60);
  });

  it("tracks the current field stint across substitutions and position changes", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const pair = suggestSubstitutions(game, 1, team)[0];
    const playerId = pair.inPlayerId;
    game.clock.elapsedSeconds = 300;
    game = applySubstitutions(game, [pair], team.sideSize, 1_000);
    game.clock.elapsedSeconds = 390;

    expect(getCurrentFieldSeconds(game, playerId)).toBe(90);

    const targetPositionId = Object.keys(game.assignments).find(
      (positionId) => positionId !== pair.positionId,
    )!;
    game = movePlayer(game, playerId, targetPositionId, 1_000);
    game.clock.elapsedSeconds = 450;

    expect(getCurrentFieldSeconds(game, playerId)).toBe(150);
    expect(getCurrentFieldSeconds(game, pair.outPlayerId)).toBe(0);
  });

  it("undoes the most recent confirmed substitution", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-2-2",
      team.roster.slice(0, 6).map((player) => player.id),
      40,
      1_000,
    );
    const beforeAssignments = structuredClone(game.assignments);
    const beforeBench = [...game.benchIds];
    const changed = applySubstitutions(
      game,
      suggestSubstitutions(game, 1, team),
      team.sideSize,
      2_000,
    );
    const undone = undoLastEvent(changed, 3_000);

    expect(undone.assignments).toEqual(beforeAssignments);
    expect(undone.benchIds).toEqual(beforeBench);
    expect(undone.history).toHaveLength(0);
  });

  it("rejects duplicate incoming players", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-1-2",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const pairs = suggestSubstitutions(game, 2, team);
    pairs[1].inPlayerId = pairs[0].inPlayerId;

    expect(() => applySubstitutions(game, pairs, team.sideSize, 2_000)).toThrow(
      "Each incoming player can only appear once",
    );
  });
});

describe("short-sided games", () => {
  it("accepts fewer present players than the nominal side size", () => {
    const team = INITIAL_TEAMS.u12;
    const game = createGame(
      team,
      "9-3-3-2",
      team.roster.slice(0, 7).map((player) => player.id),
      60,
      1_000,
    );

    expect(Object.keys(game.assignments)).toHaveLength(7);
    expect(game.benchIds).toHaveLength(0);
    expect(validateGame(game, team.sideSize)).toEqual([]);
  });
});
