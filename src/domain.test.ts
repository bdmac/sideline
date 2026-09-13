import { describe, expect, it } from "vitest";
import {
  applySubstitutions,
  assignPlayerToPosition,
  createGame,
  FORMATIONS,
  getFormationsForTeam,
  getPeriodStatus,
  INITIAL_TEAMS,
  materializeGame,
  suggestSubstitutions,
  undoLastEvent,
  validateFormation,
  validateGame,
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

describe("period accounting", () => {
  it("tracks U8 quarters and U12 halves at their boundaries", () => {
    expect(getPeriodStatus(40 * 60, 9 * 60, 4)).toEqual({
      current: 1,
      count: 4,
      label: "Quarter",
      remainingSeconds: 60,
    });
    expect(getPeriodStatus(40 * 60, 10 * 60, 4)).toEqual({
      current: 2,
      count: 4,
      label: "Quarter",
      remainingSeconds: 10 * 60,
    });
    expect(getPeriodStatus(60 * 60, 35 * 60, 2)).toEqual({
      current: 2,
      count: 2,
      label: "Half",
      remainingSeconds: 25 * 60,
    });
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

describe("substitutions", () => {
  it("suggests the longest-benched players and confirms swaps atomically", () => {
    const team = INITIAL_TEAMS.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const [firstBench, secondBench] = game.benchIds;
    game.totals[firstBench].benchSeconds = 120;
    game.totals[secondBench].benchSeconds = 240;
    const pairs = suggestSubstitutions(game, 2);

    expect(pairs[0].inPlayerId).toBe(secondBench);
    const next = applySubstitutions(game, pairs, team.sideSize, 2_000);
    expect(validateGame(next, team.sideSize)).toEqual([]);
    expect(Object.values(next.assignments)).toContain(firstBench);
    expect(Object.values(next.assignments)).toContain(secondBench);
    expect(next.history).toHaveLength(1);
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
      suggestSubstitutions(game, 1),
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
    const pairs = suggestSubstitutions(game, 2);
    pairs[1].inPlayerId = pairs[0].inPlayerId;

    expect(() => applySubstitutions(game, pairs, team.sideSize, 2_000)).toThrow(
      "Each player can only appear in one swap",
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
