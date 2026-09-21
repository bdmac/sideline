import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import {
  endCurrentPeriod,
  fastForwardGame,
  getGoalkeeperPreparationWarning,
  getQueuedKeeperHandoffConflict,
  queueBenchSubstitution,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { STORAGE_KEY } from "./storage";
import { keeperHandoffGame } from "./test/keeperHandoffFixtures";

describe("planned on-field keeper moves", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    localStorage.setItem(COACH_ID_STORAGE_KEY, "brian");
  });

  it.each(["in", "out"] as const)(
    "keeps the current pairing inside the scheduled group when editing Plan %s",
    (direction) => {
      const { state, game } = keeperHandoffGame();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "in"
              ? "Edit Ollie going in"
              : /^Plan substitution for Haru/,
        }),
      );
      const picker = screen.getByRole("dialog");
      const header = within(picker)
        .getByRole("heading", {
          name: direction === "in" ? "Already going out" : "Already going in",
        })
        .closest(".scheduled-choices-header")!;
      const current = within(picker).getByRole("button", {
        name: direction === "in" ? /^Haru/ : /^Ollie/,
      });
      expect(current).toHaveAttribute("aria-pressed", "true");
      expect(current).toHaveTextContent(
        direction === "in"
          ? "Scheduled out for Ollie"
          : "Scheduled in for Haru",
      );
      expect(
        header.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(
        within(picker).getByRole("button", { name: "Update plan" }),
      ).toBeDisabled();

      fireEvent.click(
        within(picker).getByRole("button", {
          name: direction === "in" ? /^Noah/ : /^Collier/,
        }),
      );
      expect(current).toHaveAttribute("aria-pressed", "false");
      expect(
        header.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame).toEqual(
        game,
      );
    },
  );

  it("rejects focused edits that would split a linked handoff without mutating the plan", () => {
    const { game, pairs } = keeperHandoffGame();
    const before = structuredClone(game);
    for (const [incoming, outgoing] of [
      ["u8-p10", "u8-p7"],
      ["u8-p10", "u8-p3"],
      [pairs[0].inPlayerId, "u8-p2"],
    ]) {
      expect(getQueuedKeeperHandoffConflict(game, incoming, outgoing)).toEqual(
        pairs[0],
      );
      expect(() => queueBenchSubstitution(game, incoming, outgoing)).toThrow(
        "Edit that change in the full substitution plan",
      );
      expect(game).toEqual(before);
    }
    const updated = queueBenchSubstitution(game, "u8-p10", "u8-p2");
    expect(updated.queuedSubstitutions).toHaveLength(4);
    expect(updated.queuedSubstitutions).toContainEqual(pairs[0]);
    expect(
      validateSubstitutionPairs(updated, updated.queuedSubstitutions!),
    ).toEqual([]);
  });

  it("explains a reserved keeper conflict beside the actions without a redundant full-plan notice", () => {
    const { state, game } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Plan Collier in" }));
    const picker = screen.getByRole("dialog");
    expect(picker).not.toHaveTextContent("Plan is full");
    expect(picker.querySelector(".plan-impact-note")).not.toBeInTheDocument();
    const henry = within(picker).getByRole("button", { name: /^Henry/ });
    expect(henry).toHaveTextContent("Moving to Keeper · stays on");
    fireEvent.click(henry);
    expect(picker).not.toHaveTextContent("Plan is full");
    expect(picker.querySelectorAll(".plan-impact-note")).toHaveLength(1);
    expect(
      picker.querySelector(".bench-picker-footer .plan-impact-note"),
    ).toHaveTextContent(
      "This conflicts with Henry's move to Keeper. Edit the keeper plan, or use Sub now to override this change.",
    );
    const warning = picker.querySelector(".plan-impact-note")!;
    expect(warning).toHaveAttribute("data-component", "InlineMessage");
    expect(warning).toHaveAttribute("data-variant", "warning");
    expect(warning).toHaveAttribute("role", "status");
    expect(
      within(picker).getByRole("button", { name: "Edit keeper plan" }),
    ).toHaveAttribute("aria-describedby", warning.id);
    expect(picker).toHaveTextContent("Would go in at Left Mid for Henry");
    expect(picker).not.toHaveTextContent("Scheduled in at Left Mid for Henry");
    expect(picker).toHaveTextContent(
      "This conflicts with Henry's move to Keeper.",
    );
    expect(
      within(picker).queryByRole("button", { name: "Add to plan" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole("button", { name: "Edit keeper plan" }),
    );
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(
      within(planner).queryByRole("button", { name: "Add swap" }),
    ).not.toBeInTheDocument();
    expect(planner).toHaveTextContent("Henry");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame).toEqual(
      game,
    );
  });

  it("allows explicit replacement of an ordinary planned swap without removing the handoff", () => {
    const { state, game, pairs } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Plan Collier in" }));
    const picker = screen.getByRole("dialog");
    fireEvent.click(within(picker).getByRole("button", { name: /^Noah/ }));
    fireEvent.click(
      within(picker).getByRole("button", { name: "Replace planned swap" }),
    );
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame;
    expect(saved.queuedSubstitutions).toHaveLength(4);
    expect(saved.queuedSubstitutions).toContainEqual(pairs[0]);
    expect(saved.queuedSubstitutions).toContainEqual({
      positionId: "dl",
      inPlayerId: "u8-p10",
      outPlayerId: "u8-p2",
    });
    expect(saved.assignments).toEqual(game.assignments);
    expect(saved.history).toEqual(game.history);
  });

  it("requires explicit confirmation before Sub now removes a conflicting keeper change", () => {
    const { state, game, pairs } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const request = () => {
      fireEvent.click(screen.getByRole("button", { name: "Plan Collier in" }));
      const picker = screen.getByRole("dialog");
      fireEvent.click(within(picker).getByRole("button", { name: /^Henry/ }));
      fireEvent.click(within(picker).getByRole("button", { name: "Sub now" }));
    };
    request();
    let confirmation = screen.getByRole("alertdialog", {
      name: "Override the keeper plan?",
    });
    expect(confirmation).toHaveTextContent("Collier will replace Henry now.");
    expect(confirmation).toHaveTextContent(
      "This removes the conflicting keeper change. Other valid planned swaps will stay unchanged.",
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame).toEqual(
      game,
    );
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Keep current plan" }),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame).toEqual(
      game,
    );
    request();
    confirmation = screen.getByRole("alertdialog", {
      name: "Override the keeper plan?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Sub now and remove conflict",
      }),
    );
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame;
    expect(saved.assignments.dr).toBe("u8-p10");
    expect(saved.benchIds).toContain("u8-p7");
    expect(saved.history).toHaveLength(game.history.length + 1);
    expect(saved.queuedSubstitutions).toEqual(pairs.slice(1));
    expect(validateGame(saved, 5)).toEqual([]);
    if (saved.queuedSubstitutions) {
      expect(
        validateSubstitutionPairs(saved, saved.queuedSubstitutions),
      ).toEqual([]);
    }
  });

  it("keeps a nonconflicting keeper handoff after Sub now without an override dialog", () => {
    const { state, game, pairs } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Plan Collier in" }));
    const picker = screen.getByRole("dialog");
    fireEvent.click(within(picker).getByRole("button", { name: /^Noah/ }));
    fireEvent.click(within(picker).getByRole("button", { name: "Sub now" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame;
    expect(saved.assignments.dl).toBe("u8-p10");
    expect(saved.queuedSubstitutions).toEqual(
      pairs.filter((pair) => pair.outPlayerId !== "u8-p2"),
    );
    expect(saved.queuedSubstitutions).toContainEqual(pairs[0]);
    expect(saved.history).toHaveLength(game.history.length + 1);
  });

  it("routes a field picker away from stealing the handoff's incoming player", () => {
    const { state, game } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Plan substitution for Noah/ }),
    );
    const picker = screen.getByRole("dialog");
    fireEvent.click(within(picker).getByRole("button", { name: /^Evan/ }));
    expect(picker).toHaveTextContent("Would come off for Evan");
    expect(picker).toHaveTextContent(
      "This conflicts with Henry's move to Keeper.",
    );
    fireEvent.click(
      within(picker).getByRole("button", { name: "Edit keeper plan" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Substitution plan" }),
    ).toHaveTextContent("Henry");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame).toEqual(
      game,
    );
  });

  it.each(["u8", "u12"] as const)(
    "shows the %s move on the pitch, roster, and plan without executing it",
    (teamId) => {
      const { state, game, team, pairs, moverId, fromPositionId } =
        keeperHandoffGame(teamId);
      const name = team.roster.find((player) => player.id === moverId)!.name;
      expect(validateGame(game, team.sideSize)).toEqual([]);
      expect(validateSubstitutionPairs(game, pairs)).toEqual([]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const { container } = render(<App />);
      expect(screen.getByLabelText("Ready substitutions")).toHaveTextContent(
        `${name} → Keeper`,
      );
      const bannerMove = container.querySelector(".queued-keeper-move")!;
      expect(bannerMove).not.toHaveTextContent("+");
      expect(bannerMove.querySelector("svg.lucide-move")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      const pitch = container.querySelector(".pitch")!;
      const marker = within(pitch as HTMLElement).getByRole("button", {
        name: `Review planned keeper move for ${name}`,
      });
      expect(marker).toHaveTextContent("→ Keeper");
      expect(marker).toHaveAttribute("data-position-id", fromPositionId);
      fireEvent.click(marker);
      const review = screen.getByRole("dialog", {
        name: "Substitution plan (4)",
      });
      expect(review).toHaveAccessibleDescription(
        `4 substitutions + 1 position move · ${name} stays on at keeper. Swipe a substitution to remove it.`,
      );
      expect(
        within(review).queryByRole("region", { name: "Planned keeper move" }),
      ).not.toBeInTheDocument();
      const steps = within(review).getByRole("list", {
        name: "Linked keeper change",
      });
      expect(within(steps).getAllByRole("listitem")[1]).toHaveTextContent(name);
      const routes = steps.querySelectorAll(".handoff-route");
      expect(
        routes[0].querySelector("svg.lucide-arrow-right-left"),
      ).toHaveAttribute("aria-hidden", "true");
      expect(routes[1].querySelector("svg.lucide-move")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(
        routes[2].querySelector("svg.lucide-arrow-right-left"),
      ).toHaveAttribute("aria-hidden", "true");
      expect(routes[1]).toHaveTextContent("Keeper");
      expect(review.querySelectorAll(".ready-swap")[3]).toContainElement(steps);
      expect(
        within(review).queryByText("MOVE", { exact: true }),
      ).not.toBeInTheDocument();
      expect(within(steps).getByLabelText(/to Keeper/)).toBeVisible();
      fireEvent.click(within(review).getByRole("button", { name: "Close" }));
      fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      const field = screen.getByRole("tabpanel");
      const row = within(field).getByRole("button", {
        name: `Review planned keeper move for ${name}`,
      });
      expect(row).toHaveTextContent("Moving to Keeper · stays on");
      expect(row).not.toHaveTextContent("Scheduled out");
      fireEvent.click(row);
      expect(
        screen.getByRole("dialog", { name: "Substitution plan (4)" }),
      ).toBeInTheDocument();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.activeGame.assignments).toEqual(game.assignments);
      expect(saved.activeGame.queuedSubstitutions).toEqual(pairs);
    },
  );

  it("hides Add at the handoff capacity and restores it when the handoff is removed", () => {
    const { state } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    const summary = within(planner).getByRole("region", {
      name: "Planned keeper move",
    });
    expect(summary).toHaveTextContent("Up to 4 players can come off.");
    for (const picker of within(planner).getAllByLabelText(/incoming player/)) {
      expect(picker).toBeEnabled();
    }
    expect(
      within(planner).queryByRole("button", { name: "Add swap" }),
    ).not.toBeInTheDocument();
    expect(
      planner.querySelector(".swap-row .keeper-handoff-steps"),
    ).toHaveTextContent("Henry");
    fireEvent.click(
      within(planner).getByRole("button", { name: /^Remove substitution 4:/ }),
    );
    expect(
      within(planner).queryByRole("region", { name: "Planned keeper move" }),
    ).not.toBeInTheDocument();
    expect(
      within(planner).getByRole("button", { name: "Add swap" }),
    ).toBeEnabled();
    fireEvent.click(within(planner).getByRole("button", { name: "Save plan" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan substitution for Henry" }),
    ).toBeInTheDocument();
  });

  it("shows each handoff participant's real route without a contradictory rest warning", () => {
    const { state, game, team } = keeperHandoffGame();
    expect(getGoalkeeperPreparationWarning(game, team)).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    expect(screen.queryByText(/needs more bench rest/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    );
    const review = screen.getByRole("dialog");
    expect(
      within(review).queryByText("Keeper needs more rest"),
    ).not.toBeInTheDocument();
    expect(
      within(review).queryByText(/recommended .*bench turn/),
    ).not.toBeInTheDocument();
    const steps = within(
      within(review).getByRole("list", { name: "Linked keeper change" }),
    ).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    for (const [index, name, route] of [
      [0, "Evan", "Bench to Left Mid"],
      [1, "Henry", "Left Mid to Keeper"],
      [2, "Maddox", "Keeper to Bench"],
    ] as const) {
      expect(steps[index]).toHaveTextContent(name);
      expect(within(steps[index]).getByLabelText(route)).toBeVisible();
    }
    expect(review.querySelector(".ready-direction")).not.toBeNull();
    expect(
      review.querySelector(".keeper-handoff-row .ready-direction"),
    ).toBeNull();
    fireEvent.click(within(review).getByRole("button", { name: "Edit plan" }));
    const planner = screen.getByRole("dialog");
    expect(planner).not.toHaveTextContent("Keeper needs more rest");
    expect(
      within(planner).getByRole("list", { name: "Linked keeper change" }),
    ).toHaveTextContent("Henry");
    expect(
      planner.querySelectorAll(".handoff-route svg.lucide-arrow-right-left"),
    ).toHaveLength(2);
    expect(
      planner.querySelectorAll(".handoff-route svg.lucide-move"),
    ).toHaveLength(1);
    fireEvent.click(
      within(planner).getByRole("button", { name: "Swap 4 incoming player" }),
    );
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("keeps early-turn and preference cautions for linked moves", () => {
    const { state, game } = keeperHandoffGame();
    game.clock.elapsedSeconds -= 600;
    state.teams.u8.roster.find(
      (player) => player.id === "u8-p7",
    )!.preferredRoles = ["forward"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    );
    const review = screen.getByRole("dialog");
    expect(review).toHaveTextContent("Wait on this rotation");
    expect(review).toHaveTextContent(
      "Henry does not typically play goalkeeper.",
    );
    expect(review).not.toHaveTextContent("bench turn before taking over");
    expect(
      within(review).getByRole("button", { name: "Send 'em in" }),
    ).toBeEnabled();
  });

  it("keeps the named keeper move in period-break summaries", () => {
    const { state, game } = keeperHandoffGame();
    state.activeGame = endCurrentPeriod(
      fastForwardGame(game, 25 * 60 - game.clock.elapsedSeconds, 3_000),
      3_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    expect(screen.getByLabelText("End of Half 1")).toHaveTextContent(
      "Henry → Keeper",
    );
    expect(
      screen.getByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    ).toBeInTheDocument();
  });

  it("retains the saved indicator on reload and clears it after sending or undoing the executed change", () => {
    const { state, game, moverId } = keeperHandoffGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const first = render(<App />);
    first.unmount();
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send 'em in" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame.assignments.gk,
    ).toBe(moverId);
    const confirmation = screen.queryByRole("dialog");
    if (confirmation)
      fireEvent.click(
        within(confirmation).getByRole("button", { name: "Close" }),
      );
    expect(
      screen.queryByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame.assignments,
    ).toEqual(game.assignments);
    expect(
      screen.queryByRole("button", {
        name: "Review planned keeper move for Henry",
      }),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame
        .queuedSubstitutions,
    ).toBeUndefined();
  });

  it("labels the bench destination and exiting keeper correctly and reviews the whole handoff from either player", () => {
    const { state, team, pairs } = keeperHandoffGame();
    const handoff = pairs[0];
    const incoming = team.roster.find(
      (player) => player.id === handoff.inPlayerId,
    )!.name;
    const outgoing = team.roster.find(
      (player) => player.id === handoff.outPlayerId,
    )!.name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const bench = screen.getByRole("tabpanel");
    const incomingRow = within(bench).getByRole("button", {
      name: `Review keeper handoff for ${incoming}`,
    });
    expect(incomingRow).toHaveTextContent(
      "Scheduled in at LM · Henry → Keeper",
    );
    expect(incomingRow).not.toHaveTextContent("Scheduled in at GK");
    fireEvent.click(incomingRow);
    let review = screen.getByRole("dialog", { name: "Substitution plan (4)" });
    fireEvent.click(within(review).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    const outgoingRow = within(screen.getByRole("tabpanel")).getByRole(
      "button",
      {
        name: `Review keeper handoff for ${outgoing}`,
      },
    );
    expect(outgoingRow).toHaveTextContent("Scheduled out · Henry takes goal");
    fireEvent.click(outgoingRow);
    review = screen.getByRole("dialog", { name: "Substitution plan (4)" });
    fireEvent.click(within(review).getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Review keeper handoff for ${outgoing}. Scheduled out for Henry`,
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Substitution plan (4)" }),
    ).toBeInTheDocument();
  });
});
