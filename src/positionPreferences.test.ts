import { beforeEach, describe, expect, it } from "vitest";
import {
  FORMATIONS,
  INITIAL_STATE,
  applySubstitutions,
  assignPlayersByPreference,
  createGame,
  fastForwardGame,
  getFormation,
  queueSubstitutions,
  suggestSubstitutions,
  undoLastEvent,
  validateGame,
} from "./domain";
import {
  getPositionPreferenceIndex,
  U12_PREFERENCE_GROUPS,
} from "./positionPreferences";
import { preferredRoleAbbreviation, preferredRoleLabel } from "./playerLabels";
import {
  compareStarterPlayersByPreference,
  getStarterLineupAdvice,
  previewStarterMove,
  starterPreferenceFit,
} from "./starterLineupModel";
import { loadState, saveState } from "./storage";
import type { Player } from "./types";

const player = (
  id: string,
  preferredRoles: Player["preferredRoles"],
): Player => ({
  id,
  name: id,
  active: true,
  preferredRoles,
});

describe("U12 position preference groups", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each([
    ["9-3-1-3-1", ["dc"], ["dl", "dr"], ["dm", "mc"], ["ml", "mr"]],
    ["9-3-3-2", ["dc"], ["dl", "dr"], ["mc"], ["ml", "mr"]],
    ["9-3-2-3", ["dc"], ["dl", "dr"], ["ml", "mr"], []],
    ["9-2-3-3", [], ["dl", "dr"], ["mc"], ["ml", "mr"]],
  ] as const)(
    "maps all central and wide positions in %s",
    (id, centerBack, outsideBack, centralMidfield, wideMidfield) => {
      const formation = getFormation(id);
      for (const [group, ids] of [
        ["center-back", centerBack],
        ["outside-back", outsideBack],
        ["central-midfield", centralMidfield],
        ["wide-midfield", wideMidfield],
      ] as const) {
        expect(
          formation.positions
            .filter((p) => p.preferenceGroup === group)
            .map((p) => p.id),
        ).toEqual(ids);
      }
      expect(formation.positions).toHaveLength(9);
      expect(
        formation.positions.find((p) => p.id === "gk")?.preferenceGroup,
      ).toBe("goalkeeper");
      expect(
        formation.positions
          .filter((p) => p.role === "forward")
          .every((p) => p.preferenceGroup === "forward"),
      ).toBe(true);
    },
  );

  it("preserves broad preferences at equal rank for both subgroups and leaves U8 unchanged", () => {
    const broad = player("broad", ["forward", "midfielder", "defender"]);
    for (const formation of FORMATIONS) {
      for (const position of formation.positions) {
        expect(getPositionPreferenceIndex(broad, position)).toBe(
          broad.preferredRoles.indexOf(position.role),
        );
        if (formation.sideSize === 5)
          expect(position.preferenceGroup).toBeUndefined();
      }
    }
  });

  it("uses one central midfield preference for HM and CM, but not wide midfield or center back", () => {
    const formation = getFormation("9-3-1-3-1");
    const central = player("Central", ["central-midfield"]);
    expect(
      formation.positions
        .filter((p) => getPositionPreferenceIndex(central, p) === 0)
        .map((p) => p.id),
    ).toEqual(["dm", "mc"]);
    const wide = player("Wide", ["wide-midfield"]);
    const cm = formation.positions.find((p) => p.id === "mc")!;
    expect(
      [wide, central].sort((a, b) =>
        compareStarterPlayersByPreference(a, b, cm),
      ),
    ).toEqual([central, wide]);
    const advice = getStarterLineupAdvice(
      formation,
      { mc: wide.id, ml: central.id },
      [central, wide],
    );
    expect(advice.issuesByPosition.mc).toEqual(["Wide prefers wide midfield."]);
    expect(advice.issuesByPosition.ml).toEqual([
      "Central prefers central midfield.",
    ]);
    const moved = previewStarterMove(
      formation,
      { mc: wide.id, ml: central.id },
      [central, wide],
      central.id,
      "mc",
    );
    expect(moved.advice.concerns).toEqual([]);
    expect(moved.feedback.every((entry) => !entry.outsidePreferences)).toBe(
      true,
    );
  });

  it.each(U12_PREFERENCE_GROUPS)(
    "gives sixth-ranked %s a positive starter preference over an unlisted group",
    (group) => {
      const formation = getFormation("9-3-1-3-1");
      const position = formation.positions.find(
        (p) => p.preferenceGroup === group,
      )!;
      const ranked = player("ranked", [
        ...U12_PREFERENCE_GROUPS.filter((p) => p !== group),
        group,
      ]);
      const unlisted = player("unlisted", []);
      expect(starterPreferenceFit(ranked, position)).toBe("6th preference");
      expect(
        starterPreferenceFit(
          { ...ranked, preferredRoles: ranked.preferredRoles.slice(1) },
          position,
        ),
      ).toBe("5th preference");
      expect(
        assignPlayersByPreference(
          { ...formation, positions: [position] },
          [unlisted.id, ranked.id],
          [unlisted, ranked],
        ),
      ).toEqual({ [position.id]: ranked.id });
    },
  );

  it.each([
    "center-back",
    "outside-back",
    "central-midfield",
    "wide-midfield",
  ] as const)(
    "uses %s for substitutions and preserves preferences, queued plans, and undo across reload",
    (group) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u12;
      team.roster = team.roster.map((p, index) => ({
        ...p,
        preferredRoles:
          index === 0 ? ["goalkeeper"] : index === 9 ? [group] : [],
      }));
      let game = createGame(
        team,
        "9-3-1-3-1",
        team.roster.slice(0, 10).map((p) => p.id),
        60,
        1000,
      );
      game = fastForwardGame(game, 600, 1000);
      const before = structuredClone(game);
      const pairs = suggestSubstitutions(game, 1, team);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].inPlayerId).toBe(team.roster[9].id);
      expect(
        getFormation(game.formationId).positions.find(
          (p) => p.id === pairs[0].positionId,
        )?.preferenceGroup,
      ).toBe(group);
      state.activeGame = queueSubstitutions(game, pairs);
      saveState(state);
      const loaded = loadState();
      expect(loaded).toEqual(state);
      const changed = applySubstitutions(loaded.activeGame!, pairs, 9, 1000);
      expect(validateGame(changed, 9)).toEqual([]);
      const undone = undoLastEvent(changed, 9);
      expect(undone.assignments).toEqual(before.assignments);
      expect(undone.totals).toEqual(before.totals);
      expect(game).toEqual(before);
    },
  );

  it("provides unambiguous labels and abbreviations for all six groups", () => {
    expect(U12_PREFERENCE_GROUPS.map(preferredRoleLabel)).toEqual([
      "Goalkeeper",
      "Center back",
      "Outside back",
      "Central midfield",
      "Wide midfield",
      "Forward",
    ]);
    expect(U12_PREFERENCE_GROUPS.map(preferredRoleAbbreviation)).toEqual([
      "GK",
      "CB",
      "OB",
      "CM",
      "WM",
      "FWD",
    ]);
  });
});
