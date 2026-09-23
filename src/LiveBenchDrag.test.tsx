import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import App from "./App";
import { LiveBenchDropPitch } from "./LiveBenchDropPitch";
import {
  getCompactDropPositions,
  getPlannedPositionChange,
} from "./benchDropModel";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "./devicePreferences";
import {
  createGame,
  FORMATIONS,
  INITIAL_STATE,
  queueSubstitutions,
  suggestSubstitutions,
  validateGame,
} from "./domain";
import { TOUCH_DRAG_HOLD_MS } from "./playerDrag";
import { STORAGE_KEY } from "./storage";
import { keeperHandoffGame } from "./test/keeperHandoffFixtures";
import type { AppState, Player } from "./types";

function pointer(
  element: Element,
  type: string,
  x: number,
  y: number,
  pointerType = "mouse",
  pointerId = 7,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function bounds(element: Element, x = 250, y = 240) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: x - 45,
    y: y - 25,
    left: x - 45,
    right: x + 45,
    top: y - 25,
    bottom: y + 25,
    width: 90,
    height: 50,
    toJSON: () => ({}),
  });
}

function setup(width = 1024, planned = false) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 900,
    configurable: true,
    writable: true,
  });
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u12;
  team.roster.find((player) => player.id === "u12-p12")!.active = true;
  const base = createGame(
    team,
    "9-3-3-2",
    team.roster.map((p) => p.id),
    60,
    1_000,
  );
  const game = planned
    ? queueSubstitutions(base, suggestSubstitutions(base, 3, team))
    : base;
  state.activeGame = game;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const result = render(<App />);
  const source = document.querySelector<HTMLButtonElement>(
    '[data-live-bench-player-id="u12-p12"]',
  )!;
  const target = screen.getByRole("button", {
    name: /^Plan substitution for Lazar/,
  });
  bounds(target);
  return { ...result, game, source, target, team };
}

const savedGame = () =>
  (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState).activeGame!;

describe("live bench dragging", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(COACH_ID_STORAGE_KEY, "brian");
    vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    { width: 390, manualPlanning: false },
    { width: 390, manualPlanning: true },
    { width: 1024, manualPlanning: false },
    { width: 1024, manualPlanning: true },
  ])(
    "shows saved incoming players during dragging at $width (manual: $manualPlanning)",
    ({ width, manualPlanning }) => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning }),
      );
      const { game, team, source } = setup(width, true);
      pointer(source, "pointerdown", 750, 500);
      pointer(source, "pointermove", 250, 240);
      const pitch =
        width <= 760
          ? screen.getByLabelText("Temporary substitution pitch")
          : document.querySelector(".live-pitch-frame .pitch")!;
      for (const pair of game.queuedSubstitutions!) {
        expect(pair.keeperHandoff).toBeUndefined();
        const target = pitch.querySelector(
          `[data-position-id="${pair.positionId}"]`,
        )!;
        const name = team.roster.find(
          (player) => player.id === pair.inPlayerId,
        )!.name;
        const marker = within(target as HTMLElement).getByLabelText(
          `Planned in: ${name}`,
        );
        expect(marker).toHaveTextContent(name);
        expect(
          marker.querySelector(".lucide-arrow-right-left"),
        ).toBeInTheDocument();
      }
      const pair = game.queuedSubstitutions![0];
      const target = pitch.querySelector(
        `[data-position-id="${pair.positionId}"]`,
      )!;
      bounds(target);
      pointer(source, "pointermove", 250, 240);
      expect(target.querySelector(".planned-pitch-incoming")).toHaveTextContent(
        team.roster.find((player) => player.id === pair.inPlayerId)!.name,
      );
      expect(savedGame()).toEqual(game);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(
        document.querySelector(".planned-pitch-incoming"),
      ).not.toBeInTheDocument();
      expect(savedGame()).toEqual(game);
    },
  );

  it.each(["u8", "u12"] as const)(
    "shows the correct arrivals at both ends of a %s linked keeper move",
    (teamId) => {
      const { state, game, team, pairs, moverId, fromPositionId } =
        keeperHandoffGame(teamId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.innerWidth = 390;
      render(<App />);
      const benchId = game.benchIds.find(
        (id) => !pairs.some((pair) => pair.inPlayerId === id),
      )!;
      const source = document.querySelector(
        `[data-live-bench-player-id="${benchId}"]`,
      )!;
      pointer(source, "pointerdown", 90, 620);
      pointer(source, "pointermove", 110, 580);
      const pitch = screen.getByLabelText("Temporary substitution pitch");
      const keeper = pitch.querySelector(
        `[data-position-id="${pairs[0].positionId}"]`,
      )!;
      const outfield = pitch.querySelector(
        `[data-position-id="${fromPositionId}"]`,
      )!;
      const moverName = team.roster.find(
        (player) => player.id === moverId,
      )!.name;
      const benchName = team.roster.find(
        (player) => player.id === pairs[0].inPlayerId,
      )!.name;
      const keeperMarker = within(keeper as HTMLElement).getByLabelText(
        `Planned move: ${moverName}`,
      );
      expect(keeperMarker.querySelector(".lucide-move")).toBeInTheDocument();
      expect(keeperMarker).not.toHaveTextContent(benchName);
      const benchMarker = within(outfield as HTMLElement).getByLabelText(
        `Planned in: ${benchName}`,
      );
      expect(
        benchMarker.querySelector(".lucide-arrow-right-left"),
      ).toBeInTheDocument();
      expect(savedGame()).toEqual(game);
    },
  );

  it.each([
    { width: 390, manualPlanning: false },
    { width: 390, manualPlanning: true },
    { width: 1024, manualPlanning: false },
    { width: 1024, manualPlanning: true },
  ])(
    "builds a plan with successive bench drops at $width without sending anyone in (manual: $manualPlanning)",
    ({ width, manualPlanning }) => {
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning }),
      );
      const { game, source, target } = setup(width);
      const drop = (incoming: Element, outgoing: Element) => {
        bounds(outgoing);
        pointer(incoming, "pointerdown", 750, 500);
        pointer(incoming, "pointermove", 250, 240);
        if (width <= 760) {
          const compactTarget = document.querySelector(
            `[data-position-id="${outgoing.getAttribute("data-position-id")}"].bench-drop-target`,
          )!;
          bounds(compactTarget);
          pointer(incoming, "pointermove", 250, 240);
        }
        pointer(incoming, "pointerup", 250, 240);
      };
      drop(source, target);
      expect(savedGame().queuedSubstitutions).toEqual([
        { positionId: "dl", inPlayerId: "u12-p12", outPlayerId: "u12-p2" },
      ]);
      expect(savedGame().assignments).toEqual(game.assignments);
      expect(savedGame().totals).toEqual(game.totals);
      expect(savedGame().history).toEqual(game.history);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const secondSource = document.querySelector(
        '[data-live-bench-player-id="u12-p13"]',
      )!;
      const secondTarget = screen.getByRole("button", {
        name: /^Plan substitution for Nikola/,
      });
      vi.mocked(target.getBoundingClientRect).mockRestore();
      drop(secondSource, secondTarget);
      expect(savedGame().queuedSubstitutions).toHaveLength(2);
      expect(savedGame().assignments).toEqual(game.assignments);
      expect(savedGame().history).toEqual(game.history);
      fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Send 'em in",
        }),
      );
      expect(savedGame().queuedSubstitutions).toBeUndefined();
      expect(savedGame().assignments.dl).toBe("u12-p12");
      expect(savedGame().history.at(-1)?.pairs).toHaveLength(2);
    },
  );

  it("updates a manual pairing immediately on drop without changing the lineup", () => {
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: true }),
    );
    const { source } = setup();
    const drop = (incoming: Element) => {
      pointer(incoming, "pointerdown", 750, 500);
      pointer(incoming, "pointermove", 250, 240);
      pointer(incoming, "pointerup", 250, 240);
    };
    drop(source);
    const before = savedGame();
    const replacement = document.querySelector(
      '[data-live-bench-player-id="u12-p13"]',
    )!;
    drop(replacement);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(savedGame().queuedSubstitutions).toEqual([
      { positionId: "dl", inPlayerId: "u12-p13", outPlayerId: "u12-p2" },
    ]);
    expect(savedGame().assignments).toEqual(before.assignments);
    expect(savedGame().totals).toEqual(before.totals);
    expect(savedGame().history).toEqual(before.history);
  });

  it("replaces overlapping manual pairings on drop while preserving unrelated swaps", () => {
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: true }),
    );
    const { game } = setup(1024, true);
    const pairs = game.queuedSubstitutions!;
    const source = document.querySelector(
      `[data-live-bench-player-id="${pairs[0].inPlayerId}"]`,
    )!;
    const target = document.querySelector(
      `.pitch [data-position-id="${pairs[1].positionId}"]`,
    )!;
    bounds(target, 420, 320);
    pointer(source, "pointerdown", 750, 500);
    pointer(source, "pointermove", 420, 320);
    expect(
      screen.getByLabelText("Planned substitution preview"),
    ).toHaveTextContent("Replaces planned swaps.");
    pointer(source, "pointerup", 420, 320);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(savedGame().queuedSubstitutions).toEqual([
      pairs[2],
      { ...pairs[1], inPlayerId: pairs[0].inPlayerId },
    ]);
    expect(savedGame().assignments).toEqual(game.assignments);
    expect(savedGame().history).toEqual(game.history);
  });

  it("routes a manual drop involving a linked keeper to editing without changing the lineup or plan", () => {
    const { state, game } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: true }),
    );
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
      writable: true,
    });
    render(<App />);
    const source = document.querySelector(
      '[data-live-bench-player-id="u8-p10"]',
    )!;
    const target = screen.getByRole("button", {
      name: "Review planned keeper move for Henry",
    });
    bounds(target);
    pointer(source, "pointerdown", 750, 500);
    pointer(source, "pointermove", 250, 240);
    expect(
      screen.getByLabelText("Planned substitution preview"),
    ).toHaveTextContent("Keeper plan conflict");
    pointer(source, "pointerup", 250, 240);
    expect(
      screen.getByRole("dialog", { name: "Substitution plan" }),
    ).toHaveTextContent("Henry stays on");
    expect(savedGame()).toEqual(game);
  });

  it("opens the editor without altering a saved keeper handoff on an assisted-mode drop", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
      writable: true,
    });
    const { state, game } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const source = document.querySelector(
      '[data-live-bench-player-id="u8-p10"]',
    )!;
    const target = screen.getByRole("button", {
      name: "Review planned keeper move for Henry",
    });
    bounds(target);
    pointer(source, "pointerdown", 750, 500);
    pointer(source, "pointermove", 250, 240);
    pointer(source, "pointerup", 250, 240);
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(editor).toHaveTextContent("Henry stays on");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(savedGame()).toEqual(game);
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(savedGame()).toEqual(game);
  });

  it.each<{
    roles: Player["preferredRoles"];
    expected: string;
  }>([
    {
      roles: ["midfielder", "forward", "goalkeeper", "defender"],
      expected: "Midfield · Forward · Goalkeeper · Defense",
    },
    { roles: ["forward"], expected: "Forward" },
    { roles: [], expected: "Not set" },
  ])(
    "keeps incoming positions visible in preference order: $expected",
    ({ roles, expected }) => {
      const team = INITIAL_STATE.teams.u12;
      const formation = FORMATIONS.find((item) => item.id === "9-3-3-2")!;
      const game = createGame(
        team,
        formation.id,
        team.roster.map((p) => p.id),
        60,
      );
      const props = {
        compact: true,
        formation,
        assignments: game.assignments,
        players: team.roster,
        incoming: { ...team.roster[11], preferredRoles: roles },
        pitchRef: createRef<HTMLDivElement>(),
        fieldRef: createRef<HTMLDivElement>(),
      };
      const { rerender } = render(
        <LiveBenchDropPitch {...props} targetPositionId={null} />,
      );
      const board = screen.getByLabelText("Temporary substitution pitch");
      expect(board.firstElementChild).toHaveClass("bench-drop-summary");
      const previewSlot = board.querySelector(".bench-drop-preview");
      const positionsSlot = board.querySelector(".bench-drop-positions");
      const noticeSlot = board.querySelector(".bench-drop-notice");
      expect(
        board.querySelector(".planned-pitch-incoming"),
      ).not.toBeInTheDocument();
      expect(
        board.querySelector(".bench-drop-summary")?.firstElementChild,
      ).toBe(positionsSlot);
      expect(board.querySelector(".bench-drop-positions")).toHaveTextContent(
        `Positions: ${expected}`,
      );
      rerender(
        <LiveBenchDropPitch
          {...props}
          targetPositionId="gk"
          warning="Early keeper change."
        />,
      );
      expect(board.querySelector(".bench-drop-positions")).toHaveTextContent(
        `Positions: ${expected}`,
      );
      expect(
        within(board).getByText("Early keeper change."),
      ).toBeInTheDocument();
      expect(board).not.toHaveTextContent("Adds to plan");
      rerender(
        <LiveBenchDropPitch
          {...props}
          targetPositionId="gk"
          warning="Early keeper change."
          planImpact="Keeper plan conflict. Drop to edit."
        />,
      );
      expect(board.querySelector(".bench-drop-notice")).toHaveTextContent(
        "Early keeper change.",
      );
      expect(board.querySelector(".bench-drop-notice")).not.toHaveTextContent(
        "Keeper plan conflict",
      );
      for (const targetPositionId of ["dl", null]) {
        rerender(
          <LiveBenchDropPitch {...props} targetPositionId={targetPositionId} />,
        );
        expect(board.querySelector(".bench-drop-preview")).toBe(previewSlot);
        expect(board.querySelector(".bench-drop-positions")).toBe(
          positionsSlot,
        );
        expect(board.querySelector(".bench-drop-notice")).toBe(noticeSlot);
        expect(noticeSlot).toBeEmptyDOMElement();
      }
    },
  );

  it.each([false, true])(
    "drops a bench player onto the live pitch and saves only the selected plan edit (plan: %s)",
    (planned) => {
      const { game, source, target, team } = setup(1024, planned);
      pointer(source, "pointerdown", 750, 500);
      pointer(source, "pointermove", 250, 240);
      expect(target).toHaveClass("drop-target");
      expect(source).toHaveClass("bench-source-dragging");
      expect(
        screen.getByLabelText("Planned substitution preview"),
      ).toHaveTextContent("IN · Left BackAaron #21OUTLazar #15");
      expect(
        screen.queryByLabelText("Temporary substitution pitch"),
      ).not.toBeInTheDocument();
      expect(savedGame()).toEqual(game);
      pointer(source, "pointerup", 250, 240);
      const next = savedGame();
      expect(next.assignments).toEqual(game.assignments);
      expect(next.benchIds).toEqual(game.benchIds);
      expect(next.unavailableIds).toEqual(game.unavailableIds);
      expect(next.history).toEqual(game.history);
      expect(next.queuedSubstitutions).toEqual([
        ...(game.queuedSubstitutions ?? []).filter(
          (pair) =>
            pair.inPlayerId !== "u12-p12" && pair.outPlayerId !== "u12-p2",
        ),
        { positionId: "dl", inPlayerId: "u12-p12", outPlayerId: "u12-p2" },
      ]);
      expect(validateGame(next, team.sideSize)).toEqual([]);
      expect(
        screen.getByText("Swap added to plan. Lineup unchanged."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      fireEvent.click(source, { detail: 1 });
      expect(
        screen.queryByRole("dialog", { name: /Plan (in|out)/ }),
      ).not.toBeInTheDocument();
    },
  );

  it("reveals the phone pitch after 125ms, keeps all six bench rows, and plans the drop without scrolling", () => {
    vi.useFakeTimers();
    const { source, game } = setup(390);
    const panel = screen.getByRole("tabpanel");
    pointer(source, "pointerdown", 90, 620, "touch");
    act(() => vi.advanceTimersByTime(TOUCH_DRAG_HOLD_MS - 1));
    expect(
      screen.queryByLabelText("Temporary substitution pitch"),
    ).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    const board = screen.getByLabelText("Temporary substitution pitch");
    expect(board.querySelector(".bench-drop-positions")).toHaveTextContent(
      "Positions: Midfield · Defense · Forward",
    );
    expect(board.querySelectorAll("[data-position-id]")).toHaveLength(9);
    expect(panel.querySelectorAll("[data-live-bench-player-id]")).toHaveLength(
      6,
    );
    const target = board.querySelector('[data-position-id="dl"]')!;
    bounds(target, 80, 240);
    const touchMove = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    source.dispatchEvent(touchMove);
    expect(touchMove.defaultPrevented).toBe(true);
    pointer(source, "pointermove", 80, 240, "touch");
    expect(target).toHaveClass("selected");
    expect(target.querySelector(".player-identity-number")).toHaveTextContent(
      /^#15$/,
    );
    expect(target.querySelector("small")).toHaveTextContent(/^Left Back$/);
    expect(board.querySelector(".bench-drop-positions")).toHaveTextContent(
      "Positions: Midfield · Defense · Forward",
    );
    expect(within(board).getByRole("status")).toHaveTextContent(
      "IN · Left BackAaron #21OUTLazar #15",
    );
    expect(savedGame()).toEqual(game);
    act(() => vi.advanceTimersByTime(300));
    expect(window.scrollBy).not.toHaveBeenCalled();
    pointer(source, "pointerup", 80, 240, "touch");
    expect(
      screen.queryByLabelText("Temporary substitution pitch"),
    ).not.toBeInTheDocument();
    expect(savedGame().assignments).toEqual(game.assignments);
    expect(savedGame().queuedSubstitutions).toEqual([
      { positionId: "dl", inPlayerId: "u12-p12", outPlayerId: "u12-p2" },
    ]);
  });

  it("allows ordinary phone scrolling before the hold and does not switch tabs", () => {
    vi.useFakeTimers();
    const { source, game } = setup(390);
    pointer(source, "pointerdown", 90, 620, "touch");
    pointer(source, "pointermove", 90, 590, "touch");
    const touchMove = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    source.dispatchEvent(touchMove);
    expect(touchMove.defaultPrevented).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    pointer(source, "pointerup", 90, 590, "touch");
    fireEvent.click(source, { detail: 1 });
    expect(
      screen.queryByLabelText("Temporary substitution pitch"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Bench/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(savedGame()).toEqual(game);
  });

  it("never drops just because the temporary pitch appeared under a stationary finger", () => {
    vi.useFakeTimers();
    const { source, game } = setup(390);
    pointer(source, "pointerdown", 90, 620, "touch");
    act(() => vi.advanceTimersByTime(125));
    bounds(
      screen
        .getByLabelText("Temporary substitution pitch")
        .querySelector('[data-position-id="dl"]')!,
      90,
      620,
    );
    pointer(source, "pointerup", 90, 620, "touch");
    fireEvent.click(source, { detail: 1 });
    expect(savedGame()).toEqual(game);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Temporary substitution pitch"),
    ).not.toBeInTheDocument();
  });

  it("does not commit a newly appeared phone target without previewing it first", () => {
    const { source, game } = setup(390);
    pointer(source, "pointerdown", 90, 620);
    pointer(source, "pointermove", 250, 240);
    const target = screen
      .getByLabelText("Temporary substitution pitch")
      .querySelector('[data-position-id="dl"]')!;
    bounds(target, 250, 240);
    pointer(source, "pointerup", 250, 240);
    fireEvent.click(source, { detail: 1 });
    expect(savedGame()).toEqual(game);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    "outside",
    "pointercancel",
    "lostpointercapture",
    "Escape",
    "blur",
    "resize",
    "multitouch",
  ])(
    "cancels a phone drag on %s without changing the lineup or opening a picker",
    (reason) => {
      vi.useFakeTimers();
      const { source, game } = setup(390);
      pointer(source, "pointerdown", 90, 620, "touch");
      act(() => vi.advanceTimersByTime(125));
      bounds(
        screen
          .getByLabelText("Temporary substitution pitch")
          .querySelector('[data-position-id="dl"]')!,
      );
      pointer(source, "pointermove", 250, 240, "touch");
      if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else if (reason === "blur" || reason === "resize")
        fireEvent(window, new Event(reason));
      else if (reason === "multitouch")
        fireEvent.touchStart(source, {
          touches: [{ identifier: 1 }, { identifier: 2 }],
        });
      else if (reason === "outside")
        pointer(source, "pointerup", 5, 850, "touch");
      else pointer(source, reason, 250, 240, "touch");
      pointer(source, "pointerup", 250, 240, "touch");
      fireEvent.click(source, { detail: 1 });
      expect(savedGame()).toEqual(game);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Temporary substitution pitch"),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps a quick tap, keyboard activation, and the separate removal control independent of dragging", () => {
    vi.useFakeTimers();
    const { source } = setup(390);
    expect(source.querySelector(".bench-row-grip")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(source.querySelector(".player-number")).not.toBeInTheDocument();
    pointer(source, "pointerdown", 90, 620, "touch");
    pointer(source, "pointerup", 90, 620, "touch");
    fireEvent.click(source, { detail: 1 });
    let picker = screen.getByRole("dialog", { name: /Aaron #21 Plan in/ });
    fireEvent.click(within(picker).getByRole("button", { name: "Close" }));
    fireEvent.click(source, { detail: 0 });
    picker = screen.getByRole("dialog", { name: /Aaron #21 Plan in/ });
    fireEvent.click(within(picker).getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Take Aaron out of game" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Take Aaron out of game?" }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(
      screen.queryByLabelText("Temporary substitution pitch"),
    ).not.toBeInTheDocument();
  });

  it("keeps field rows name-first without a drag marker or a leading number box", () => {
    setup(390);
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    const player = screen.getByRole("button", { name: "Plan Lazar out" });
    expect(player.firstElementChild).toHaveClass("player-time-name");
    expect(player.querySelector(".player-identity")).toHaveTextContent(
      "Lazar #15",
    );
    expect(player.querySelector(".bench-row-grip, .player-number")).toBeNull();
  });

  it.each(["u8", "u12"] as const)(
    "keeps $teamId pitch cards draggable with no bench and never opens a picker after a swap",
    (teamId) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.slice(0, team.sideSize).map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const [[sourcePosition, sourceId], [targetPosition, targetId]] =
        Object.entries(game.assignments).slice(1, 3);
      const sourceName = team.roster.find(
        (player) => player.id === sourceId,
      )!.name;
      const targetName = team.roster.find(
        (player) => player.id === targetId,
      )!.name;
      const source = screen.getByRole("button", {
        name: `Plan substitution for ${sourceName}`,
      });
      const target = screen.getByRole("button", {
        name: `Plan substitution for ${targetName}`,
      });
      expect(source).toBeEnabled();
      fireEvent.click(source);
      const picker = screen.getByRole("dialog", { name: / Plan out$/ });
      expect(picker).toHaveTextContent(
        "No bench players available. Add or return a player to make a substitution.",
      );
      expect(
        within(picker).getByRole("button", { name: "Sub now" }),
      ).toBeDisabled();
      expect(
        within(picker).getByRole("button", { name: "Add to plan" }),
      ).toBeDisabled();
      fireEvent.click(within(picker).getByRole("button", { name: "Close" }));
      expect(savedGame()).toEqual(game);

      bounds(target);
      pointer(source, "pointerdown", 500, 500);
      pointer(source, "pointermove", 250, 240);
      expect(target).toHaveClass("drop-target");
      pointer(source, "pointerup", 250, 240);
      fireEvent.click(source, { detail: 1 });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const swapped = savedGame();
      expect(swapped.assignments).toEqual({
        ...game.assignments,
        [sourcePosition]: targetId,
        [targetPosition]: sourceId,
      });
      expect(swapped.benchIds).toEqual([]);
      expect(swapped.queuedSubstitutions).toBeUndefined();
      expect(validateGame(swapped, team.sideSize)).toEqual([]);
    },
  );
});

describe("planned drop-pitch changes", () => {
  it("does not show arrivals for empty or stale position assignments", () => {
    const { game, pairs, moverId, fromPositionId } = keeperHandoffGame();
    const goalkeeperPosition = pairs[0].positionId;
    expect(
      getPlannedPositionChange(goalkeeperPosition, game.assignments),
    ).toBeUndefined();
    const changed = {
      ...game.assignments,
      [fromPositionId]: "different-player",
    };
    expect(
      getPlannedPositionChange(goalkeeperPosition, changed, pairs),
    ).toBeUndefined();
    expect(
      getPlannedPositionChange(fromPositionId, changed, pairs),
    ).toBeUndefined();
    expect(
      getPlannedPositionChange(goalkeeperPosition, game.assignments, pairs),
    ).toEqual({
      playerId: moverId,
      kind: "move",
    });
    expect(
      getPlannedPositionChange(pairs[1].positionId, {}, pairs),
    ).toBeUndefined();
  });
});

describe("compact drop-pitch formation geometry", () => {
  it.each(FORMATIONS)(
    "keeps every $id target distinct and touch-sized on a small phone",
    (formation) => {
      const before = structuredClone(formation);
      const positions = getCompactDropPositions(formation);
      expect(new Set(positions.map((p) => p.id)).size).toBe(formation.sideSize);
      expect(positions.find((p) => p.role === "goalkeeper")?.y).toBe(86);
      for (const height of [246, 280, 352, 476]) {
        const width = 272;
        const tileWidth = Math.max(72, Math.min(104, width * 0.28));
        const tileHeight = Math.max(44, Math.min(56, height * 0.16));
        const rects = positions.map((p) => ({
          x: (width * p.x) / 100,
          y: (height * p.y) / 100,
        }));
        for (const [index, rect] of rects.entries()) {
          expect(rect.x - tileWidth / 2).toBeGreaterThanOrEqual(0);
          expect(rect.x + tileWidth / 2).toBeLessThanOrEqual(width);
          expect(rect.y - tileHeight / 2).toBeGreaterThanOrEqual(0);
          expect(rect.y + tileHeight / 2).toBeLessThanOrEqual(height);
          for (const other of rects.slice(index + 1)) {
            expect(
              Math.abs(rect.x - other.x) >= tileWidth ||
                Math.abs(rect.y - other.y) >= tileHeight,
            ).toBe(true);
          }
        }
      }
      expect(formation).toEqual(before);
    },
  );
});
