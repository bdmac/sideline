import { describe, expect, it } from "vitest";
import type { Player } from "./types";
import {
  addGuestPlayer,
  addGuestPlayerToBench,
  applySubstitutions,
  assignPlayerToPosition,
  assignPlayersByPreference,
  createGame,
  endCurrentPeriod,
  FORMATIONS,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getFormationsForTeam,
  getPeriodStatus,
  getRecommendedSubstitutionCount,
  getScore,
  getSubstitutionReminderStatus,
  INITIAL_TEAMS,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  queueBenchSubstitution,
  queueSubstitutions,
  reassignIncomingSubstitution,
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

describe("formations", () => {
  it("defines exactly one goalkeeper and the correct total side size", () => {
    expect(FORMATIONS.flatMap(validateFormation)).toEqual([]);
    expect(
      FORMATIONS.filter((formation) => formation.sideSize === 5).map(
        (formation) => formation.name,
      ),
    ).toEqual(["1-2-1", "2-2", "1-1-2"]);
    expect(
      getFormationsForTeam(INITIAL_TEAMS.u12).map(
        (formation) => formation.name,
      ),
    ).toEqual(["3-1-3-1", "3-3-2", "3-2-3", "2-3-3"]);
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
    expect(players.every((player) => player.preferredRoles.length <= 4)).toBe(
      true,
    );
    expect(
      INITIAL_TEAMS.u8.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Maddox", "Henry", "Evan"]);
    expect(
      INITIAL_TEAMS.u12.roster
        .filter((player) => player.preferredRoles.includes("goalkeeper"))
        .map((player) => player.name),
    ).toEqual(["Jackson", "Matt", "Rayek"]);
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
      team.roster.find((player) => player.name === "Simon")?.id,
    );
    expect(assignments.f).toBe(
      team.roster.find((player) => player.name === "Malik")?.id,
    );
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
    const nextAddedTime = materializeGame(nextPeriod, 608_000);
    expect(nextAddedTime.clock.elapsedSeconds).toBe(20 * 60 + 5);
    expect(
      getPeriodStatus(
        nextAddedTime.durationSeconds,
        nextAddedTime.clock.elapsedSeconds,
        nextAddedTime.periodCount,
        nextAddedTime.period,
      ),
    ).toMatchObject({
      current: 2,
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
  it("prompts U8 after one eighth of game time and resets after an executed substitution", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
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

  it("resets the reminder after an automatic replacement", () => {
    const team = INITIAL_TEAMS.u8;
    let game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
    );
    game.clock.elapsedSeconds = 300;
    game = markUnavailable(
      game,
      Object.values(game.assignments)[0],
      team.sideSize,
      2_000,
    );

    game.clock.elapsedSeconds = 599;
    expect(getSubstitutionReminderStatus(game).due).toBe(false);
    game.clock.elapsedSeconds = 600;
    expect(getSubstitutionReminderStatus(game).due).toBe(true);
  });

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

    expect(roles.filter((role) => role === "defender")).toHaveLength(2);
    expect(roles.filter((role) => role === "midfielder")).toHaveLength(1);
  });

  it("still favors a whole line when its fairness gap is substantial", () => {
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

    expect(roles).toEqual(["defender", "defender", "defender"]);
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

  it("keeps a second goalkeeper in reserve until they are due to rotate in goal", () => {
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

    expect(getRecommendedSubstitutionCount(game, team)).toBe(1);
    expect(suggestSubstitutions(game, 1, team)[0].inPlayerId).not.toBe(
      reserveGoalkeeper,
    );

    game.totals[goalkeeperId].fieldSeconds = 600;
    game.totals[reserveGoalkeeper].fieldSeconds = 0;

    expect(getRecommendedSubstitutionCount(game, team)).toBe(2);
    expect(suggestSubstitutions(game, 2, team)[0]).toEqual({
      positionId: "gk",
      outPlayerId: goalkeeperId,
      inPlayerId: reserveGoalkeeper,
    });
  });

  it("allows a third goalkeeper to play outfield while preserving a reserve", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
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
