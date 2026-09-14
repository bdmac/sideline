import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  applySubstitutions,
  createGame,
  INITIAL_STATE,
  queueSubstitutions,
  recordGoal,
  setClockRunning,
  suggestSubstitutions,
} from "./domain";
import { STORAGE_KEY } from "./storage";

const startGame = () => {
  fireEvent.click(screen.getByRole("button", { name: "Formation" }));
  fireEvent.click(screen.getByRole("button", { name: "Starters" }));
  fireEvent.click(screen.getByRole("button", { name: "Start game" }));
};

const openPositionEditor = (playerName: string) => {
  fireEvent.click(
    screen.getByRole("button", { name: `Open actions for ${playerName}` }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Change positions" }));
};

describe("Sideline app", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
      screen.getByRole("heading", { name: "Which team is playing?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose a team to start a game. Each team’s game state stays separate.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Golden Dragons")).toBeInTheDocument();
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
  });

  it("keeps the active-game timer live on team selection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T20:00:00Z"));
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = setClockRunning(
      createGame(
        team,
        "5-1-2-1",
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        Date.now(),
      ),
      true,
      Date.now(),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Go to team selection" }),
    );
    expect(
      screen.getByText(
        "Resume the game in progress. Each team’s game state stays separate.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Clock running · 0:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText("Clock running · 0:02")).toBeInTheDocument();
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
    const { container } = render(<App />);
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
    expect(container.querySelector(".setup-submit")).not.toHaveTextContent(
      "Step 2 of 3",
    );
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
    expect(
      screen.queryByRole("button", { name: "Add guest player" }),
    ).not.toBeInTheDocument();

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
      "Short 1 player: 4 present for this 5v5 game",
    );
    expect(
      screen
        .getByRole("button", { name: "Add guest player" })
        .closest('[role="alert"]'),
    ).toBe(screen.getByRole("alert"));

    fireEvent.click(screen.getByRole("button", { name: "Simon Absent" }));
    expect(container.querySelector(".attendance-count.short")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add guest player" }),
    ).not.toBeInTheDocument();
  });

  it("adds a guest player for one game without changing the team roster", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Simon", "Noah", "Maddox", "Ollie", "Malik"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: `${name} Present` }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guest player" }));
    const guestDialog = screen.getByRole("dialog", {
      name: "Add guest player",
    });
    fireEvent.change(within(guestDialog).getByLabelText("Player name"), {
      target: { value: "Borrowed Alex" },
    });
    fireEvent.change(within(guestDialog).getByLabelText(/Jersey number/), {
      target: { value: "31" },
    });
    fireEvent.click(
      within(guestDialog).getByRole("button", { name: "Add guest" }),
    );

    expect(
      screen.getByRole("button", {
        name: /Borrowed Alex Guest · Present/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByText("Borrowed Alex")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Return to teams" }));
    fireEvent.click(screen.getByText("Golden Dragons"));
    expect(screen.queryByText("Borrowed Alex")).not.toBeInTheDocument();
  });

  it("allows a confirmed short-sided start with every available player assigned", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Simon", "Noah", "Maddox", "Ollie", "Malik"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: `${name} Present` }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));

    fireEvent.click(screen.getByRole("button", { name: "Start short-sided" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "Start with 4 players?",
    });
    expect(confirmation).toHaveTextContent(
      "This 5v5 game will begin short-sided",
    );
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Start short-sided",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "On the field" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "On the field" }).parentElement
        ?.parentElement,
    ).toHaveTextContent("4/4");

    fireEvent.click(
      screen.getByRole("button", { name: "Add guest player at Striker" }),
    );
    const guestDialog = screen.getByRole("dialog", {
      name: "Add guest player",
    });
    fireEvent.change(within(guestDialog).getByLabelText("Player name"), {
      target: { value: "Late Guest" },
    });
    fireEvent.click(
      within(guestDialog).getByRole("button", { name: "Add guest" }),
    );

    expect(
      screen.getByRole("button", { name: "Open actions for Late Guest" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "On the field" }).parentElement
        ?.parentElement,
    ).toHaveTextContent("5/5");
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
      screen.getByRole("heading", { name: "Which team is playing?" }),
    ).toBeInTheDocument();
  });

  it("lets an absent player become available after the game starts", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: /Evan Present/i }));
    startGame();

    const outOfGame = screen.getByText("Out of game").closest("details");
    expect(outOfGame).not.toHaveAttribute("open");

    fireEvent.click(screen.getByText("Out of game"));
    expect(outOfGame).toHaveAttribute("open");
    const addToGame = screen.getByRole("button", {
      name: "Add Evan to game",
    });
    expect(addToGame).toBeInTheDocument();
    fireEvent.click(addToGame);

    expect(
      screen.queryByRole("button", { name: "Add Evan to game" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Evan")).toBeInTheDocument();

    const gameLog = screen.getByText("Game log").closest("details");
    expect(gameLog).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Game log"));
    expect(gameLog).toHaveAttribute("open");
    expect(screen.getByText("Evan added to game")).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "Which team is playing?" }),
    ).toBeInTheDocument();
  });

  it("shows the tapped player and current position without a player selector", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Simon");

    expect(screen.queryByLabelText("Player")).not.toBeInTheDocument();
    expect(screen.getByText("Current position")).toBeInTheDocument();
    expect(screen.getByText("Goalkeeper")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Noah (Center Back)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Queue substitution" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Take Simon out of game" }),
    ).not.toBeInTheDocument();
  });

  it("opens all three on-field actions from a pitch player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(
      screen.getByRole("button", { name: "Open actions for Simon" }),
    );
    const actions = screen.getByRole("dialog", { name: "Simon" });
    expect(
      within(actions).getByRole("button", { name: "Queue substitution" }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: "Change positions" }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", {
        name: "Take Simon out of game",
      }),
    ).toBeInTheDocument();

    fireEvent.click(actions.parentElement!);
    expect(
      screen.queryByRole("dialog", { name: "Simon" }),
    ).not.toBeInTheDocument();
  });

  it("treats a confirmation backdrop click as cancel", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    const confirmation = screen.getByRole("alertdialog", {
      name: "End this game?",
    });
    fireEvent.click(confirmation.parentElement!);

    expect(
      screen.queryByRole("alertdialog", { name: "End this game?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End game" }),
    ).toBeInTheDocument();
  });

  it("does not offer the tapped player as a swap target", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");

    expect(
      screen.queryByRole("button", { name: "Maddox (Left Midfielder)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simon (Goalkeeper)" }),
    ).toBeInTheDocument();
  });

  it("opens position editing with the tapped pitch player selected", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");

    const positionDialog = screen.getByRole("dialog", {
      name: "Change positions",
    });
    expect(positionDialog).toBeInTheDocument();
    expect(screen.queryByLabelText("Player")).not.toBeInTheDocument();
    expect(within(positionDialog).getByText("Maddox")).toBeInTheDocument();
    expect(
      within(positionDialog).getByText("Left Midfielder"),
    ).toBeInTheDocument();
  });

  it("logs position changes made in the editor", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");
    fireEvent.click(
      screen.getByRole("button", { name: "Ollie (Right Midfielder)" }),
    );
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
      name: "Open actions for Maddox",
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
      screen.getByRole("button", { name: "Queue 3 swaps" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Queue 3 swaps" }));

    const summary = screen.getByRole("dialog", {
      name: "Substitutions queued",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("IN");
    expect(summary).not.toHaveTextContent("#4 Dylan");
    expect(
      screen.getByRole("button", { name: "Open actions for Simon" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Execute subs" }));
    expect(
      screen.getByRole("button", { name: "Open actions for Henry" }),
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
    const [, firstLeastPlayed, secondLeastPlayed, ...others] = game.benchIds;
    game.totals[firstLeastPlayed].fieldSeconds = 30;
    game.totals[secondLeastPlayed].fieldSeconds = 30;
    others.forEach((playerId) => {
      game.totals[playerId].fieldSeconds = 300;
    });
    game.totals[game.benchIds[0]].fieldSeconds = 300;
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
    ).toEqual(expect.arrayContaining([firstLeastPlayed, secondLeastPlayed]));
  });

  it("keeps a queued plan accessible from the live game until cancelled", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Queue 3 swaps" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Substitutions queued" }),
      ).getByRole("button", { name: "Close" }),
    );

    expect(screen.getByText("3 substitutions queued")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete plan" }));

    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete queued plan?",
    });
    expect(screen.getByText("3 substitutions queued")).toBeInTheDocument();
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
    expect(firstPicker).toHaveTextContent("0:00 played");
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
    fireEvent.click(screen.getByRole("button", { name: "Review subs" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Review subs" }));
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
      screen.getByRole("button", { name: "Take Dylan out of game" }),
    );

    expect(screen.getByText("Dylan out of game")).toBeInTheDocument();
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
      within(scorerDialog).queryByRole("button", { name: "#10 Simon" }),
    ).not.toBeInTheDocument();
    expect(
      within(scorerDialog).getByRole("button", { name: "#7 Noah" }),
    ).toBeInTheDocument();
    expect(
      within(scorerDialog).queryByRole("button", { name: "#4 Dylan" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(scorerDialog).getByRole("button", { name: "#7 Noah" }),
    );
    const expandedStatus = document.querySelector(".live-match-status");
    expect(
      within(expandedStatus as HTMLElement).getByLabelText("Score"),
    ).toHaveTextContent("Us1–Opponent0");

    fireEvent.click(
      within(expandedStatus as HTMLElement).getByRole("button", {
        name: "Our score: 1. View scorers",
      }),
    );
    const goalSummary = screen.getByRole("dialog", { name: "Our goals" });
    expect(goalSummary).toHaveTextContent("Noah");
    expect(
      within(goalSummary).getByLabelText("Noah scored 1 goal"),
    ).toBeInTheDocument();
    fireEvent.click(within(goalSummary).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    fireEvent.click(screen.getByRole("button", { name: "Opponent scored" }));
    expect(
      within(expandedStatus as HTMLElement).getByLabelText("Score"),
    ).toHaveTextContent("Us1–Opponent1");

    fireEvent.click(screen.getByText("Game log"));
    expect(screen.getByText("Noah scored")).toBeInTheDocument();
    expect(
      screen.getByText(/^Goal for Golden Dragons · /),
    ).not.toHaveTextContent("Goalkeeper");
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
    expect(
      screen.getByLabelText("Noah scored 1 goal").querySelectorAll("svg"),
    ).toHaveLength(1);
    expect(screen.queryByLabelText(/1 goal scored as/)).not.toBeInTheDocument();
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

  it("keeps clock and undo controls reachable during live play", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      container.querySelector(".mobile-control-dock .clock-button"),
    ).toHaveAccessibleName("Start clock");
    expect(
      container.querySelector(".mobile-control-dock .undo-button"),
    ).toHaveAccessibleName("Undo last change");
    expect(
      screen.queryByRole("button", { name: "Positions" }),
    ).not.toBeInTheDocument();
  });

  it("prioritizes the below-pace warning over total bench time", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const benchPlayerId = game.benchIds[0];
    game.clock.elapsedSeconds = 10 * 60;
    game.totals[benchPlayerId] = {
      fieldSeconds: 2 * 60,
      benchSeconds: 12 * 60,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const benchPlayer = screen
      .getByRole("button", { name: `Queue ${team.roster[5].name}` })
      .closest(".player-time-row");
    expect(benchPlayer).toHaveTextContent("2:00 played");
    expect(benchPlayer).toHaveTextContent("Sitting10:00");
    expect(benchPlayer).toHaveTextContent("Below 50% pace");
    expect(benchPlayer).not.toHaveTextContent("total bench");
  });

  it("shows total bench time when no higher-priority status applies", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const benchPlayerId = game.benchIds[0];
    game.clock.elapsedSeconds = 10 * 60;
    game.totals[benchPlayerId] = {
      fieldSeconds: 6 * 60,
      benchSeconds: 12 * 60,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const benchPlayer = screen
      .getByRole("button", { name: `Queue ${team.roster[5].name}` })
      .closest(".player-time-row");
    expect(benchPlayer).toHaveTextContent("6:00 played");
    expect(benchPlayer).toHaveTextContent("12:00 total bench");
    expect(benchPlayer).toHaveTextContent("Sitting10:00");
    expect(benchPlayer).not.toHaveTextContent("Below 50% pace");
  });

  it("does not show minimum-play warnings before one quarter of the game", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    game.clock.elapsedSeconds = 10 * 60 - 1;
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    expect(screen.queryByText("Below 50% pace")).not.toBeInTheDocument();
  });

  it("collapses redundant bench totals before a player has entered", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const dylanRow = screen
      .getByRole("button", { name: "Queue Dylan" })
      .closest(".player-time-row");
    expect(dylanRow).toHaveTextContent("Waiting to enter");
    expect(dylanRow).toHaveTextContent("Sitting0:00");
    expect(dylanRow).not.toHaveTextContent("total bench");
  });

  it("shows game-summary goal markers beside player names off the pitch", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const [positionId, scorerId] = Object.entries(game.assignments)[1];
    const incomingId = game.benchIds[0];
    game = recordGoal(game, "us", scorerId, 1_000);
    game = applySubstitutions(
      game,
      [{ outPlayerId: scorerId, inPlayerId: incomingId, positionId }],
      team.sideSize,
      1_000,
    );
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const scorerName = team.roster.find(
      (player) => player.id === scorerId,
    )!.name;
    const scorerRow = screen
      .getByRole("button", { name: `Queue ${scorerName}` })
      .closest(".player-time-row");
    expect(
      within(scorerRow as HTMLElement)
        .getByLabelText(`${scorerName} scored 1 goal`)
        .querySelectorAll(".soccer-ball-icon"),
    ).toHaveLength(1);
    expect(
      document.querySelector(".pitch .soccer-ball-icon"),
    ).not.toBeInTheDocument();
  });

  it("switches between bench and on-field lists with tabs and swipe", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const benchTab = screen.getByRole("tab", { name: /Bench/ });
    const fieldTab = screen.getByRole("tab", { name: /On field/ });
    expect(benchTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(benchTab, { key: "ArrowRight" });
    expect(fieldTab).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(fieldTab, { key: "ArrowRight" });
    expect(benchTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(fieldTab);
    expect(fieldTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", { name: "Queue Simon out" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Queue Simon out" })
        .closest(".player-time-row"),
    ).toHaveTextContent("Playing0:00");

    const panel = screen.getByRole("tabpanel");
    fireEvent.touchStart(panel, {
      touches: [{ clientX: 160, clientY: 100 }],
    });
    fireEvent.touchEnd(panel, {
      changedTouches: [{ clientX: 60, clientY: 102 }],
    });
    expect(fieldTab).toHaveAttribute("aria-selected", "true");

    fireEvent.touchStart(panel, {
      touches: [{ clientX: 60, clientY: 100 }],
    });
    fireEvent.touchEnd(panel, {
      changedTouches: [{ clientX: 160, clientY: 98 }],
    });
    expect(benchTab).toHaveAttribute("aria-selected", "true");
  });

  it("queues an on-field player out by choosing an incoming bench player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    fireEvent.click(screen.getByRole("button", { name: "Queue Simon out" }));
    const picker = screen.getByRole("dialog", { name: /Queue #10 Simon out/ });
    fireEvent.click(within(picker).getByRole("button", { name: /Dylan/ }));

    const simonRow = screen
      .getByRole("button", {
        name: "Edit queued substitution for Simon out",
      })
      .closest(".player-time-row");
    expect(simonRow).toHaveTextContent("Queued out for Dylan");
  });

  it("opens position and availability actions from an on-field row", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Simon" }),
    );
    const actions = screen.getByRole("dialog", { name: "Simon" });
    expect(
      within(actions).getByRole("button", {
        name: "Take Simon out of game",
      }),
    ).toBeInTheDocument();
    expect(
      within(actions).queryByRole("button", { name: "Queue substitution" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(actions).getByRole("button", { name: "Change positions" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Change positions" }),
    ).toBeInTheDocument();
  });

  it("calls out drag-and-drop position changes in both live entry points", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      screen.getByText(
        "Tap a player for actions, or drag them onto another position.",
      ),
    ).toBeInTheDocument();
    openPositionEditor("Simon");
    expect(
      screen.getByText(/drag players directly on the field/i),
    ).toBeInTheDocument();
  });

  it("scrolls the final summary to the top and ranks scorers before playing time", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const scorerId = game.assignments.dl;
    game.totals[game.assignments.gk].fieldSeconds = 20 * 60;
    game.totals[scorerId].fieldSeconds = 2 * 60;
    game = recordGoal(game, "us", scorerId, 1_000);
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );

    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
    expect(
      document.querySelector(".player-game-summaries > li:first-child"),
    ).toHaveTextContent(
      team.roster.find((player) => player.id === scorerId)!.name,
    );
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
      screen.getByRole("button", { name: "Open actions for Simon" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take Simon out of game" }),
    );

    const summary = screen.getByRole("dialog", {
      name: "Substitution ready",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#4 Dylan");
    expect(screen.getByText("Simon out of game")).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Open actions for Simon" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Take Simon out of game" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Simon to game" }));

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
