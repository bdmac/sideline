import { describe, expect, it } from "vitest";
import {
  createGame,
  areSubstitutionPlansEqual,
  INITIAL_TEAMS,
  suggestAdditionalSubstitution,
  suggestSubstitutions,
  validateSubstitutionPairs,
} from "./domain";
import { keeperHandoffGame } from "./test/keeperHandoffFixtures";

describe("incremental substitution suggestions", () => {
  it("compares complete pairings and handoffs without treating row order as a change", () => {
    const { pairs } = keeperHandoffGame();
    const original = structuredClone(pairs);
    expect(areSubstitutionPlansEqual(pairs, [...pairs].reverse())).toBe(true);
    expect(areSubstitutionPlansEqual([], [])).toBe(true);
    expect(areSubstitutionPlansEqual(pairs, pairs.slice(1))).toBe(false);
    for (const patch of [
      { positionId: "different" },
      { outPlayerId: "different" },
      { inPlayerId: "different" },
      { keeperHandoff: undefined },
      { keeperHandoff: { ...pairs[0].keeperHandoff!, playerId: "different" } },
      {
        keeperHandoff: {
          ...pairs[0].keeperHandoff!,
          fromPositionId: "different",
        },
      },
    ]) {
      expect(
        areSubstitutionPlansEqual(pairs, [
          { ...pairs[0], ...patch },
          ...pairs.slice(1),
        ]),
      ).toBe(false);
    }
    expect(
      areSubstitutionPlansEqual([pairs[0], pairs[0]], [pairs[0], pairs[1]]),
    ).toBe(false);
    expect(pairs).toEqual(original);
  });
  it.each(["u8", "u12"] as const)(
    "adds one deterministic %s pairing without changing existing choices or game state",
    (teamId) => {
      const team = INITIAL_TEAMS[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const pairs = suggestSubstitutions(game, 2, team);
      const before = structuredClone({ game, pairs });
      const extra = suggestAdditionalSubstitution(game, pairs, team);
      expect(extra).toBeDefined();
      expect(suggestAdditionalSubstitution(game, pairs, team)).toEqual(extra);
      expect(
        pairs.some(
          (pair) =>
            pair.inPlayerId === extra!.inPlayerId ||
            pair.outPlayerId === extra!.outPlayerId,
        ),
      ).toBe(false);
      expect(validateSubstitutionPairs(game, [...pairs, extra!])).toEqual([]);
      expect({ game, pairs }).toEqual(before);
    },
  );

  it.each(["u8", "u12"] as const)(
    "reserves both field players in an existing %s keeper handoff",
    (teamId) => {
      const { game, team, pairs } = keeperHandoffGame(teamId);
      const draft = [pairs[0]];
      const capacity = Math.min(
        game.benchIds.length,
        Object.keys(game.assignments).length - 1,
      );
      while (draft.length < capacity) {
        const extra = suggestAdditionalSubstitution(game, draft, team);
        expect(extra).toBeDefined();
        expect(extra!.outPlayerId).not.toBe(pairs[0].keeperHandoff!.playerId);
        expect(extra!.outPlayerId).not.toBe(pairs[0].outPlayerId);
        draft.push(extra!);
        expect(validateSubstitutionPairs(game, draft)).toEqual([]);
      }
      expect(suggestAdditionalSubstitution(game, draft, team)).toBeUndefined();
      expect(draft[0]).toEqual(pairs[0]);
    },
  );

  it("allows explicitly adding the sole remaining keeper pairing without moving prior swaps", () => {
    const team = structuredClone(INITIAL_TEAMS.u8);
    const game = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((p) => p.id),
      40,
      1_000,
    );
    team.roster.forEach((p) => {
      p.preferredRoles = ["defender"];
    });
    const pairs = Object.entries(game.assignments)
      .filter(([position]) => position !== "gk")
      .map(([positionId, outPlayerId], index) => ({
        positionId,
        outPlayerId,
        inPlayerId: game.benchIds[index],
      }));
    const extra = suggestAdditionalSubstitution(game, pairs, team);
    expect(extra).toEqual({
      positionId: "gk",
      outPlayerId: game.assignments.gk,
      inPlayerId: game.benchIds[4],
    });
    expect(validateSubstitutionPairs(game, [...pairs, extra!])).toEqual([]);
  });

  it("returns no pairing when there is no bench or no available outgoing slot", () => {
    const { game, team } = keeperHandoffGame();
    expect(
      suggestAdditionalSubstitution({ ...game, benchIds: [] }, [], team),
    ).toBeUndefined();
    expect(
      suggestAdditionalSubstitution({ ...game, assignments: {} }, [], team),
    ).toBeUndefined();
  });
});
