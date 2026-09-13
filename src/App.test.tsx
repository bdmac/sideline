import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  createGame,
  INITIAL_STATE,
  queueSubstitutions,
  suggestSubstitutions,
} from "./domain";
import { STORAGE_KEY } from "./storage";

const startGame = () => {
  fireEvent.click(screen.getByRole("button", { name: "Formation" }));
  fireEvent.click(screen.getByRole("button", { name: "Starters" }));
  fireEvent.click(screen.getByRole("button", { name: "Start game" }));
};

describe("Sideline app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
  });

  it("keeps teams visibly separate from the first screen", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Which team are you coaching?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Golden Dragons")).toBeInTheDocument();
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
  });

  it("keeps the roster fixed while allowing attendance selection", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    expect(
      screen.queryByRole("button", { name: /edit roster/i }),
    ).not.toBeInTheDocument();
    const simon = screen.getByRole("button", { name: /Simon Present/i });
    fireEvent.click(simon);
    expect(
      screen.getByRole("button", { name: /Simon Absent/i }),
    ).toBeInTheDocument();
  });

  it("moves through focused setup steps while preserving selections", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

    expect(
      screen.getByRole("heading", { name: "Who is here?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Step 1 of 3: Attendance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Choose the formation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Evan Present/i }));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    expect(
      screen.getByRole("heading", { name: "Choose the formation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Game format")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2-2 formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    expect(
      screen.getByRole("heading", { name: "Assign starters" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    expect(
      screen.getByRole("button", {
        name: "2-2 formation",
        pressed: true,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    expect(
      screen.getByRole("button", { name: /Evan Absent/i }),
    ).toBeInTheDocument();
  });

  it("warns when attendance drops below the required side size", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

    ["Simon", "Noah", "Maddox", "Ollie", "Malik"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: `${name} Present` }));
    });

    expect(
      container.querySelector(".attendance-count.short"),
    ).toHaveTextContent("4 present");
    expect(
      container.querySelector(".setup-progress-detail.danger"),
    ).toHaveTextContent("4 here");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Short 1 player: 4 present, 5 required",
    );

    fireEvent.click(screen.getByRole("button", { name: "Simon Absent" }));
    expect(container.querySelector(".attendance-count.short")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("assigns starters from the tactics board and swaps occupied positions", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));

    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change Maddox at Left Midfielder",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Choose Left Midfielder" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Ollie.*Currently Right Midfielder/,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Change Ollie at Left Midfielder",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Change Maddox at Right Midfielder",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const goalkeeperSlot = screen.getByRole("button", {
      name: "Assign player at Goalkeeper",
    });
    expect(goalkeeperSlot).toBeInTheDocument();
    expect(goalkeeperSlot).toHaveTextContent("GKOpen");
    expect(goalkeeperSlot).not.toHaveTextContent("Goalkeeper");
    expect(screen.getByRole("button", { name: "Start game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start game" })).toBeEnabled();
  });

  it("labels setup navigation by its team-selection destination", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

    const backButton = screen.getByRole("button", { name: "Team selection" });
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(
      screen.getByRole("heading", { name: "Which team are you coaching?" }),
    ).toBeInTheDocument();
  });

  it("lets an absent player become available after the game starts", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: /Evan Present/i }));
    startGame();

    const markAvailable = screen.getByRole("button", {
      name: "Mark Evan available",
    });
    expect(markAvailable).toBeInTheDocument();
    fireEvent.click(markAvailable);

    expect(
      screen.queryByRole("button", { name: "Mark Evan available" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Evan")).toBeInTheDocument();

    const gameLog = screen.getByText("Game log").closest("details");
    expect(gameLog).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Game log"));
    expect(gameLog).toHaveAttribute("open");
    expect(screen.getByText("Evan available")).toBeInTheDocument();
  });

  it("opens U12 setup directly without configurable duration or format", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));

    expect(
      screen.getByRole("heading", { name: "Prepare game" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Game duration")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    expect(screen.queryByText("Game format")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "3-1-3-1 formation",
        pressed: true,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    expect(
      screen.getByRole("button", { name: /Jackson Present/i }),
    ).toBeInTheDocument();
  });

  it("restores an active game immediately after a reload", () => {
    const firstRender = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Start clock" }));

    const savedGame = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ).activeGame;
    expect(savedGame).toBeTruthy();
    expect(savedGame.clock.running).toBe(true);

    window.dispatchEvent(new Event("pagehide"));
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}").activeGame,
    ).toBeTruthy();

    firstRender.unmount();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "On the field" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Clock running")).toBeInTheDocument();
  });

  it("shows each player's position time before closing an ended game", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    game.clock.elapsedSeconds = 120;
    Object.values(game.assignments).forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 120;
    });
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "End this game?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "End game" }),
    );

    const summary = screen.getByRole("main", { name: "Game summary" });
    expect(summary).toHaveTextContent("Simon");
    expect(summary).toHaveTextContent("Goalkeeper");
    expect(summary).toHaveTextContent("2:00 total");
    const gameLog = within(summary).getByText("Game log").closest("details");
    expect(gameLog).toBeInTheDocument();
    expect(gameLog).not.toHaveAttribute("open");
    expect(gameLog).toHaveTextContent("0 events");
    fireEvent.click(screen.getByRole("button", { name: "Return to teams" }));
    expect(
      screen.getByRole("heading", { name: "Which team are you coaching?" }),
    ).toBeInTheDocument();
  });

  it("shows current assignments in both position-change selectors", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Positions" }));

    expect(
      screen.getByRole("option", { name: "Simon (Goalkeeper)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "(Goalkeeper) Simon" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "(Center Back) Noah" }),
    ).toBeInTheDocument();
  });

  it("updates position targets when the selected player changes", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Positions" }));

    fireEvent.change(screen.getByLabelText("Player"), {
      target: { value: "u8-p3" },
    });

    expect(
      screen.queryByRole("option", { name: "(Left Midfielder) Maddox" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "(Goalkeeper) Simon" }),
    ).toBeInTheDocument();
  });

  it("opens position editing with the tapped pitch player selected", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox's position" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Change positions" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Player")).toHaveDisplayValue(
      "Maddox (Left Midfielder)",
    );
  });

  it("logs position changes made in the editor", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox's position" }),
    );
    fireEvent.change(screen.getByLabelText("Move to"), {
      target: { value: "m" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save positions" }));

    expect(screen.getByText("Position change")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Maddox: Left Midfielder → Right Midfielder · Ollie: Right Midfielder → Left Midfielder",
      ),
    ).toBeInTheDocument();
  });

  it("drags an on-field player onto another position", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const pitch = container.querySelector(".pitch")!;
    vi.spyOn(pitch, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 1_000,
      bottom: 1_000,
      width: 1_000,
      height: 1_000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const maddox = screen.getByRole("button", {
      name: "Change Maddox's position",
    });

    fireEvent(
      maddox,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 300,
        clientY: 420,
      }),
    );
    fireEvent(
      maddox,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 700,
        clientY: 420,
      }),
    );
    fireEvent(
      maddox,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 700,
        clientY: 420,
      }),
    );

    expect(
      screen.getByText(
        "Maddox: Left Midfielder → Right Midfielder · Ollie: Right Midfielder → Left Midfielder",
      ),
    ).toBeInTheDocument();
  });

  it("queues substitutions without changing the lineup, then executes them", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    expect(
      screen.getByRole("button", { name: "Queue 4 swaps" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queue 4 swaps" }));

    const summary = screen.getByRole("dialog", {
      name: "Substitutions queued",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#4 Dylan");
    expect(
      screen.getByRole("button", { name: "Change Simon's position" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Execute subs" }));
    expect(
      screen.getByRole("button", { name: "Change Dylan's position" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Substitutions queued" }),
    ).not.toBeInTheDocument();
  });

  it("allows the coach to reduce the default full-bench rotation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(
      screen.getByRole("button", { name: "Queue 1 swap" }),
    ).toBeInTheDocument();
  });

  it("re-optimizes untouched suggestions when the swap count decreases", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const [firstLongBench, secondLongBench, ...shortBench] = game.benchIds;
    game.totals[firstLongBench].benchSeconds = 30 * 60;
    game.totals[secondLongBench].benchSeconds = 30 * 60;
    shortBench.forEach((playerId) => {
      game.totals[playerId].benchSeconds = 60;
    });
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    fireEvent.click(within(planner).getByRole("button", { name: "2" }));

    expect(
      within(planner)
        .getAllByLabelText("IN")
        .map((select) => (select as HTMLSelectElement).value),
    ).toEqual(expect.arrayContaining([firstLongBench, secondLongBench]));
  });

  it("keeps a queued plan accessible from the live game until cancelled", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Queue 4 swaps" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Substitutions queued" }),
      ).getByRole("button", { name: "Close" }),
    );

    expect(screen.getByText("4 substitutions queued")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queued subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete plan" }));

    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete queued plan?",
    });
    expect(screen.getByText("4 substitutions queued")).toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Delete plan" }),
    );

    expect(
      screen.queryByText("4 substitutions queued"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
  });

  it("queues and edits one substitution directly from a bench player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "Queue Dylan" }));
    const firstPicker = screen.getByRole("dialog", { name: "Queue #4 Dylan" });
    expect(firstPicker).toHaveTextContent(
      "Preferred rolesDefense · Goalkeeper",
    );
    fireEvent.click(
      within(firstPicker).getByRole("button", {
        name: /#10 Simon.*Goalkeeper/,
      }),
    );

    expect(screen.getByText("1 substitution queued")).toBeInTheDocument();
    expect(screen.getByText("Queued for GK")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Substitutions queued" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queued subs" }));

    let queued = screen.getByRole("dialog", {
      name: "Substitutions queued",
    });
    expect(queued).toHaveTextContent("#10 Simon");
    expect(queued).toHaveTextContent("#4 Dylan");
    fireEvent.click(within(queued).getByRole("button", { name: "Edit plan" }));

    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    expect(within(planner).getByLabelText("OUT")).toHaveDisplayValue(
      /Simon · GK/,
    );
    expect(within(planner).getByLabelText("IN")).toHaveDisplayValue(/Dylan ·/);
    fireEvent.click(within(planner).getByRole("button", { name: "2" }));
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    expect(within(planner).getByLabelText("OUT")).toHaveDisplayValue(
      /Simon · GK/,
    );
    expect(within(planner).getByLabelText("IN")).toHaveDisplayValue(/Dylan ·/);
    fireEvent.click(within(planner).getByRole("button", { name: "Close" }));

    expect(screen.getByText("Queued for GK")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit queued substitution for Dylan",
      }),
    );
    const editPicker = screen.getByRole("dialog", { name: "Queue #4 Dylan" });
    fireEvent.click(
      within(editPicker).getByRole("button", {
        name: /#7 Noah.*Center Back/,
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Substitutions queued" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Queued for CB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queued subs" }));
    queued = screen.getByRole("dialog", { name: "Substitutions queued" });
    expect(queued).toHaveTextContent("#7 Noah");
    expect(queued).toHaveTextContent("#4 Dylan");
    expect(screen.getByText("1 substitution queued")).toBeInTheDocument();
    fireEvent.click(within(queued).getByRole("button", { name: "Close" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit queued substitution for Dylan",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove from queue" }));

    expect(screen.queryByText(/Queued for/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution queued")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Queue Dylan" }),
    ).toBeInTheDocument();
  });

  it("removes a queued bench player when they become unavailable", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "Queue Dylan" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Queue #4 Dylan" })).getByRole(
        "button",
        { name: /#10 Simon.*Goalkeeper/ },
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Dylan unavailable" }),
    );

    expect(screen.getByText("Dylan unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Queued for/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution queued")).not.toBeInTheDocument();
  });

  it("tracks our scorer, opponent goals, and the final score", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    const scorerDialog = screen.getByRole("dialog", { name: "Record a goal" });
    expect(
      within(scorerDialog).getByRole("button", { name: "#10 Simon" }),
    ).toBeInTheDocument();
    expect(
      within(scorerDialog).queryByRole("button", { name: "#4 Dylan" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(scorerDialog).getByRole("button", { name: "#10 Simon" }),
    );
    const expandedStatus = document.querySelector(".live-match-status");
    expect(
      within(expandedStatus as HTMLElement).getByLabelText("Score"),
    ).toHaveTextContent("Us1–Opponent0");

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    fireEvent.click(screen.getByRole("button", { name: "Opponent scored" }));
    expect(
      within(expandedStatus as HTMLElement).getByLabelText("Score"),
    ).toHaveTextContent("Us1–Opponent1");

    fireEvent.click(screen.getByText("Game log"));
    expect(screen.getByText("Simon scored")).toBeInTheDocument();
    expect(screen.getByText("Opponent scored")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo last change" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );
    expect(screen.getByLabelText("Final score")).toHaveTextContent(
      "Golden Dragons1 – 1Opponent",
    );
  });

  it("compacts the match status header after scrolling", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    const compactHeader = container.querySelector(".compact-match-header");

    expect(
      within(screen.getByLabelText("Match status")).getByText("40:00 left"),
    ).toBeInTheDocument();
    expect(compactHeader).toHaveAttribute("aria-hidden", "true");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 140,
    });
    fireEvent.scroll(window);

    await waitFor(() => expect(compactHeader).toHaveClass("interactive"));
    expect(
      within(compactHeader as HTMLElement).getByLabelText("Score"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByText("40:00 left"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByRole("button", {
        name: "End game",
      }),
    ).toBeInTheDocument();
  });

  it("shows a persisted period break with rotation and resume actions", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = {
      elapsedSeconds: 10 * 60,
      running: false,
      lastStartedAt: null,
    };
    game.periodBreak = { completedPeriod: 1, final: false };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const breakBanner = screen.getByLabelText("End of Quarter 1");
    expect(breakBanner).toHaveTextContent("Clock paused at 10:00");
    expect(
      within(breakBanner).getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(breakBanner).getByRole("button", { name: "Start Quarter 2" }),
    );

    expect(screen.queryByLabelText("End of Quarter 1")).not.toBeInTheDocument();
    expect(screen.getByText("Clock running")).toBeInTheDocument();
  });

  it("consolidates queued substitutions into the period-break banner", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    game.clock = {
      elapsedSeconds: 10 * 60,
      running: false,
      lastStartedAt: null,
    };
    game.periodBreak = { completedPeriod: 1, final: false };
    game = queueSubstitutions(game, suggestSubstitutions(game, 2, team));
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const breakBanner = screen.getByLabelText("End of Quarter 1");
    expect(breakBanner).toHaveTextContent("2 substitutions queued");
    expect(
      within(breakBanner).getByRole("button", { name: "Review & execute" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Queued substitutions"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(breakBanner).getByRole("button", { name: "Start Quarter 2" }),
    );
    expect(screen.getByLabelText("Queued substitutions")).toBeInTheDocument();
  });

  it("shows the effective substitution after an on-field player becomes unavailable", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Simon's position" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Simon unavailable" }),
    );

    const summary = screen.getByRole("dialog", {
      name: "Substitution ready",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#4 Dylan");
    expect(screen.getByText("Simon unavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Change positions" }),
    ).not.toBeInTheDocument();
  });

  it("shows the assigned position when an available player fills an open slot", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Dylan", "Henry", "Haru", "Evan"].forEach((name) => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`${name} Present`) }),
      );
    });
    startGame();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Simon's position" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Simon unavailable" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Simon available" }),
    );

    const summary = screen.getByRole("dialog", { name: "Player ready" });
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("POSITION");
    expect(summary).toHaveTextContent("Goalkeeper");
  });

  it("keeps substitution direction styling out of the live toolbar", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      container.querySelector(".mobile-control-dock .swap-direction"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    expect(
      container.querySelector(".swap-row .swap-direction"),
    ).toBeInTheDocument();
  });

  it("scrolls to the top when navigating between app screens", () => {
    render(<App />);
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByText("Golden Dragons"));
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    vi.mocked(window.scrollTo).mockClear();
    startGame();
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("shows manual installation guidance when no native prompt is available", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Install Sideline/i }));

    expect(
      screen.getByRole("dialog", { name: "Install Sideline" }),
    ).toHaveTextContent(
      "Open your browser menu and choose Install app or Add to Home screen.",
    );
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("uses the browser's native installation prompt when available", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt,
        userChoice: Promise.resolve({
          outcome: "accepted",
          platform: "web",
        }),
      },
    );

    render(<App />);
    fireEvent(window, installEvent);
    fireEvent.click(screen.getByRole("button", { name: /Install Sideline/i }));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Install Sideline/i }),
      ).not.toBeInTheDocument(),
    );
  });
});
