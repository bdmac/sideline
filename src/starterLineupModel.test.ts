import { describe, expect, it } from "vitest";
import { FORMATIONS } from "./domain";
import type { Player, PositionRole } from "./types";
import {
  compareStarterPlayersByPreference,
  getStarterLineupAdvice,
  previewStarterMove,
  starterPreferenceFit,
} from "./starterLineupModel";

export const lineupPlayers: Player[] = [
  {
    id: "keeper",
    name: "Keeper",
    active: true,
    preferredRoles: ["goalkeeper"],
  },
  {
    id: "defender",
    name: "Defender",
    active: true,
    preferredRoles: ["defender", "midfielder"],
  },
  {
    id: "reserve",
    name: "Reserve",
    active: true,
    preferredRoles: ["goalkeeper", "forward"],
  },
  { id: "forward", name: "Forward", active: true, preferredRoles: ["forward"] },
];

describe("starter lineup advice", () => {
  it.each<PositionRole>(["goalkeeper", "defender", "midfielder", "forward"])(
    "sorts %s matches by preference rank, then unknown preferences, then non-matches",
    (role) => {
      const otherRoles: PositionRole[] = [
        "goalkeeper",
        "defender",
        "midfielder",
        "forward",
      ].filter((item): item is PositionRole => item !== role);
      const players: Player[] = [
        { id: "1", name: "Zane", active: true, preferredRoles: [role] },
        { id: "2", name: "Ada", active: true, preferredRoles: [otherRoles[0]] },
        {
          id: "3",
          name: "Theo",
          active: true,
          preferredRoles: [otherRoles[0], role],
        },
        {
          id: "4",
          name: "Uma",
          active: true,
          preferredRoles: [...otherRoles.slice(0, 2), role],
        },
        {
          id: "5",
          name: "Vera",
          active: true,
          preferredRoles: [...otherRoles, role],
        },
        { id: "6", name: "Bailey", active: true, preferredRoles: [] },
        { id: "7", name: "Alex", active: true, preferredRoles: [] },
        { id: "8", name: "Yara", active: true, preferredRoles: [role] },
      ];
      const before = structuredClone(players);
      const sorted = [...players].sort((a, b) =>
        compareStarterPlayersByPreference(a, b, role),
      );
      expect(sorted.map((player) => player.name)).toEqual([
        "Yara",
        "Zane",
        "Theo",
        "Uma",
        "Vera",
        "Alex",
        "Bailey",
        "Ada",
      ]);
      expect(players).toEqual(before);
    },
  );

  it.each([
    "outfield option",
    "no bench",
    "one keeper",
    "no preferences",
    "reserve",
  ])("does not require a kickoff keeper reserve with %s", (scenario) => {
    const formation = FORMATIONS[0];
    const gk = formation.positions.find((p) => p.role === "goalkeeper")!;
    const field = formation.positions.find((p) => p.role === "forward")!;
    const assignments = {
      [gk.id]: "keeper",
      ...(scenario === "outfield option" || scenario === "no bench"
        ? { [field.id]: "reserve" }
        : {}),
    };
    const attending =
      scenario === "no bench"
        ? lineupPlayers.filter((p) => ["keeper", "reserve"].includes(p.id))
        : scenario === "one keeper"
          ? lineupPlayers.filter((p) => p.id !== "reserve")
          : scenario === "no preferences"
            ? lineupPlayers.map((p) => ({ ...p, preferredRoles: [] }))
            : lineupPlayers;
    const advice = getStarterLineupAdvice(formation, assignments, attending);
    expect(advice.concerns).toEqual([]);
    expect(Object.values(advice.issuesByPosition).flat()).toEqual([]);
    expect(advice).not.toHaveProperty("reserveHelp");
  });

  it.each(FORMATIONS[0].positions)(
    "uses concise preference wording at $label without repeating the position",
    (position) => {
      const player: Player = {
        id: "simon",
        name: "Simon",
        active: true,
        preferredRoles: [
          position.role === "goalkeeper" ? "forward" : "goalkeeper",
        ],
      };
      const advice = getStarterLineupAdvice(
        FORMATIONS[0],
        { [position.id]: player.id },
        [player],
      );
      expect(advice.issuesByPosition[position.id]).toEqual([
        position.role === "goalkeeper"
          ? "Simon prefers forward."
          : "Simon prefers goalkeeper.",
      ]);
    },
  );

  it.each<{ roles: PositionRole[]; message: string }>([
    { roles: ["forward"], message: "Eli prefers forward." },
    {
      roles: ["midfielder", "forward"],
      message: "Eli prefers midfield and forward.",
    },
    {
      roles: ["forward", "defender", "midfielder"],
      message: "Eli prefers forward, defense, and midfield.",
    },
  ])(
    "formats preferred positions as a sentence: $message",
    ({ roles, message }) => {
      const formation = FORMATIONS[0];
      const keeper = formation.positions.find((p) => p.role === "goalkeeper")!;
      const player: Player = {
        id: "eli",
        name: "Eli",
        active: true,
        preferredRoles: roles,
      };
      expect(
        getStarterLineupAdvice(formation, { [keeper.id]: player.id }, [player])
          .issuesByPosition[keeper.id],
      ).toEqual([message]);
    },
  );

  it("distinguishes preferences from missing data", () => {
    expect(starterPreferenceFit(lineupPlayers[1], "midfielder")).toBe(
      "2nd preference",
    );
    expect(starterPreferenceFit(lineupPlayers[1], "goalkeeper")).toBe(
      "Outside preferences",
    );
    expect(
      starterPreferenceFit(
        { ...lineupPlayers[1], preferredRoles: [] },
        "goalkeeper",
      ),
    ).toBe("No preferences listed");
  });

  it("scopes preference warnings to relevant positions without reserve warnings", () => {
    const formation = FORMATIONS[0];
    const gk = formation.positions.find((p) => p.role === "goalkeeper")!;
    const field = formation.positions.filter((p) => p.role !== "goalkeeper");
    const assignments = {
      [gk.id]: "defender",
      [field[0].id]: "keeper",
      [field[1].id]: "reserve",
      [field[2].id]: "forward",
    };
    const advice = getStarterLineupAdvice(
      formation,
      assignments,
      lineupPlayers,
    );
    expect(advice.issuesByPosition[gk.id]).toEqual([
      "Defender prefers defense and midfield.",
    ]);
    expect(advice.issuesByPosition[field[0].id]).toEqual([
      "Keeper prefers goalkeeper.",
    ]);
    expect(advice.concerns).not.toContain("No backup goalkeeper on the bench.");
    const withBackup = getStarterLineupAdvice(
      formation,
      {
        ...assignments,
        [field[1].id]: "",
      },
      lineupPlayers,
    );
    expect(withBackup.issuesByPosition[gk.id]).toEqual([
      "Defender prefers defense and midfield.",
    ]);
    const unknown = getStarterLineupAdvice(
      formation,
      assignments,
      lineupPlayers.map((player) => ({ ...player, preferredRoles: [] })),
    );
    expect(unknown.issuesByPosition[field[0].id]).toEqual([]);
    expect(unknown.issuesByPosition[gk.id]).toEqual([]);
  });

  it.each(FORMATIONS)(
    "previews atomic swaps and bench entries in $name ($sideSize)",
    (formation) => {
      const keeper = formation.positions.find((p) => p.role === "goalkeeper")!;
      const outfield = formation.positions.find(
        (p) => p.role !== "goalkeeper",
      )!;
      const assignments = { [keeper.id]: "keeper", [outfield.id]: "defender" };
      const before = structuredClone(assignments);
      const swap = previewStarterMove(
        formation,
        assignments,
        lineupPlayers,
        "defender",
        keeper.id,
      );
      expect(swap.assignments).toEqual({
        [keeper.id]: "defender",
        [outfield.id]: "keeper",
      });
      expect(swap.changes).toHaveLength(2);
      expect(
        swap.feedback.find((item) => item.playerId === "defender"),
      ).toMatchObject({
        name: "Defender",
        destination: "Goalkeeper",
        preference: "Not preferred",
        outsidePreferences: true,
      });
      expect(swap.changes.join(" ")).toContain("Outside preferences");
      expect(swap.advice.concerns).toContain(
        "Defender prefers defense and midfield.",
      );
      const bench = previewStarterMove(
        formation,
        assignments,
        lineupPlayers,
        "reserve",
        outfield.id,
      );
      expect(bench.assignments).toEqual({
        [keeper.id]: "keeper",
        [outfield.id]: "reserve",
      });
      expect(bench.changes).toContain("Defender → Starting bench");
      expect(
        bench.feedback.find((item) => item.playerId === "defender"),
      ).toMatchObject({
        destination: "Bench",
        preference: null,
      });
      expect(bench.advice.concerns).not.toContain(
        "No backup goalkeeper on the bench.",
      );
      const keeperSwap = previewStarterMove(
        formation,
        assignments,
        lineupPlayers,
        "reserve",
        keeper.id,
      );
      expect(
        keeperSwap.feedback.find((item) => item.playerId === "reserve"),
      ).toMatchObject({
        destination: "Goalkeeper",
        preference: "1st preference",
        outsidePreferences: false,
      });
      const open = formation.positions.find((p) => !assignments[p.id])!;
      const fill = previewStarterMove(
        formation,
        assignments,
        lineupPlayers,
        "reserve",
        open.id,
      );
      expect(Object.values(fill.assignments)).toHaveLength(3);
      const move = previewStarterMove(
        formation,
        assignments,
        lineupPlayers,
        "defender",
        open.id,
      );
      expect(Object.values(move.assignments)).toHaveLength(2);
      expect(new Set(Object.values(move.assignments)).size).toBe(2);
      expect(move.changes).toContain(`${outfield.label} will be open.`);
      expect(
        move.feedback.find((item) => item.playerId === null),
      ).toMatchObject({
        name: outfield.label,
        destination: "Left open",
        preference: null,
      });
      expect(
        previewStarterMove(
          formation,
          assignments,
          lineupPlayers,
          "keeper",
          keeper.id,
        ).changes,
      ).toEqual([]);
      expect(assignments).toEqual(before);
    },
  );

  it("only warns about a missing starting goalkeeper, not a missing reserve", () => {
    const formation = FORMATIONS[0];
    const keeper = formation.positions.find((p) => p.role === "goalkeeper")!;
    const advice = getStarterLineupAdvice(
      formation,
      { [keeper.id]: "keeper" },
      lineupPlayers.slice(0, 2),
    );
    expect(advice.concerns).toEqual([]);
    expect(
      getStarterLineupAdvice(formation, {}, lineupPlayers).concerns,
    ).toEqual(["Choose a starting goalkeeper."]);
    expect(() =>
      previewStarterMove(formation, {}, lineupPlayers, "absent", keeper.id),
    ).toThrow(/present player/);
    expect(() =>
      previewStarterMove(formation, {}, lineupPlayers, "keeper", "invalid"),
    ).toThrow(/valid starting position/);
  });
});
