import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import {
  endCurrentPeriod,
  fastForwardGame,
  getGoalkeeperPreparationWarning,
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

  it("explains the four-swap cap prominently and restores five when the handoff is removed", () => {
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
    expect(summary.previousElementSibling).toHaveClass("sub-count");
    expect(
      within(planner).getByRole("group", { name: "Players to swap" }),
    ).toHaveAccessibleDescription(/Henry stays on.*Up to 4/);
    expect(within(planner).getByRole("button", { name: "5" })).toBeDisabled();
    expect(
      planner.querySelector(".swap-row .keeper-handoff-steps"),
    ).toHaveTextContent("Henry");
    fireEvent.click(
      within(planner).getByRole("button", { name: /^Remove substitution 4:/ }),
    );
    expect(
      within(planner).queryByRole("region", { name: "Planned keeper move" }),
    ).not.toBeInTheDocument();
    expect(within(planner).getByRole("button", { name: "5" })).toBeEnabled();
    fireEvent.click(
      within(planner).getByRole("button", { name: "Ready 3 swaps" }),
    );
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
      within(review).getByRole("button", { name: "Send players in" }),
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
    fireEvent.click(screen.getByRole("button", { name: "Send players in" }));
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
