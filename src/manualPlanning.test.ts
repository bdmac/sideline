import { describe, expect, it } from "vitest";
import {
  INITIAL_TEAMS,
  applyImmediateSubstitution,
  applySubstitutions,
  createGame,
  fastForwardGame,
  markUnavailable,
  queueBenchSubstitution,
  queueSubstitutions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { keeperHandoffGame } from "./test/keeperHandoffFixtures";
import type { ActiveGame, TeamId } from "./types";

function plannedGame(teamId: TeamId) {
  const team = INITIAL_TEAMS[teamId];
  const base = fastForwardGame(
    createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      team.defaultDurationMinutes,
      1_000,
    ),
    600,
    1_000,
  );
  const pairs = Object.entries(base.assignments)
    .slice(0, 3)
    .map(([positionId, outPlayerId], index) => ({
      positionId,
      outPlayerId,
      inPlayerId: base.benchIds[index],
    }));
  return { team, pairs, game: queueSubstitutions(base, pairs) };
}

describe("manual planning", () => {
  it.each(["u8", "u12"] as const)(
    "queues and sends only chosen %s swaps atomically",
    (teamId) => {
      const { game, team, pairs } = plannedGame(teamId);
      const empty = { ...game, queuedSubstitutions: undefined };
      let queued: ActiveGame = empty;
      for (const pair of pairs) {
        queued = queueBenchSubstitution(
          queued,
          pair.inPlayerId,
          pair.outPlayerId,
        );
        expect(queued.assignments).toEqual(empty.assignments);
        expect(queued.totals).toEqual(empty.totals);
        expect(queued.history).toEqual(empty.history);
      }
      expect(queued.queuedSubstitutions).toEqual(pairs);
      const sent = applySubstitutions(queued, pairs, team.sideSize, 2_000);
      expect(sent.queuedSubstitutions).toBeUndefined();
      expect(validateGame(sent, team.sideSize)).toEqual([]);
      expect(sent.history.at(-1)?.pairs).toEqual(pairs);
      expect(undoLastEvent(sent, 2_000).assignments).toEqual(game.assignments);
    },
  );

  it.each(["u8", "u12"] as const)(
    "preserves unaffected %s pairs after an unplanned immediate sub",
    (teamId) => {
      const { game, team, pairs } = plannedGame(teamId);
      const outgoing = Object.values(game.assignments)[3];
      const next = applyImmediateSubstitution(
        game,
        game.benchIds[3],
        outgoing,
        team,
        2_000,
      );
      expect(next.queuedSubstitutions).toEqual(pairs);
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(
        validateSubstitutionPairs(next, next.queuedSubstitutions!),
      ).toEqual([]);
      const undo = undoLastEvent(next, 2_000);
      expect(undo.assignments).toEqual(game.assignments);
      expect(undo.queuedSubstitutions).toEqual(pairs);
    },
  );

  it.each(["u8", "u12"] as const)(
    "removes only overlapping %s pairs after an immediate sub",
    (teamId) => {
      const { game, team, pairs } = plannedGame(teamId);
      const next = applyImmediateSubstitution(
        game,
        pairs[0].inPlayerId,
        pairs[1].outPlayerId,
        team,
        2_000,
      );
      expect(next.queuedSubstitutions).toEqual([pairs[2]]);
      expect(next.history.at(-1)?.beforeQueuedSubstitutions).toEqual(pairs);
      expect(undoLastEvent(next, 2_000).queuedSubstitutions).toEqual(pairs);
      expect(validateGame(next, team.sideSize)).toEqual([]);
    },
  );

  it.each(["incoming", "outgoing", "mover"] as const)(
    "removes a handoff as one operation when its %s is used immediately",
    (participant) => {
      const { game, team, pairs, moverId } = keeperHandoffGame();
      const incoming =
        participant === "incoming" ? pairs[0].inPlayerId : "u8-p10";
      const outgoing = participant === "mover" ? moverId : pairs[0].outPlayerId;
      const next = applyImmediateSubstitution(
        game,
        incoming,
        outgoing,
        team,
        2_000,
      );
      expect(next.queuedSubstitutions).toEqual(pairs.slice(1));
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(undoLastEvent(next, 2_000).queuedSubstitutions).toEqual(pairs);
    },
  );

  it("requires a coach-selected injury replacement, keeps unaffected pairs, and supports undo", () => {
    const { game, team, pairs } = plannedGame("u8");
    const before = structuredClone(game);
    for (const replacementPlayerId of [
      undefined,
      "absent-player",
      pairs[0].outPlayerId,
    ]) {
      expect(() =>
        markUnavailable(game, pairs[0].outPlayerId, 5, 2_000, {
          manualPlanning: true,
          replacementPlayerId,
        }),
      ).toThrow("Choose an available bench replacement");
      expect(game).toEqual(before);
    }
    const next = markUnavailable(game, pairs[0].outPlayerId, 5, 2_000, {
      manualPlanning: true,
      replacementPlayerId: game.benchIds[4],
    });
    expect(next.assignments[pairs[0].positionId]).toBe(game.benchIds[4]);
    expect(next.queuedSubstitutions).toEqual(pairs.slice(1));
    expect(validateGame(next, team.sideSize)).toEqual([]);
    expect(undoLastEvent(next, 2_000).queuedSubstitutions).toEqual(pairs);
  });

  it("does not require a replacement for a bench removal or with no bench", () => {
    const { game, team } = plannedGame("u8");
    const next = markUnavailable(game, game.benchIds[0], 5, 2_000, {
      manualPlanning: true,
    });
    expect(next.assignments).toEqual(game.assignments);
    const short = createGame(
      team,
      team.defaultFormationId,
      team.roster.slice(0, 5).map((p) => p.id),
      50,
    );
    const removed = markUnavailable(
      short,
      Object.values(short.assignments)[0],
      5,
      2_000,
      { manualPlanning: true },
    );
    expect(Object.values(removed.assignments)).toHaveLength(4);
    expect(validateGame(removed, 5)).toEqual([]);
  });

  it("removes an invalid handoff after its moving keeper is taken out", () => {
    const { game, pairs, moverId } = keeperHandoffGame();
    const next = markUnavailable(game, moverId, 5, 2_000, {
      manualPlanning: true,
      replacementPlayerId: "u8-p10",
    });
    expect(next.queuedSubstitutions).toEqual(pairs.slice(1));
    expect(validateSubstitutionPairs(next, next.queuedSubstitutions!)).toEqual(
      [],
    );
  });
});
