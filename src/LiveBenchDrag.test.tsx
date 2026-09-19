import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import App from "./App";
import { LiveBenchDropPitch } from "./LiveBenchDropPitch";
import { getCompactDropPositions } from "./benchDropModel";
import { COACH_ID_STORAGE_KEY } from "./coaches";
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

  it("asks before a bench drop replaces a saved keeper handoff", () => {
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
    const confirmation = screen.getByRole("alertdialog", {
      name: "Override the keeper plan?",
    });
    expect(confirmation).toHaveTextContent("Collier will replace Henry now.");
    expect(savedGame()).toEqual(game);
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Keep current plan" }),
    );
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
    "drops a bench player onto the live pitch and sends only that swap (plan: %s)",
    (planned) => {
      const { game, source, target, team } = setup(1024, planned);
      pointer(source, "pointerdown", 750, 500);
      pointer(source, "pointermove", 250, 240);
      expect(target).toHaveClass("drop-target");
      expect(source).toHaveClass("bench-source-dragging");
      expect(
        screen.getByLabelText("Immediate substitution preview"),
      ).toHaveTextContent("IN · Left BackAaron #21OUTLazar #15");
      expect(
        screen.queryByLabelText("Temporary substitution pitch"),
      ).not.toBeInTheDocument();
      expect(savedGame()).toEqual(game);
      pointer(source, "pointerup", 250, 240);
      const next = savedGame();
      expect(next.assignments.dl).toBe("u12-p12");
      expect(next.benchIds).toContain("u12-p2");
      expect(next.unavailableIds).toEqual(game.unavailableIds);
      expect(next.history.at(-1)?.pairs).toEqual([
        { positionId: "dl", inPlayerId: "u12-p12", outPlayerId: "u12-p2" },
      ]);
      expect(next.history.at(-1)?.substitutionKind).toBe("immediate");
      expect(validateGame(next, team.sideSize)).toEqual([]);
      if (planned) {
        expect(next.queuedSubstitutions!.length).toBeLessThanOrEqual(2);
        expect(
          next.queuedSubstitutions!.some(
            (pair) => pair.inPlayerId === "u12-p2",
          ),
        ).toBe(false);
      } else {
        expect(next.queuedSubstitutions).toBeUndefined();
      }
      expect(
        screen.getByRole("dialog", { name: "Players swapped" }),
      ).toBeInTheDocument();
      fireEvent.click(source, { detail: 1 });
      expect(
        screen.queryByRole("dialog", { name: /Plan (in|out)/ }),
      ).not.toBeInTheDocument();
    },
  );

  it("reveals the phone pitch after 125ms, keeps all six bench rows, and sends the drop without scrolling", () => {
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
    expect(savedGame().assignments.dl).toBe("u12-p12");
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
