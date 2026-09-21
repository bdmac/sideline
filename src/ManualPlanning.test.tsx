import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "./devicePreferences";
import {
  INITIAL_STATE,
  createGame,
  fastForwardGame,
  getRecommendedSubstitutionCount,
  queueSubstitutions,
  setClockRunning,
  suggestAdditionalSubstitution,
  suggestSubstitutions,
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
  fireEvent.click(screen.getByRole("button", { name: "Manual mode" }));
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
}

function openSavedPlanner() {
  fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Edit plan",
    }),
  );
  return screen.getByRole("dialog", { name: "Substitution plan" });
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
      expect(screen.queryByText(/Manual mode ·/)).not.toBeInTheDocument();
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const editor = screen.getByRole("dialog", { name: "Substitution plan" });
      expect(
        within(editor).queryByRole("button", { name: "Refresh suggestions" }),
      ).not.toBeInTheDocument();
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
      for (const picker of within(editor).getAllByLabelText(
        /incoming player/,
      )) {
        expect(picker).toBeEnabled();
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
    expect(screen.getByRole("button", { name: "Manual mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Manual mode" }),
    ).toHaveAccessibleDescription(
      /^\s*I need more control over who plays where\.$/,
    );
    expect(savedGame().queuedSubstitutions).toEqual(game.queuedSubstitutions);
  });

  it.each(["u8", "u12"] as const)(
    "adds one suggested %s row without changing existing pairings",
    (teamId) => {
      const { game, pairs, team } = setup(teamId, true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning: false }),
      );
      render(<App />);
      const editor = openSavedPlanner();
      expect(
        within(editor).queryByText("Players to swap"),
      ).not.toBeInTheDocument();
      const refresh = within(editor).getByRole("button", {
        name: "Refresh suggestions",
      });
      expect(editor.querySelector(".sheet-header-controls")).toContainElement(
        refresh,
      );
      expect(refresh.querySelector(".lucide-refresh-cw")).toBeInTheDocument();
      const previousRows = [...editor.querySelectorAll(".swap-row")].map(
        (row) => row.textContent,
      );
      const extra = suggestAdditionalSubstitution(game, pairs, team)!;
      const add = within(editor).getByRole("button", { name: "Add swap" });
      expect(editor.querySelector(".swap-list")?.lastElementChild).toHaveClass(
        "manual-swap-add-row",
      );
      expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
        `Swap another player. ${game.benchIds.length - pairs.length} left on bench.`,
      );
      fireEvent.click(add);
      expect(
        [...editor.querySelectorAll(".swap-row")]
          .slice(0, 2)
          .map((row) => row.textContent),
      ).toEqual(previousRows);
      expect(
        within(editor).getByLabelText("Swap 3 incoming player"),
      ).toHaveFocus();
      expect(
        within(editor).getByLabelText("Swap 3 incoming player"),
      ).toHaveTextContent(
        team.roster.find((p) => p.id === extra.inPlayerId)!.name,
      );
      expect(
        within(editor).getByLabelText("Swap 3 outgoing player"),
      ).toHaveTextContent(
        team.roster.find((p) => p.id === extra.outPlayerId)!.name,
      );
      expect(savedGame()).toEqual(game);
      fireEvent.click(
        within(editor).getByRole("button", { name: "Ready 3 swaps" }),
      );
      expect(savedGame().queuedSubstitutions).toEqual([...pairs, extra]);
      expect(savedGame().assignments).toEqual(game.assignments);
      expect(savedGame().history).toEqual(game.history);
    },
  );

  it("clears an automatic plan by removing its final row, with Cancel preserving it", () => {
    const { game } = setup("u8", true);
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: false }),
    );
    render(<App />);
    const emptyEditor = () => {
      const editor = openSavedPlanner();
      for (let i = 0; i < 2; i++) {
        fireEvent.click(
          within(editor).getAllByRole("button", {
            name: /^Remove substitution/,
          })[0],
        );
      }
      expect(
        within(editor).getByRole("button", { name: "Clear plan" }),
      ).toBeEnabled();
      expect(editor.querySelector(".manual-swap-add-row")).toHaveTextContent(
        `Swap a player. ${game.benchIds.length} left on bench.`,
      );
      expect(editor.querySelector(".error-message")).toBeNull();
      return editor;
    };
    fireEvent.click(
      within(emptyEditor()).getByRole("button", { name: "Cancel" }),
    );
    expect(savedGame()).toEqual(game);
    fireEvent.click(
      within(emptyEditor()).getByRole("button", { name: "Clear plan" }),
    );
    expect(savedGame().queuedSubstitutions).toBeUndefined();
    expect(savedGame().assignments).toEqual(game.assignments);
    expect(savedGame().history).toEqual(game.history);
  });

  it.each(["u8", "u12"] as const)(
    "fills automatic %s rows to capacity and exposes Add again after removal",
    (teamId) => {
      const { game, team } = setup(teamId, true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning: false }),
      );
      render(<App />);
      const editor = openSavedPlanner();
      for (let count = 2; count < game.benchIds.length; count++) {
        fireEvent.click(
          within(editor).getByRole("button", { name: "Add swap" }),
        );
        expect(editor.querySelectorAll(".swap-row")).toHaveLength(count + 1);
      }
      expect(
        within(editor).queryByRole("button", { name: "Add swap" }),
      ).not.toBeInTheDocument();
      for (const picker of within(editor).getAllByLabelText(
        /incoming player/,
      )) {
        expect(picker).toHaveClass("planner-player-value");
      }
      const lastAdded = editor
        .querySelector(
          `[data-player-selection-id="in-${game.benchIds.length - 1}"]`,
        )!
        .closest(".swap-row")!;
      expect(lastAdded.contains(document.activeElement)).toBe(true);
      fireEvent.click(
        within(editor)
          .getAllByRole("button", { name: /^Remove substitution/ })
          .at(-1)!,
      );
      expect(
        within(editor).getByRole("button", { name: "Add swap" }),
      ).toBeEnabled();
      for (const picker of within(editor).getAllByLabelText(
        /incoming player/,
      )) {
        expect(picker).toBeEnabled();
      }
      fireEvent.click(within(editor).getByRole("button", { name: "Add swap" }));
      fireEvent.click(
        within(editor).getByRole("button", {
          name: `Ready ${game.benchIds.length} swaps`,
        }),
      );
      expect(savedGame().queuedSubstitutions).toHaveLength(
        game.benchIds.length,
      );
      expect(validateGame(savedGame(), team.sideSize)).toEqual([]);
    },
  );

  it.each(["u8", "u12"] as const)(
    "refreshes %s recommendations only on request and saves only after review",
    (teamId) => {
      const { game, team } = setup(teamId, true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning: false }),
      );
      const first = render(<App />);
      const openEditor = () => {
        fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Edit plan",
          }),
        );
        return screen.getByRole("dialog", { name: "Substitution plan" });
      };
      let editor = openEditor();
      expect(
        within(editor).getByRole("button", { name: "Ready 2 swaps" }),
      ).toBeEnabled();
      const expected = suggestSubstitutions(
        game,
        getRecommendedSubstitutionCount(game, team),
        team,
      );
      expect(expected).not.toEqual(game.queuedSubstitutions);
      fireEvent.click(
        within(editor).getByRole("button", { name: "Refresh suggestions" }),
      );
      expect(
        within(editor).getByRole("button", {
          name: "Suggestions are up to date",
        }),
      ).toBeDisabled();
      expect(
        within(editor).getByRole("button", {
          name: `Ready ${expected.length} swaps`,
        }),
      ).toBeEnabled();
      expect(savedGame()).toEqual(game);
      fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
      expect(savedGame()).toEqual(game);

      editor = openEditor();
      expect(
        within(editor).getByRole("button", { name: "Ready 2 swaps" }),
      ).toBeEnabled();
      fireEvent.click(
        within(editor).getByRole("button", { name: "Refresh suggestions" }),
      );
      fireEvent.click(
        within(editor).getByRole("button", {
          name: `Ready ${expected.length} swaps`,
        }),
      );
      expect(savedGame()).toEqual({ ...game, queuedSubstitutions: expected });
      first.unmount();
      render(<App />);
      expect(savedGame().queuedSubstitutions).toEqual(expected);
      fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Send players in",
        }),
      );
      expect(savedGame().history.at(-1)?.pairs).toEqual(expected);
      expect(savedGame().queuedSubstitutions).toBeUndefined();
      expect(validateGame(savedGame(), team.sideSize)).toEqual([]);
    },
  );

  it.each(["u8", "u12"] as const)(
    "disables %s refresh when only row order differs and enables it after a draft edit",
    (teamId) => {
      const { state, game, team } = setup(teamId);
      const recommendations = suggestSubstitutions(
        game,
        getRecommendedSubstitutionCount(game, team),
        team,
      );
      const planned = queueSubstitutions(game, [...recommendations].reverse());
      state.activeGame = planned;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning: false }),
      );
      render(<App />);
      const editor = openSavedPlanner();
      const upToDate = within(editor).getByRole("button", {
        name: "Suggestions are up to date",
      });
      expect(upToDate).toBeDisabled();
      expect(upToDate).toHaveAttribute("title", "Suggestions are up to date.");
      fireEvent.click(upToDate);
      expect(savedGame()).toEqual(planned);
      fireEvent.click(
        within(editor).getAllByRole("button", {
          name: /^Remove substitution/,
        })[0],
      );
      const refresh = within(editor).getByRole("button", {
        name: "Refresh suggestions",
      });
      expect(refresh).toBeEnabled();
      fireEvent.click(refresh);
      expect(
        within(editor).getByRole("button", {
          name: "Suggestions are up to date",
        }),
      ).toBeDisabled();
      expect(editor.querySelectorAll(".swap-row")).toHaveLength(
        recommendations.length,
      );
      expect(savedGame()).toEqual(planned);
    },
  );

  it("starts a fresh automatic plan with refresh already disabled", () => {
    setup("u8");
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: false }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect(
      screen.getByRole("button", { name: "Suggestions are up to date" }),
    ).toBeDisabled();
  });

  it("does not clear a saved plan when no more automatic rotations are recommended", () => {
    const { state, game, team } = setup("u12", true);
    const late = fastForwardGame(
      game,
      team.defaultDurationMinutes * 60 - 60,
      1_000,
    );
    late.period = {
      current: 2,
      startedAtSeconds: team.defaultDurationMinutes * 30,
    };
    late.periodEnds = [
      { period: 1, atSeconds: team.defaultDurationMinutes * 30 },
    ];
    expect(getRecommendedSubstitutionCount(late, team)).toBe(0);
    state.activeGame = late;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ manualPlanning: false }),
    );
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Edit plan",
      }),
    );
    const editor = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(
      within(editor).getByRole("button", { name: "Refresh suggestions" }),
    ).toBeDisabled();
    expect(
      within(editor).getByRole("button", { name: "Ready 2 swaps" }),
    ).toBeEnabled();
    expect(savedGame()).toEqual(late);
  });

  it.each([
    ["u8", true],
    ["u8", false],
    ["u12", true],
    ["u12", false],
  ] as const)(
    "disables reserved %s IN choices until their row is removed (manual: %s)",
    (teamId, manualPlanning) => {
      const { game, pairs, team } = setup(teamId, true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning }),
      );
      render(<App />);
      const editor = openSavedPlanner();
      const incomingName = team.roster.find(
        (p) => p.id === pairs[1].inPlayerId,
      )!.name;
      fireEvent.click(within(editor).getByLabelText("Swap 1 incoming player"));
      const choices = screen.getAllByRole("menuitemradio");
      const reserved = choices.find(
        (option) =>
          option.getAttribute("data-player-id") === pairs[1].inPlayerId,
      )!;
      const current = choices.find(
        (option) =>
          option.getAttribute("data-player-id") === pairs[0].inPlayerId,
      )!;
      expect(reserved).toHaveAttribute("aria-disabled", "true");
      expect(current).toHaveAttribute("aria-disabled", "true");
      expect(current).toHaveAttribute("aria-checked", "true");
      fireEvent.click(reserved);
      fireEvent.keyDown(reserved, { key: "Enter" });
      expect(
        within(editor).getByLabelText("Swap 1 incoming player"),
      ).not.toHaveTextContent(incomingName);
      expect(savedGame()).toEqual(game);
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(
        within(editor).getByRole("button", { name: /^Remove substitution 2/ }),
      );
      fireEvent.click(within(editor).getByLabelText("Swap 1 incoming player"));
      const freed = screen
        .getAllByRole("menuitemradio")
        .find(
          (option) =>
            option.getAttribute("data-player-id") === pairs[1].inPlayerId,
        )!;
      expect(freed).not.toHaveAttribute("aria-disabled", "true");
      fireEvent.click(freed);
      fireEvent.click(
        within(editor).getByRole("button", { name: "Ready 1 swap" }),
      );
      expect(savedGame().queuedSubstitutions).toEqual([
        { ...pairs[0], inPlayerId: pairs[1].inPlayerId },
      ]);
      expect(savedGame().assignments).toEqual(game.assignments);
    },
  );

  it.each([true, false])(
    "allows a reserved IN player in Plan out only for Sub now (manual: %s)",
    (manualPlanning) => {
      const { game, pairs, team } = setup("u8", true);
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ manualPlanning }),
      );
      const name = (id: string) => team.roster.find((p) => p.id === id)!.name;
      const outgoingId = Object.values(game.assignments)[3];
      render(<App />);
      fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      fireEvent.click(
        screen.getByRole("button", { name: `Plan ${name(outgoingId)} out` }),
      );
      const picker = screen.getByRole("dialog");
      const reserved = within(picker).getByRole("button", {
        name: new RegExp(`^${name(pairs[1].inPlayerId)} #`),
      });
      fireEvent.click(reserved);
      const plan = within(picker).getByRole("button", { name: "Add to plan" });
      expect(plan).toBeDisabled();
      expect(plan).toHaveAccessibleDescription(
        /already planned in.*use Sub now/,
      );
      fireEvent.click(plan);
      expect(savedGame()).toEqual(game);
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(`^${name(game.benchIds[2])} #`),
        }),
      );
      expect(plan).toBeEnabled();
      fireEvent.click(reserved);
      fireEvent.click(within(picker).getByRole("button", { name: "Sub now" }));
      expect(Object.values(savedGame().assignments)).toContain(
        pairs[1].inPlayerId,
      );
      expect(savedGame().benchIds).toContain(outgoingId);
      expect(savedGame().queuedSubstitutions).toEqual([pairs[0]]);
      expect(savedGame().history.at(-1)?.substitutionKind).toBe("immediate");
    },
  );

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
        for (const option of within(group).getAllByRole("menuitemradio")) {
          expect(option.getAttribute("aria-disabled") === "true").toBe(
            direction === "incoming",
          );
        }
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
    fireEvent.click(within(dialog).getByRole("button", { name: /^Collier #/ }));
    expect(dialog).toHaveTextContent(
      "Collier does not typically play goalkeeper.",
    );
    expect(
      dialog.querySelector('[data-component="Dialog.Footer"]'),
    ).toHaveTextContent("Collier does not typically play goalkeeper.");
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
    const replacement = team.roster.find((p) => p.id === game.benchIds[4])!;
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: new RegExp(`^${replacement.name} #`),
      }),
    );
    expect(savedGame()).toEqual(game);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove player" }),
    );
    expect(savedGame().assignments[pairs[0].positionId]).toBe(game.benchIds[4]);
    expect(savedGame().queuedSubstitutions).toEqual([pairs[1]]);
    expect(
      screen.getByRole("dialog", { name: "Players are in" }),
    ).toBeInTheDocument();
  });

  it.each(["u8", "u12"] as const)(
    "uses the same %s bench choices as Plan out without changing the game until confirmed",
    (teamId) => {
      const { state, game, pairs, team } = setup(teamId, true);
      const timedGame = fastForwardGame(game, 200, 1_000);
      state.activeGame = timedGame;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const name = (id: string) => team.roster.find((p) => p.id === id)!.name;
      const outgoingName = name(pairs[1].outPlayerId);
      render(<App />);
      fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      fireEvent.click(
        screen.getByRole("button", {
          name: `Edit planned substitution for ${outgoingName} out`,
        }),
      );
      const planDialog = screen.getByRole("dialog");
      const planChoices = within(planDialog).getByRole("group", {
        name: "Bench replacements",
      });
      const expectedRows = within(planChoices)
        .getAllByRole("button")
        .map((button) => button.textContent);
      fireEvent.click(
        within(planDialog).getByRole("button", { name: "Close" }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: `Take ${outgoingName} out of game`,
        }),
      );
      const dialog = screen.getByRole("alertdialog");
      const choices = within(dialog).getByRole("group", {
        name: "Bench replacements",
      });
      expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
      const buttons = within(choices).getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual(expectedRows);
      expect(buttons).toHaveLength(game.benchIds.length);
      for (const button of buttons) {
        expect(button).toHaveAttribute("aria-pressed", "false");
        expect(button).toHaveTextContent("Bench");
        expect(button).toHaveTextContent("Played");
        expect(button).toHaveTextContent("Prefers");
      }
      expect(choices).toHaveTextContent("Already going in");
      expect(choices).toHaveTextContent(
        `Scheduled in for ${name(pairs[0].outPlayerId)}`,
      );
      const replacementButton = within(choices).getByRole("button", {
        name: new RegExp(`^${name(pairs[0].inPlayerId)} #`),
      });
      fireEvent.click(replacementButton);
      expect(replacementButton).toHaveAttribute("aria-pressed", "true");
      expect(
        within(dialog).getByRole("button", { name: "Remove player" }),
      ).toBeEnabled();
      expect(dialog).toHaveTextContent("This leaves");
      expect(savedGame()).toEqual(timedGame);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Keep player" }),
      );
      expect(savedGame()).toEqual(timedGame);
      fireEvent.click(
        screen.getByRole("button", {
          name: `Take ${outgoingName} out of game`,
        }),
      );
      expect(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Remove player",
        }),
      ).toBeDisabled();
    },
  );

  it.each(["u8", "u12"] as const)(
    "still removes a %s field player with no bench without asking for a replacement",
    (teamId) => {
      const { state, team } = setup(teamId);
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.slice(0, team.sideSize).map((p) => p.id),
        team.defaultDurationMinutes,
        1_000,
      );
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const outgoingId = Object.values(game.assignments)[1];
      const name = team.roster.find((p) => p.id === outgoingId)!.name;
      render(<App />);
      fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      fireEvent.click(
        screen.getByRole("button", { name: `Take ${name} out of game` }),
      );
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveTextContent("No bench replacement is available.");
      expect(
        within(dialog).queryByRole("group", { name: "Bench replacements" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Remove player" }),
      );
      expect(savedGame().unavailableIds).toContain(outgoingId);
      expect(Object.values(savedGame().assignments)).toHaveLength(
        team.sideSize - 1,
      );
      expect(validateGame(savedGame(), team.sideSize)).toEqual([]);
    },
  );

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
