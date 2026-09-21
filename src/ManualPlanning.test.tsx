import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "./devicePreferences";
import {
  INITIAL_STATE,
  createGame,
  fastForwardGame,
  queueSubstitutions,
  setClockRunning,
  validateGame,
} from "./domain";
import { STORAGE_KEY } from "./storage";
import { keeperHandoffGame } from "./test/keeperHandoffFixtures";
import type { AppState, TeamId } from "./types";

const savedGame = () =>
  (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState).activeGame!;
function setup(teamId: TeamId = "u8", planned = false) {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams[teamId];
  let game = createGame(
    team,
    team.defaultFormationId,
    team.roster.map((p) => p.id),
    team.defaultDurationMinutes,
    1_000,
  );
  const pairs = Object.entries(game.assignments)
    .slice(0, 2)
    .map(([positionId, outPlayerId], index) => ({
      positionId,
      outPlayerId,
      inPlayerId: game.benchIds[index],
    }));
  if (planned) game = queueSubstitutions(game, pairs);
  state.activeGame = game;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(
    DEVICE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ manualPlanning: true }),
  );
  return { state, game, pairs, team };
}
function changeMode() {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Manual planning" }));
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
}

function chooseSwapPlayer(
  editor: HTMLElement,
  row: number,
  direction: "incoming" | "outgoing",
  playerId: string,
) {
  fireEvent.click(
    within(editor).getByLabelText(`Swap ${row} ${direction} player`),
  );
  fireEvent.click(
    screen
      .getAllByRole("menuitemradio")
      .find((option) => option.getAttribute("data-player-id") === playerId)!,
  );
}

describe("manual planning UI", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    localStorage.setItem(COACH_ID_STORAGE_KEY, "brian");
  });
  afterEach(() => vi.useRealTimers());

  it.each(["u8", "u12"] as const)(
    "starts with an empty %s editor, adds only explicit swaps, reviews and sends",
    (teamId) => {
      const { game, pairs, team } = setup(teamId);
      render(<App />);
      expect(screen.queryByText(/Manual planning ·/)).not.toBeInTheDocument();
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const editor = screen.getByRole("dialog", { name: "Substitution plan" });
      expect(editor).not.toHaveTextContent("No swaps yet.");
      expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
        `Swap a player. ${game.benchIds.length} left on bench.`,
      );
      expect(
        within(editor).queryByRole("group", { name: "Players to swap" }),
      ).not.toBeInTheDocument();
      expect(
        within(editor).getByRole("button", { name: "Add swap" }),
      ).toBeEnabled();
      expect(
        within(editor).getByRole("button", { name: "Add swap" }),
      ).not.toHaveClass("primary-action");
      expect(
        within(editor)
          .getByRole("button", { name: "Add swap" })
          .querySelector(".lucide-user-round-plus"),
      ).toBeInTheDocument();
      expect(within(editor).queryByRole("combobox")).not.toBeInTheDocument();
      for (const [index, pair] of pairs.entries()) {
        fireEvent.click(
          within(editor).getByRole("button", { name: "Add swap" }),
        );
        expect(
          within(editor).getByLabelText(`Swap ${index + 1} incoming player`),
        ).toHaveFocus();
        expect(
          within(editor).getByLabelText(`Swap ${index + 1} incoming player`),
        ).toHaveTextContent(/^Choose$/);
        expect(
          within(editor).getByLabelText(`Swap ${index + 1} outgoing player`),
        ).toHaveTextContent(/^Choose$/);
        expect(
          within(editor).getByRole("button", { name: "Choose players" }),
        ).toBeDisabled();
        expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
          `${game.benchIds.length - index - 1} left on bench.`,
        );
        expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
          "Swap another player.",
        );
        chooseSwapPlayer(editor, index + 1, "incoming", pair.inPlayerId);
        expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
          `${game.benchIds.length - index - 1} left on bench.`,
        );
        expect(
          within(editor).getByRole("button", { name: "Choose players" }),
        ).toBeDisabled();
        chooseSwapPlayer(editor, index + 1, "outgoing", pair.outPlayerId);
        expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
          "Swap another player.",
        );
      }
      expect(savedGame()).toEqual(game);
      fireEvent.click(
        within(editor).getByRole("button", { name: "Ready 2 swaps" }),
      );
      const review = screen.getByRole("dialog", {
        name: "Substitution plan (2)",
      });
      expect(savedGame().assignments).toEqual(game.assignments);
      expect(savedGame().queuedSubstitutions).toEqual(pairs);
      fireEvent.click(
        within(review).getByRole("button", { name: "Send players in" }),
      );
      expect(savedGame().history.at(-1)?.pairs).toEqual(pairs);
      expect(savedGame().queuedSubstitutions).toBeUndefined();
      expect(validateGame(savedGame(), team.sideSize)).toEqual([]);
    },
  );

  it.each(["u8", "u12"] as const)(
    "counts unfinished %s rows as reserved bench slots and restores slots on removal",
    (teamId) => {
      const { game } = setup(teamId);
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const editor = screen.getByRole("dialog", { name: "Substitution plan" });
      for (let rows = 1; rows <= game.benchIds.length; rows++) {
        fireEvent.click(
          within(editor).getByRole("button", { name: "Add swap" }),
        );
        if (rows < game.benchIds.length) {
          expect(
            editor.querySelector(".manual-swap-add-row"),
          ).toHaveTextContent(
            `Swap another player. ${game.benchIds.length - rows} left on bench.`,
          );
        } else {
          expect(
            editor.querySelector(".manual-swap-add-row"),
          ).not.toBeInTheDocument();
        }
      }
      for (let rows = game.benchIds.length; rows > 0; rows--) {
        fireEvent.click(
          within(editor).getByRole("button", {
            name: `Remove substitution ${rows}`,
          }),
        );
        expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
          `Swap ${rows > 1 ? "another" : "a"} player. ${game.benchIds.length - rows + 1} left on bench.`,
        );
      }
      expect(savedGame()).toEqual(game);
    },
  );

  it.each(["u8", "u12"] as const)(
    "hides Add swap when every %s bench player has a row and restores it after removal",
    (teamId) => {
      const { game } = setup(teamId);
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const editor = screen.getByRole("dialog", { name: "Substitution plan" });
      const outgoing = Object.values(game.assignments);
      for (const [index, incoming] of game.benchIds.entries()) {
        const add = within(editor).getByRole("button", { name: "Add swap" });
        const addRow = editor.querySelector(".manual-swap-add-row")!;
        expect(addRow.contains(add)).toBe(true);
        expect(editor.querySelector(".swap-list")?.lastElementChild).toBe(
          addRow,
        );
        expect(addRow).toHaveTextContent(
          `Swap ${index ? "another" : "a"} player. ${game.benchIds.length - index} left on bench.`,
        );
        fireEvent.click(add);
        chooseSwapPlayer(editor, index + 1, "outgoing", outgoing[index]);
        chooseSwapPlayer(editor, index + 1, "incoming", incoming);
      }
      expect(editor.querySelectorAll(".swap-row")).toHaveLength(
        game.benchIds.length,
      );
      expect(
        within(editor).queryByRole("button", { name: "Add swap" }),
      ).not.toBeInTheDocument();
      expect(
        within(editor).getByRole("button", {
          name: `Ready ${game.benchIds.length} swaps`,
        }),
      ).toBeEnabled();
      fireEvent.click(
        within(editor).getByRole("button", { name: /^Remove substitution 1/ }),
      );
      expect(
        within(editor).getByRole("button", { name: "Add swap" }),
      ).toBeEnabled();
      expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
        "Swap another player. 1 left on bench.",
      );
      expect(savedGame()).toEqual(game);
    },
  );

  it("keeps unfinished rows local and allows removing or cancelling them", () => {
    const { game } = setup("u8", true);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit plan",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(within(editor).getByRole("button", { name: "Add swap" }));
    chooseSwapPlayer(editor, 3, "outgoing", Object.values(game.assignments)[2]);
    expect(
      within(editor).getByRole("button", { name: "Choose players" }),
    ).toBeDisabled();
    expect(savedGame()).toEqual(game);
    fireEvent.click(
      within(editor).getByRole("button", { name: "Remove substitution 3" }),
    );
    expect(
      within(editor).getByRole("button", { name: "Ready 2 swaps" }),
    ).toBeEnabled();
    fireEvent.click(within(editor).getByRole("button", { name: "Add swap" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(savedGame()).toEqual(game);
  });

  it("persists the toggle across reload and preserves the saved plan in both directions", () => {
    const { game } = setup("u8", true);
    const first = render(<App />);
    changeMode();
    expect(
      JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY)!)
        .manualPlanning,
    ).toBe(false);
    expect(savedGame()).toEqual(game);
    changeMode();
    expect(savedGame()).toEqual(game);
    first.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("button", { name: "Manual planning" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(savedGame().queuedSubstitutions).toEqual(game.queuedSubstitutions);
  });

  it("exchanges already-chosen incoming players without refilling the plan", () => {
    const { game, pairs, team } = setup("u8", true);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit plan",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(within(editor).getByLabelText("Swap 1 incoming player"));
    const incomingName = team.roster.find(
      (p) => p.id === pairs[1].inPlayerId,
    )!.name;
    fireEvent.click(
      screen
        .getAllByRole("menuitemradio")
        .find((option) => option.textContent?.includes(incomingName))!,
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Ready 2 swaps" }),
    );
    expect(savedGame().queuedSubstitutions).toEqual([
      { ...pairs[0], inPlayerId: pairs[1].inPlayerId },
      { ...pairs[1], inPlayerId: pairs[0].inPlayerId },
    ]);
    expect(savedGame().assignments).toEqual(game.assignments);
  });

  it.each([true, false])(
    "groups all planned choices including the current row in both pickers (manual: %s)",
    (manualPlanning) => {
      const { game, pairs } = setup("u8", true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning }),
      );
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Edit plan",
        }),
      );
      const editor = screen.getByRole("dialog", { name: "Substitution plan" });
      for (const direction of ["incoming", "outgoing"] as const) {
        const heading =
          direction === "incoming" ? "Already going in" : "Already going out";
        fireEvent.click(
          within(editor).getByLabelText(`Swap 1 ${direction} player`),
        );
        const group = screen.getByRole("group", { name: heading });
        const plannedIds = within(group)
          .getAllByRole("menuitemradio")
          .map((option) => option.getAttribute("data-player-id"));
        expect(plannedIds).toEqual(
          expect.arrayContaining(
            pairs.map((pair) =>
              direction === "incoming" ? pair.inPlayerId : pair.outPlayerId,
            ),
          ),
        );
        expect(plannedIds).toHaveLength(2);
        const header = screen
          .getByText(heading)
          .closest(".scheduled-choices-header")!;
        expect(header).toHaveTextContent("Already included in the plan.");
        expect(
          header.compareDocumentPosition(group) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        const available = screen.getByRole("group", {
          name: "Available players",
        });
        expect(
          available.compareDocumentPosition(header) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          within(group)
            .getAllByRole("menuitemradio")
            .every((option) => option.getAttribute("aria-disabled") !== "true"),
        ).toBe(true);
        fireEvent.keyDown(document, { key: "Escape" });
      }
      expect(savedGame()).toEqual(game);
    },
  );

  it("omits the planned separator when a new row has no players selected", () => {
    setup();
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Create plan" })[0]);
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(within(editor).getByRole("button", { name: "Add swap" }));
    for (const direction of ["incoming", "outgoing"] as const) {
      fireEvent.click(
        within(editor).getByLabelText(`Swap 1 ${direction} player`),
      );
      expect(
        document.querySelector(".scheduled-choices-header"),
      ).not.toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
    }
  });

  it("keeps keeper preference warnings when choosing an injury replacement", () => {
    const { game, team } = setup();
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    const name = team.roster.find((p) => p.id === game.assignments.gk)!.name;
    fireEvent.click(
      screen.getByRole("button", { name: `Take ${name} out of game` }),
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Bench replacement"), {
      target: { value: "u8-p10" },
    });
    expect(dialog).toHaveTextContent(
      "Collier does not typically play goalkeeper.",
    );
    expect(savedGame()).toEqual(game);
  });

  it("keeps rotation reminders advisory without opening a suggested plan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { game } = setup();
    const running = setClockRunning(
      fastForwardGame(game, 374, 1_000),
      true,
      1_000,
    );
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    state.activeGame = running;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(
      screen.getByRole("status", { name: "Substitution reminder" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(savedGame().queuedSubstitutions).toBeUndefined();
  });

  it("uses Sub now without rebuilding the other planned swaps", () => {
    const { game, pairs, team } = setup("u8", true);
    render(<App />);
    const name = (id: string) => team.roster.find((p) => p.id === id)!.name;
    const incoming = game.benchIds[3];
    const outgoing = Object.values(game.assignments)[3];
    fireEvent.click(
      screen.getByRole("button", { name: `Plan ${name(incoming)} in` }),
    );
    const picker = screen.getByRole("dialog");
    fireEvent.click(
      within(picker).getByRole("button", {
        name: new RegExp(`^${name(outgoing)} #`),
      }),
    );
    fireEvent.click(within(picker).getByRole("button", { name: "Sub now" }));
    expect(savedGame().queuedSubstitutions).toEqual(pairs);
    expect(savedGame().history.at(-1)?.substitutionKind).toBe("immediate");
    expect(
      screen.getByRole("dialog", { name: "Players swapped" }),
    ).toHaveTextContent("Unaffected planned swaps were kept");
  });

  it("requires an explicit bench choice before taking a field player out", () => {
    const { game, pairs, team } = setup("u8", true);
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    const name = team.roster.find((p) => p.id === pairs[0].outPlayerId)!.name;
    fireEvent.click(
      screen.getByRole("button", { name: `Take ${name} out of game` }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByRole("button", { name: "Remove player" }),
    ).toBeDisabled();
    expect(savedGame()).toEqual(game);
    fireEvent.change(within(dialog).getByLabelText("Bench replacement"), {
      target: { value: game.benchIds[4] },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove player" }),
    );
    expect(savedGame().assignments[pairs[0].positionId]).toBe(game.benchIds[4]);
    expect(savedGame().queuedSubstitutions).toEqual([pairs[1]]);
    expect(
      screen.getByRole("dialog", { name: "Players are in" }),
    ).toBeInTheDocument();
  });

  it("can remove the last saved swap and clear the manual plan without auto-filling", () => {
    const { state, game, pairs } = setup("u8");
    state.activeGame = queueSubstitutions(game, [pairs[0]]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit plan",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(
      within(editor).getByRole("button", { name: /^Remove substitution 1/ }),
    );
    fireEvent.click(within(editor).getByRole("button", { name: "Clear plan" }));
    expect(savedGame().queuedSubstitutions).toBeUndefined();
    expect(savedGame().assignments).toEqual(game.assignments);
  });

  it("preserves and allows explicit removal of a linked keeper change from assisted mode", () => {
    const { state, pairs } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: true }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit plan",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(editor).toHaveTextContent("Henry stays on");
    expect(editor.querySelectorAll(".swap-row")).toHaveLength(4);
    expect(
      within(editor).queryByRole("button", { name: "Add swap" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(editor).getByRole("button", { name: /^Remove substitution 4/ }),
    );
    expect(
      within(editor).getByRole("button", { name: "Add swap" }),
    ).toBeEnabled();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Ready 3 swaps" }),
    );
    expect(savedGame().queuedSubstitutions).toEqual(pairs.slice(1));
  });
});
