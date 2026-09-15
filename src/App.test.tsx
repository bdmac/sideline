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
  getFormation,
  INITIAL_STATE,
  queueSubstitutions,
  recordGoal,
  setClockRunning,
  suggestSubstitutions,
} from "./domain";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "./devicePreferences";
import { STORAGE_KEY } from "./storage";
import { THEME_STORAGE_KEY } from "./theme";

const startGame = () => {
  fireEvent.click(screen.getByRole("button", { name: "Formation" }));
  fireEvent.click(screen.getByRole("button", { name: "Starters" }));
  fireEvent.click(screen.getByRole("button", { name: "Start game" }));
};

const openPositionEditor = (playerName: string) => {
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(`^Open actions for ${playerName}(?:\\.|$)`),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Change positions" }));
};

describe("Sideline app", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "wakeLock");
    Reflect.deleteProperty(navigator, "vibrate");
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

  it("persists the selected color mode on the local device", () => {
    const firstRender = render(<App />);
    expect(
      screen.getByRole("button", { name: "Use dark mode" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Use light mode" }),
    ).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      screen.getByRole("button", { name: "Use light mode" }),
    ).toBeInTheDocument();
  });

  it("persists game-day settings from an anchored settings menu", async () => {
    const wakeLockRequest = vi.fn();
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: wakeLockRequest },
      configurable: true,
    });
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    const wakeLockSwitch = await screen.findByRole("button", {
      name: "Keep screen awake",
    });
    const alertSwitch = screen.getByRole("button", {
      name: "Substitution alerts",
    });
    expect(wakeLockSwitch).toHaveAttribute("aria-pressed", "false");
    expect(alertSwitch).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(wakeLockSwitch);
    fireEvent.click(alertSwitch);

    expect(
      JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toEqual({
      keepScreenAwake: true,
      substitutionAlerts: true,
    });
    expect(wakeLockRequest).not.toHaveBeenCalled();
    expect(
      document
        .querySelector(".settings-menu")
        ?.getAttribute("data-position-regular"),
    ).not.toBe("bottom");
  });

  it("keeps the screen awake when a saved preference has an active game", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = {
      released: false,
      release,
      addEventListener: vi.fn(),
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
    });
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: true,
        substitutionAlerts: false,
      }),
    );
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      await screen.findByText(/Active for the current game\./),
    ).toBeInTheDocument();
  });

  it("plays one alert for each due substitution-reminder cycle", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: false,
        substitutionAlerts: true,
      }),
    );
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
    );
    state.activeGame.clock.elapsedSeconds = 300;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    await waitFor(() => expect(vibrate).toHaveBeenCalledWith([160, 80, 160]));
    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("materializes a running game immediately when returning to Sideline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
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

    vi.setSystemTime(new Date("2026-09-14T12:05:01Z"));
    act(() => window.dispatchEvent(new Event("pageshow")));

    const recovered = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ).activeGame;
    expect(recovered.clock.elapsedSeconds).toBe(301);
    expect(recovered.clock.lastStartedAt).toBe(Date.now());
    expect(screen.getByLabelText("Substitution reminder")).toBeInTheDocument();
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
    expect(simon.querySelector(".attendance-player-number")).toHaveTextContent(
      "#10",
    );
    expect(simon.querySelector(".attendance-player-number")).toHaveAttribute(
      "data-variant",
      "success",
    );
    fireEvent.click(simon);
    const absentSimon = screen.getByRole("button", { name: /Simon Absent/i });
    expect(absentSimon).toBeInTheDocument();
    expect(
      absentSimon.querySelector(".attendance-player-number"),
    ).toHaveAttribute("data-variant", "danger");
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

  it("starts a Golden Dragons game with two 25-minute halves", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));

    const gameFormat = screen.getByLabelText("Game format");
    expect(gameFormat).toHaveValue("quarters-10");
    expect(
      within(gameFormat).getByRole("option", {
        name: "2 halves · 25:00 each",
      }),
    ).toBeInTheDocument();
    fireEvent.change(gameFormat, { target: { value: "halves-25" } });

    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    const activeGame = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ).activeGame;
    expect(activeGame.durationSeconds).toBe(50 * 60);
    expect(activeGame.periodCount).toBe(2);
    expect(screen.getByText("Half 1")).toBeInTheDocument();
  });

  it("warns when attendance drops below the required side size", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    expect(
      screen.getByRole("button", { name: "Add guest player" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Add guest player" })
        .closest(".guest-attendance-section"),
    ).toBeInTheDocument();

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
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add guest player" }),
    ).toHaveClass("guest-add-button");
    expect(
      screen.getByRole("button", { name: "Add guest player" }),
    ).toHaveAttribute("data-variant", "default");

    fireEvent.click(screen.getByRole("button", { name: "Simon Absent" }));
    expect(container.querySelector(".attendance-count.short")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add guest player" }),
    ).toBeInTheDocument();
  });

  it("adds a guest player for one game without changing the team roster", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

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

    const guestRow = screen.getByRole("group", {
      name: "Borrowed Alex, guest player",
    });
    expect(guestRow).toHaveTextContent("Borrowed Alex");
    expect(guestRow).toHaveTextContent("Guest · Present");
    expect(
      guestRow.querySelector(".attendance-player-number"),
    ).toHaveTextContent("#31");
    expect(
      within(guestRow).queryByRole("button", {
        name: /Borrowed Alex Guest · Present/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Guest players" }),
    ).toBeInTheDocument();
    expect(guestRow.closest(".attendance-grid")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove guest Borrowed Alex" }),
    ).toHaveClass("guest-remove-button");
    expect(
      screen.getByRole("button", { name: "Remove guest Borrowed Alex" }),
    ).toHaveAttribute("data-variant", "invisible");
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

  it("calls out the no-bench case when exactly enough players attend", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Simon", "Noah", "Maddox", "Ollie"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: `${name} Present` }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));

    expect(
      screen.getByText(
        "No bench — exactly enough players. 🪦 their little legs and lungs.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(
      screen.getByText(
        "Position changes are still available. Tiny legs, big minutes.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(document.querySelector(".pitch-player") as HTMLElement);
    const playerActions = screen.getByRole("dialog");
    expect(
      within(playerActions).queryByRole("button", {
        name: /Plan .* out/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(playerActions).getByRole("button", {
        name: "Change positions",
      }),
    ).toBeInTheDocument();
  });

  it("assigns starters from the tactics board and swaps occupied positions", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));

    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(
      Array.from(document.querySelectorAll(".starter-bench-list li")).map(
        (playerName) => playerName.textContent,
      ),
    ).toEqual(["Dylan", "Evan", "Henry", "Noah"]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change Ollie at Left Midfielder",
      }),
    );
    const starterPicker = screen.getByRole("dialog", {
      name: "Choose Left Midfielder",
    });
    expect(starterPicker).toBeInTheDocument();
    expect(
      Array.from(
        starterPicker.querySelectorAll(".starter-choice-player > strong"),
      ).map((playerName) => playerName.textContent),
    ).toEqual([
      "Dylan",
      "Evan",
      "Haru",
      "Henry",
      "Maddox",
      "Malik",
      "Noah",
      "Simon",
    ]);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Haru.*Currently Right Midfielder/,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Change Haru at Left Midfielder",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Change Ollie at Right Midfielder",
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

    fireEvent.click(goalkeeperSlot);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Henry.*Currently on starting bench/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(
      screen.getByRole("button", {
        name: "Change Henry at Goalkeeper",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start game" })).toBeEnabled();
  });

  it("labels setup navigation by its team-selection destination", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

    const formationButton = screen.getByRole("button", { name: "Formation" });
    expect(formationButton).toHaveAttribute("data-component", "Button");
    expect(formationButton).toHaveAttribute("data-variant", "primary");
    expect(formationButton.querySelector("svg")).toBeInTheDocument();

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
    expect(screen.queryByText("Out of game")).not.toBeInTheDocument();
    expect(screen.getByText("Evan")).toBeInTheDocument();

    const gameLog = screen.getByText("Game timeline").closest("details");
    expect(gameLog).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Game timeline"));
    expect(gameLog).toHaveAttribute("open");
    expect(screen.getByText("Evan added to game")).toBeInTheDocument();
  });

  it("hides empty live-game exception and timeline sections", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(screen.queryByText("Out of game")).not.toBeInTheDocument();
    expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Q1" }));

    expect(screen.getByText("Game timeline").closest("details")).toHaveClass(
      "follows-roster",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Start Q1" }));

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
    expect(screen.getByLabelText("Game clock, running")).toBeInTheDocument();
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
    const gameLog = within(summary)
      .getByText("Game timeline")
      .closest("details");
    expect(gameLog).toBeInTheDocument();
    expect(gameLog).not.toHaveAttribute("open");
    expect(gameLog).toHaveTextContent("0 events");
    fireEvent.click(within(summary).getByText("Game timeline"));
    expect(
      within(gameLog as HTMLElement).getByText("Game ended"),
    ).toBeVisible();
    expect(
      within(gameLog as HTMLElement).getByText("Quarter 1 ended"),
    ).toBeVisible();
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
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Center Back")).toBeInTheDocument();
    expect(screen.getByText("Playing total")).toBeInTheDocument();
    expect(screen.getByText("Field stint")).toBeInTheDocument();
    const maddoxTarget = screen.getByRole("button", {
      name: "Maddox (Goalkeeper)",
    });
    expect(maddoxTarget).toHaveTextContent("#14 Maddox");
    expect(maddoxTarget).toHaveTextContent("Stint0:00TotalNot played yet");
    expect(maddoxTarget).toHaveTextContent("Goalkeeper");
    expect(
      screen.queryByRole("button", { name: "Plan substitution" }),
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
    const actions = screen.getByRole("dialog", { name: "#10 Simon" });
    expect(actions).not.toHaveClass("sideline-dialog-bodyless");
    expect(
      within(actions)
        .getByRole("heading", { name: "#10 Simon" })
        .querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: "Plan Simon out" }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: "Change positions" }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", {
        name: "Take Simon out of game",
      }),
    ).toHaveAttribute("data-variant", "danger");

    fireEvent.mouseDown(actions.parentElement!);
    fireEvent.click(actions.parentElement!);
    expect(
      screen.queryByRole("dialog", { name: "#10 Simon" }),
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
    expect(confirmation).toHaveClass("sideline-dialog-bodyless");
    fireEvent.mouseDown(confirmation.parentElement!);
    fireEvent.click(confirmation.parentElement!);

    expect(
      screen.queryByRole("alertdialog", { name: "End this game?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End game" }),
    ).toBeInTheDocument();
  });

  it("offers Continue game and a close button in the end-game confirmation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    let confirmation = screen.getByRole("alertdialog", {
      name: "End this game?",
    });
    expect(
      within(confirmation).getByRole("button", { name: "Continue game" }),
    ).toHaveAttribute("data-variant", "default");
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Close" }),
    );
    expect(
      screen.queryByRole("alertdialog", { name: "End this game?" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    confirmation = screen.getByRole("alertdialog", {
      name: "End this game?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Continue game" }),
    );
    expect(
      screen.queryByRole("alertdialog", { name: "End this game?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On the field" })).toBeVisible();
  });

  it("does not offer the tapped player as a swap target", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");

    expect(
      screen.queryByRole("button", { name: "Maddox (Goalkeeper)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simon (Center Back)" }),
    ).toBeInTheDocument();
  });

  it("opens position editing with the tapped pitch player selected", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");

    const positionDialog = screen.getByRole("dialog", {
      name: "#14 Maddox - Change position",
    });
    expect(positionDialog).toBeInTheDocument();
    expect(
      within(positionDialog)
        .getByRole("heading", { name: "#14 Maddox - Change position" })
        .querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Player")).not.toBeInTheDocument();
    expect(
      within(positionDialog).queryByText("Player", { selector: "dt" }),
    ).not.toBeInTheDocument();
    expect(within(positionDialog).getByText("Goalkeeper")).toBeInTheDocument();
    expect(
      within(positionDialog).getByRole("button", { name: "Choose a position" }),
    ).toBeDisabled();
    expect(within(positionDialog).queryByText("Swap")).not.toBeInTheDocument();
    expect(within(positionDialog).queryByText("Move")).not.toBeInTheDocument();
  });

  it("logs position changes made in the editor", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Ollie");
    const confirmButton = screen.getByRole("button", {
      name: "Choose a position",
    });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Haru (Right Midfielder)" }),
    );
    expect(confirmButton).toBeEnabled();
    expect(confirmButton).toHaveAccessibleName("Swap Ollie with Haru");
    expect(confirmButton).toHaveTextContent("Swap with Haru");
    expect(
      screen.getByLabelText(
        "Position changing from Left Midfielder to Right Midfielder",
      ),
    ).toHaveTextContent("Left MidfielderRM");
    fireEvent.click(confirmButton);

    expect(screen.getByText("Ollie ↔ Haru")).toBeInTheDocument();
    expect(
      screen.getByText("Left Midfielder ↔ Right Midfielder"),
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
    const ollie = screen.getByRole("button", {
      name: "Open actions for Ollie",
    });

    fireEvent(
      ollie,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 300,
        clientY: 420,
      }),
    );
    fireEvent(
      ollie,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 700,
        clientY: 420,
      }),
    );
    fireEvent(
      ollie,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 700,
        clientY: 420,
      }),
    );

    expect(screen.getByText("Ollie ↔ Haru")).toBeInTheDocument();
    expect(
      screen.getByText("Left Midfielder ↔ Right Midfielder"),
    ).toBeInTheDocument();
  });

  it("readies substitutions without changing the lineup, then sends them in", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    const planner = screen.getByRole("dialog", {
      name: "Plan substitutions",
    });
    expect(planner.querySelector(".swap-column-headings")).toHaveTextContent(
      "INOUT",
    );
    expect(
      planner.querySelector(".swap-player-status"),
    ).not.toBeInTheDocument();
    expect(planner.querySelectorAll(".swap-transfer svg")).toHaveLength(3);
    expect(planner.querySelectorAll(".swap-transfer small")).toHaveLength(3);
    expect(
      Array.from(
        planner.querySelectorAll(".swap-transfer small"),
        (item) => item.textContent,
      ),
    ).toEqual(expect.arrayContaining(["Keeper", "Center Back", "Left Mid"]));
    expect(screen.queryByText("Confirm together")).not.toBeInTheDocument();
    const outgoingPlayers =
      within(planner).getAllByLabelText(/outgoing player/);
    const incomingPlayers =
      within(planner).getAllByLabelText(/incoming player/);
    const firstOutgoingName = outgoingPlayers[0].textContent?.trim() ?? "";
    const secondOutgoingName = outgoingPlayers[1].textContent?.trim() ?? "";
    const firstIncomingName = incomingPlayers[0].textContent?.trim() ?? "";
    const secondIncomingName = incomingPlayers[1].textContent?.trim() ?? "";
    fireEvent.click(outgoingPlayers[1]);
    expect(
      screen.getByText(`Where should ${secondIncomingName} play?`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Who's coming OUT?")).not.toBeInTheDocument();
    const repeatedOutgoing = screen
      .getAllByRole("menuitemradio")
      .find((item) => item.textContent?.includes(firstOutgoingName));
    expect(repeatedOutgoing).toBeDefined();
    expect(repeatedOutgoing).toHaveTextContent(
      `Going out for ${firstIncomingName}`,
    );
    expect(
      repeatedOutgoing?.querySelector(
        ".player-action-menu-status.outgoing-status",
      ),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("menuitemradio")
        .every((item) => item.getAttribute("aria-disabled") !== "true"),
    ).toBe(true);
    fireEvent.click(repeatedOutgoing!);
    expect(outgoingPlayers[1]).toHaveTextContent(firstOutgoingName);
    expect(outgoingPlayers[0]).toHaveTextContent(secondOutgoingName);

    fireEvent.click(incomingPlayers[1]);
    expect(screen.getByText("Who should go in?")).toBeInTheDocument();
    expect(screen.queryByText("Who's going IN?")).not.toBeInTheDocument();
    expect(screen.queryByText(/^At .+ for .+$/)).not.toBeInTheDocument();
    const repeatedIncoming = screen
      .getAllByRole("menuitemradio")
      .find((item) => item.textContent?.includes(firstIncomingName));
    expect(repeatedIncoming).not.toHaveAttribute("data-inactive", "true");
    expect(repeatedIncoming).not.toHaveAttribute("aria-disabled", "true");
    expect(repeatedIncoming).toHaveTextContent(/#\d+ .+/);
    expect(repeatedIncoming).toHaveTextContent(
      /Prefers.+Bench0:00PlayedNot played yet/,
    );
    expect(
      screen
        .getAllByRole("menuitemradio")
        .every((item) => !item.querySelector(".replacement-fit")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("menuitemradio")
        .find((item) => item.getAttribute("aria-checked") === "true")
        ?.querySelector(".replacement-selected-icon"),
    ).toBeInTheDocument();
    expect(repeatedIncoming).toHaveTextContent(
      `Going in for ${secondOutgoingName}`,
    );
    expect(
      repeatedIncoming?.querySelector(
        ".player-action-menu-status.incoming-status",
      ),
    ).toBeInTheDocument();
    expect(
      repeatedIncoming?.querySelector(
        ".player-action-menu-status .lucide-arrow-right-left",
      ),
    ).toBeInTheDocument();
    fireEvent.click(repeatedIncoming!);
    expect(incomingPlayers[1]).toHaveTextContent(firstIncomingName);
    expect(incomingPlayers[0]).not.toHaveTextContent(firstIncomingName);
    const queueButton = screen.getByRole("button", { name: "Ready 3 swaps" });
    expect(queueButton).toHaveClass("primary-action");
    fireEvent.click(queueButton);

    const summary = screen.getByRole("dialog", {
      name: "Review substitutions (3)",
    });
    expect(
      within(summary).getByRole("button", { name: "Send 'em in" }),
    ).toHaveClass("primary-action");

    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("IN");
    expect(within(summary).getAllByText("OUT")).toHaveLength(1);
    expect(within(summary).getAllByText("IN")).toHaveLength(1);
    expect(summary.querySelectorAll(".ready-direction svg")).toHaveLength(3);
    expect(
      Array.from(
        summary.querySelectorAll(".ready-direction small"),
        (item) => item.textContent,
      ),
    ).toEqual(expect.arrayContaining(["Keeper", "Center Back", "Left Mid"]));
    expect(
      summary.querySelectorAll(
        '.ready-player-number[data-component="Label"][data-variant="danger"]',
      ),
    ).toHaveLength(3);
    expect(
      summary.querySelectorAll(
        '.ready-player-number[data-component="Label"][data-variant="success"]',
      ),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", {
        name: /Open actions for Simon\. Coming out for/,
      }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".pitch-plan-icon")).toHaveLength(3);

    fireEvent.click(
      within(summary).getByRole("button", { name: "Send 'em in" }),
    );
    expect(
      screen.getByRole("button", { name: "Open actions for Dylan" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /Review substitutions/ }),
    ).not.toBeInTheDocument();
  });

  it("removes a specific row from the substitution planner", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    const planner = screen.getByRole("dialog", {
      name: "Plan substitutions",
    });
    const originalIncoming = within(planner)
      .getAllByLabelText(/incoming player/)
      .map((button) => button.textContent);
    const originalOutgoing = within(planner)
      .getAllByLabelText(/outgoing player/)
      .map((button) => button.textContent);

    fireEvent.click(
      within(planner).getByRole("button", {
        name: /^Remove substitution 2:/,
      }),
    );

    expect(
      within(planner)
        .getAllByLabelText(/incoming player/)
        .map((button) => button.textContent),
    ).toEqual([originalIncoming[0], originalIncoming[2]]);
    expect(
      within(planner)
        .getAllByLabelText(/outgoing player/)
        .map((button) => button.textContent),
    ).toEqual([originalOutgoing[0], originalOutgoing[2]]);
    expect(
      within(planner).getAllByRole("button", {
        name: /^Remove substitution \d+:/,
      }),
    ).toHaveLength(2);
    expect(
      within(planner).getByRole("button", { name: "Ready 2 swaps" }),
    ).toBeEnabled();
  });

  it("keeps a ready plan valid when its outgoing player changes positions", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pair = suggestSubstitutions(game, 1, team)[0];
    state.activeGame = queueSubstitutions(game, [pair]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const outgoing = team.roster.find(
      (player) => player.id === pair.outPlayerId,
    )!;
    const formation = getFormation(game.formationId);
    const targetPosition = formation.positions.find(
      (position) => position.id !== pair.positionId,
    )!;
    const targetPlayerId = game.assignments[targetPosition.id];
    const targetPlayer = team.roster.find(
      (player) => player.id === targetPlayerId,
    )!;

    openPositionEditor(outgoing.name);
    fireEvent.click(
      screen.getByRole("button", {
        name: `${targetPlayer.name} (${targetPosition.label})`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Swap ${outgoing.name} with ${targetPlayer.name}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );

    const review = screen.getByRole("dialog", {
      name: "Review substitutions (1)",
    });
    expect(within(review).getByText(targetPosition.mediumLabel)).toBeVisible();
    expect(
      within(review).queryByText(targetPosition.shortLabel),
    ).not.toBeInTheDocument();
    expect(
      within(review).getByRole("button", { name: "Send 'em in" }),
    ).toBeEnabled();
    expect(
      within(review).queryByText("Plan needs attention"),
    ).not.toBeInTheDocument();
  });

  it("keeps all six U12 bench players selectable while refilling the displaced row", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    const planner = screen.getByRole("dialog", {
      name: "Plan substitutions",
    });
    fireEvent.click(within(planner).getByRole("button", { name: "6" }));

    const incomingPlayers =
      within(planner).getAllByLabelText(/incoming player/);
    expect(incomingPlayers).toHaveLength(6);
    const firstIncomingName = incomingPlayers[0].textContent?.trim() ?? "";
    const secondIncomingName = incomingPlayers[1].textContent?.trim() ?? "";

    fireEvent.click(incomingPlayers[1]);
    const choices = screen.getAllByRole("menuitemradio");
    expect(choices).toHaveLength(6);
    expect(
      choices.every(
        (choice) => choice.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);

    fireEvent.click(
      choices.find((choice) =>
        choice.textContent?.includes(firstIncomingName),
      )!,
    );
    expect(incomingPlayers[0]).toHaveTextContent(secondIncomingName);
    expect(incomingPlayers[1]).toHaveTextContent(firstIncomingName);
    expect(screen.getByRole("button", { name: "Ready 6 swaps" })).toBeEnabled();
  });

  it("prompts U8 to plan substitutions after five minutes without a swap", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
      2,
    );
    game.clock.elapsedSeconds = 300;
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const reminder = screen.getByLabelText("Substitution reminder");
    expect(reminder).toHaveTextContent("No player swaps in 5:00");
    expect(screen.getByRole("tab", { name: "Bench 4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rotation timer")).toHaveTextContent(
      "RotationDue now",
    );
    fireEvent.click(
      within(reminder).getByRole("button", { name: "Plan subs" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Plan substitutions" }),
    ).toBeInTheDocument();
  });

  it("shows the time remaining until the next rotation reminder", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      1_000,
      2,
    );
    game.clock.elapsedSeconds = 120;
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    expect(screen.getByLabelText("Rotation timer")).toHaveTextContent(
      "RotationDue in 3:00",
    );
  });

  it("allows the coach to reduce the default full-bench rotation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(
      screen.getByRole("button", { name: "Ready 1 swap" }),
    ).toBeInTheDocument();
  });

  it("shows rich player details and returns focus after choosing a swap player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    const outgoingTrigger = within(planner).getByLabelText(
      "Swap 1 outgoing player",
    );
    const originalPlayer = outgoingTrigger.textContent;
    fireEvent.click(outgoingTrigger);

    const options = screen.getAllByRole("menuitemradio");
    expect(options[0]).toHaveTextContent(/Stint0:00TotalNot played yet/);
    expect(options[0].querySelector(".replacement-fit")).toHaveTextContent(
      /preference|Outside preferences/,
    );
    expect(
      options
        .find((option) => option.getAttribute("aria-checked") === "true")
        ?.querySelector(".replacement-selected-icon"),
    ).toBeInTheDocument();
    const replacement = options.find(
      (option) =>
        option.getAttribute("aria-checked") === "false" &&
        !option.hasAttribute("data-inactive"),
    );
    expect(replacement).toBeDefined();
    const replacementName =
      replacement!.querySelector(".replacement-player-summary")?.textContent ??
      "";
    fireEvent.click(replacement!);

    expect(outgoingTrigger).toHaveTextContent(
      replacementName.replace(/^#\d+\s+/, ""),
    );
    expect(outgoingTrigger).not.toHaveTextContent(originalPlayer ?? "");
    expect(outgoingTrigger).toHaveFocus();
  });

  it("dismisses an open player menu before opening another selector", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    const outgoingTrigger = within(planner).getByLabelText(
      "Swap 1 outgoing player",
    );
    const incomingTrigger = within(planner).getByLabelText(
      "Swap 1 incoming player",
    );

    fireEvent.click(outgoingTrigger);
    expect(screen.getAllByRole("menuitemradio")).not.toHaveLength(0);

    fireEvent.click(incomingTrigger);
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();

    fireEvent.click(incomingTrigger);
    expect(screen.getAllByRole("menuitemradio")).not.toHaveLength(0);
  });

  it("keeps planner chrome fixed around a scrollable dialog body", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    const planButton = screen.getByRole("button", { name: "Plan subs" });
    expect(planButton).not.toHaveAttribute("data-label-wrap");
    planButton.focus();
    fireEvent.click(planButton);

    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    expect(
      planner.querySelector('[data-component="Dialog.Header"]'),
    ).toBeInTheDocument();
    expect(
      planner.querySelector('[data-component="Dialog.Body"]'),
    ).toBeInTheDocument();
    expect(
      planner.querySelector('[data-component="Dialog.Footer"]'),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Plan substitutions" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(planButton).toHaveFocus());
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
    Object.values(game.assignments).forEach((playerId, index) => {
      game.totals[playerId].fieldSeconds = index * 60;
    });
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    fireEvent.click(within(planner).getByRole("button", { name: "2" }));

    const playerName = (playerId: string) =>
      team.roster.find((player) => player.id === playerId)!.name;
    expect(
      within(planner)
        .getAllByLabelText(/incoming player/)
        .map((button) => button.textContent?.trim()),
    ).toEqual(
      expect.arrayContaining([
        playerName(firstLeastPlayed),
        playerName(secondLeastPlayed),
      ]),
    );

    const expectedOutgoingOptions = Object.values(game.assignments).sort(
      (playerA, playerB) =>
        game.totals[playerB].fieldSeconds - game.totals[playerA].fieldSeconds ||
        playerName(playerA).localeCompare(playerName(playerB)),
    );
    const unavailableOutgoingNames = within(planner)
      .getAllByLabelText(/outgoing player/)
      .slice(1)
      .map((button) => button.textContent?.trim());
    fireEvent.click(within(planner).getAllByLabelText(/outgoing player/)[0]);
    const outgoingMenuItems = screen.getAllByRole("menuitemradio");
    expect(
      outgoingMenuItems.every(
        (item) => item.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
    const visibleOutgoingIds = outgoingMenuItems.map((item) =>
      item.getAttribute("data-player-id"),
    );
    const plannedOutgoingIds = expectedOutgoingOptions.filter((playerId) =>
      unavailableOutgoingNames.includes(playerName(playerId)),
    );
    expect(visibleOutgoingIds).toEqual([
      ...expectedOutgoingOptions.filter(
        (playerId) => !unavailableOutgoingNames.includes(playerName(playerId)),
      ),
      ...plannedOutgoingIds,
    ]);
    expect(outgoingMenuItems.at(-1)).toHaveTextContent(/^.+Going out for /);
    fireEvent.keyDown(document, { key: "Escape" });

    const expectedIncomingOptions = [...game.benchIds].sort(
      (playerA, playerB) =>
        game.totals[playerA].fieldSeconds - game.totals[playerB].fieldSeconds ||
        playerName(playerA).localeCompare(playerName(playerB)),
    );
    fireEvent.click(within(planner).getAllByLabelText(/incoming player/)[0]);
    const incomingMenuItems = screen.getAllByRole("menuitemradio");
    expect(
      incomingMenuItems.every(
        (item) => item.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
    const plannedIncomingIds = new Set(
      incomingMenuItems
        .filter((item) => item.textContent?.includes("Going in for"))
        .map((item) => item.getAttribute("data-player-id")),
    );
    expect(
      incomingMenuItems.map((item) => item.getAttribute("data-player-id")),
    ).toEqual([
      ...expectedIncomingOptions.filter(
        (playerId) => !plannedIncomingIds.has(playerId),
      ),
      ...expectedIncomingOptions.filter((playerId) =>
        plannedIncomingIds.has(playerId),
      ),
    ]);
  });

  it("keeps a ready plan accessible from the live game until cancelled", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready 3 swaps" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Review substitutions (3)" }),
      ).getByRole("button", { name: "Close" }),
    );

    expect(screen.getByText("3 substitutions ready")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete plan" }));

    const confirmation = screen.getByRole("alertdialog", {
      name: "Delete substitution plan?",
    });
    expect(screen.getByText("3 substitutions ready")).toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Delete plan" }),
    );

    expect(screen.queryByText("4 substitutions ready")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
  });

  it("removes one reviewed substitution and reduces the editable plan count", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready 3 swaps" }));

    const summary = screen.getByRole("dialog", {
      name: "Review substitutions (3)",
    });
    const firstSwap = summary.querySelector(".ready-swap");
    const firstShell = firstSwap?.closest(".ready-swap-shell");
    fireEvent.touchStart(firstSwap!, {
      touches: [{ clientX: 150, clientY: 40 }],
    });
    fireEvent.touchEnd(firstSwap!, {
      changedTouches: [{ clientX: 70, clientY: 42 }],
    });
    expect(firstShell).toHaveClass("swipe-revealed");

    fireEvent.click(
      within(summary).getAllByRole("button", {
        name: /^Remove .* substitution$/,
      })[0],
    );

    const reducedSummary = screen.getByRole("dialog", {
      name: "Review substitutions (2)",
    });
    const removeActions = within(reducedSummary).getAllByRole("button", {
      name: /^Remove .* substitution$/,
    });
    expect(removeActions).toHaveLength(2);
    removeActions.forEach((action) => {
      expect(action).toHaveAttribute("data-variant", "invisible");
      expect(action).toHaveClass("ready-swap-remove");
    });
    expect(screen.getByText("2 substitutions ready")).toBeInTheDocument();

    fireEvent.click(
      within(reducedSummary).getByRole("button", { name: "Edit plan" }),
    );
    const planner = screen.getByRole("dialog", {
      name: "Plan substitutions",
    });
    expect(within(planner).getByRole("button", { name: "2" })).toHaveClass(
      "active",
    );
    expect(within(planner).getAllByLabelText(/outgoing player/)).toHaveLength(
      2,
    );
  });

  it("deletes the ready plan when its final reviewed substitution is removed", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready 1 swap" }));

    const summary = screen.getByRole("dialog", {
      name: "Review substitutions (1)",
    });
    fireEvent.click(
      within(summary).getByRole("button", {
        name: /^Remove .* substitution$/,
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: /Review substitutions/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
  });

  it("queues and edits one substitution directly from a bench player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "Plan Dylan in" }));
    const firstPicker = screen.getByRole("dialog", {
      name: "#4 Dylan - Plan in",
    });
    expect(
      within(firstPicker)
        .getByRole("heading", { name: "#4 Dylan - Plan in" })
        .querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(firstPicker).toHaveTextContent("Bench stint0:00");
    expect(firstPicker).toHaveTextContent(
      "Playing totalNot played yetPreferred rolesDefense · Midfield",
    );
    expect(
      within(firstPicker).getByRole("button", {
        name: /Center Back.*#10 Simon/,
      }),
    ).toHaveTextContent(
      "Center Back1st preference#10 SimonStint0:00TotalNot played yet",
    );
    const centerBackChoice = within(firstPicker).getByRole("button", {
      name: /Center Back.*#10 Simon/,
    });
    expect(
      centerBackChoice.querySelector(".replacement-position-primary"),
    ).toHaveTextContent("Center Back");
    expect(
      centerBackChoice.querySelector(".replacement-player-secondary"),
    ).toHaveTextContent("#10 Simon");
    expect(
      within(firstPicker).getAllByText("Outside preferences").length,
    ).toBeGreaterThan(0);
    expect(
      within(firstPicker)
        .getByText("1st preference")
        .closest(".replacement-fit"),
    ).toHaveClass("preference-rank-1");
    expect(
      within(firstPicker)
        .getAllByText("Outside preferences")[0]
        .closest(".replacement-fit"),
    ).toHaveClass("preference-rank-outside");
    fireEvent.click(
      within(firstPicker).getByRole("button", {
        name: /Center Back.*#10 Simon/,
      }),
    );
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
    fireEvent.click(
      within(firstPicker).getByRole("button", { name: "Add to plan" }),
    );

    expect(screen.getByText("1 substitution ready")).toBeInTheDocument();
    const benchPlanStatus = screen.getByText("Going in at CB for Simon");
    expect(benchPlanStatus).toBeInTheDocument();
    expect(
      benchPlanStatus.querySelector(".lucide-arrow-right-left"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /Review substitutions/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );

    let queued = screen.getByRole("dialog", {
      name: "Review substitutions (1)",
    });
    expect(queued).toHaveTextContent("Simon #10");
    expect(queued).toHaveTextContent("Dylan #4");
    fireEvent.click(within(queued).getByRole("button", { name: "Edit plan" }));

    const planner = screen.getByRole("dialog", { name: "Plan substitutions" });
    expect(
      within(planner).getByLabelText("Swap 1 outgoing player"),
    ).toHaveTextContent("Simon");
    expect(
      within(planner).getByLabelText("Swap 1 incoming player"),
    ).toHaveTextContent("Dylan");
    fireEvent.click(within(planner).getByRole("button", { name: "2" }));
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    expect(
      within(planner).getByLabelText("Swap 1 outgoing player"),
    ).toHaveTextContent("Simon");
    expect(
      within(planner).getByLabelText("Swap 1 incoming player"),
    ).toHaveTextContent("Dylan");
    fireEvent.click(within(planner).getByRole("button", { name: "Close" }));

    expect(screen.getByText("Going in at CB for Simon")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Dylan going in",
      }),
    );
    const editPicker = screen.getByRole("dialog", {
      name: "#4 Dylan - Plan in",
    });
    expect(editPicker).toHaveTextContent(
      "Next rotationGoing in at CB for Simon",
    );
    const selectedOutgoing = within(editPicker).getByRole("button", {
      name: /Center Back.*#10 Simon/,
    });
    expect(selectedOutgoing).toHaveAttribute("aria-pressed", "true");
    expect(
      selectedOutgoing.querySelector(".replacement-selected-icon"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(editPicker).getByRole("button", {
        name: /Left Midfielder.*#23 Ollie/,
      }),
    );
    expect(editPicker).toHaveTextContent(
      "Next rotationGoing in at LM for Ollie",
    );
    expect(screen.getByText("Going in at CB for Simon")).toBeInTheDocument();
    fireEvent.click(
      within(editPicker).getByRole("button", { name: "Update plan" }),
    );

    expect(
      screen.queryByRole("dialog", { name: /Review substitutions/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Going in at LM for Ollie")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    queued = screen.getByRole("dialog", {
      name: "Review substitutions (1)",
    });
    expect(queued).toHaveTextContent("Ollie #23");
    expect(queued).toHaveTextContent("Dylan #4");
    expect(screen.getByText("1 substitution ready")).toBeInTheDocument();
    fireEvent.click(within(queued).getByRole("button", { name: "Close" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Dylan going in",
      }),
    );
    const removeFromQueue = screen.getByRole("button", {
      name: "Remove from plan",
    });
    expect(removeFromQueue).toHaveAttribute("data-variant", "danger");
    fireEvent.click(removeFromQueue);

    expect(screen.queryByText(/Going in at/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan Dylan in" }),
    ).toBeInTheDocument();
  });

  it("removes a queued bench player when they become unavailable", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "Plan Dylan in" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "#4 Dylan - Plan in" }),
      ).getByRole("button", { name: /Center Back.*#10 Simon/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to plan" }));

    const removePlayerButton = screen.getByRole("button", {
      name: "Take Dylan out of game",
    });
    expect(removePlayerButton).toHaveAttribute("data-variant", "danger");
    expect(
      screen.getByRole("button", {
        name: "Edit Dylan going in",
      }),
    ).toHaveAttribute("data-variant", "primary");
    fireEvent.click(removePlayerButton);

    const confirmation = screen.getByRole("alertdialog", {
      name: "Take Dylan out of game?",
    });
    expect(screen.queryByText("Dylan out of game")).not.toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Remove player",
      }),
    );
    expect(screen.getByText("Dylan out of game")).toBeInTheDocument();
    expect(screen.queryByText(/Going in at/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
  });

  it("tracks our scorer, opponent goals, and the final score", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const goalButton = screen.getByRole("button", { name: "Record a goal" });
    expect(goalButton).toBeDisabled();
    expect(goalButton.querySelector(".soccer-ball-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Q1" }));
    expect(goalButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
    const scorerDialog = screen.getByRole("dialog", { name: "Record a goal" });
    expect(
      within(scorerDialog).queryByRole("button", {
        name: /Record goal for #14 Maddox/,
      }),
    ).not.toBeInTheDocument();
    const simonScorer = within(scorerDialog).getByRole("button", {
      name: "Record goal for #10 Simon at Center Back",
    });
    expect(simonScorer).toHaveTextContent("#10 SimonCB");
    expect(
      simonScorer.querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(simonScorer.querySelector(".goal-scorer-position")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      within(scorerDialog).queryByRole("button", {
        name: /Record goal for #7 Noah/,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(simonScorer);
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
    expect(goalSummary).toHaveTextContent("Simon");
    expect(
      within(goalSummary).getByLabelText("Simon scored 1 goal"),
    ).toBeInTheDocument();
    fireEvent.click(within(goalSummary).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Opponent scored" }));
    expect(
      within(expandedStatus as HTMLElement).getByLabelText("Score"),
    ).toHaveTextContent("Us1–Opponent1");

    fireEvent.click(screen.getByText("Game timeline"));
    const scoredEvent = screen.getByText("Simon scored").closest("li");
    expect(scoredEvent).toBeInTheDocument();
    expect(scoredEvent?.querySelector(".soccer-ball-icon")).toBeInTheDocument();
    expect(
      screen.getByText(/^Goal for Golden Dragons · /),
    ).not.toHaveTextContent("Goalkeeper");
    expect(screen.getByText("Opponent scored")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo last change" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(goalButton).toBeDisabled();

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
      screen.getByLabelText("Simon scored 1 goal").querySelectorAll("svg"),
    ).toHaveLength(1);
    expect(screen.queryByLabelText(/1 goal scored as/)).not.toBeInTheDocument();
  });

  it("compacts the match status header after scrolling", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    const compactHeader = container.querySelector(".compact-match-header");

    expect(
      within(screen.getByLabelText("Match status")).getByText("10:00 left"),
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
      compactHeader?.querySelector(".compact-match-clock svg"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).queryByText("10:00 left"),
    ).not.toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByText("Q1"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByRole("button", {
        name: "End game",
      }),
    ).toBeInTheDocument();
  });

  it("keeps match controls together and centers substitutions in the dock", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const expandedClockButton = container.querySelector(
      ".match-header .match-clock-button",
    );
    expect(expandedClockButton).toHaveAccessibleName("Start Q1");
    expect(expandedClockButton).toHaveTextContent("Start Q1");
    expect(expandedClockButton).toHaveClass("turf-clock-action");
    expect(expandedClockButton).toHaveAttribute("data-variant", "default");
    expect(container.querySelector(".compact-clock-button")).toHaveClass(
      "turf-clock-action",
    );
    expect(
      container.querySelector(".match-header .match-end-copy-short"),
    ).toHaveTextContent("End");
    const dockButtons = within(
      container.querySelector(".mobile-control-dock") as HTMLElement,
    ).getAllByRole("button");
    expect(dockButtons.map((button) => button.textContent?.trim())).toEqual([
      "Undo",
      "Plan subs",
      "Goal",
    ]);
    expect(
      screen.queryByRole("button", { name: "Positions" }),
    ).not.toBeInTheDocument();

    fireEvent.click(expandedClockButton as HTMLElement);
    expect(expandedClockButton).not.toHaveClass("turf-clock-action");
    expect(container.querySelector(".compact-clock-button")).not.toHaveClass(
      "turf-clock-action",
    );
  });

  it("adds a game-only guest directly to the live bench", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const benchPanel = screen.getByRole("tabpanel");
    const addGuestButton = within(benchPanel).getByRole("button", {
      name: "Add guest player to bench",
    });
    expect(addGuestButton.closest(".bench-list")).toBeInTheDocument();
    expect(addGuestButton).toHaveClass("live-guest-add-row");
    expect(addGuestButton).toHaveAttribute("data-variant", "invisible");
    expect(addGuestButton).toHaveTextContent("New playerAdd to bench");
    expect(addGuestButton.querySelector(".guest-add-placeholder")).toHaveClass(
      "player-number",
    );
    fireEvent.click(addGuestButton);
    const guestDialog = screen.getByRole("dialog", {
      name: "Add guest player",
    });
    fireEvent.change(within(guestDialog).getByLabelText("Player name"), {
      target: { value: "Borrowed Casey" },
    });
    fireEvent.click(
      within(guestDialog).getByRole("button", { name: "Add guest" }),
    );

    expect(screen.getByRole("tab", { name: "Bench 5" })).toBeInTheDocument();
    expect(screen.getByText("Borrowed Casey")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("tab", { name: "Bench 4" })).toBeInTheDocument();
    expect(screen.queryByText("Borrowed Casey")).not.toBeInTheDocument();
  });

  it("labels the initial U12 clock action as the first half", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));
    startGame();

    expect(
      container.querySelector(".match-header .match-clock-button"),
    ).toHaveAccessibleName("Start H1");
  });

  it("keeps an unadvanced recovered game in its first quarter", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    delete (game as Partial<typeof game>).period;
    delete (game as Partial<typeof game>).periodEnds;
    game.clock = {
      elapsedSeconds: 25 * 60,
      running: false,
      lastStartedAt: null,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    expect(screen.getByText("Quarter 1 time reached")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End Quarter 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Quarter 3 time reached"),
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
      .getByRole("button", { name: `Plan ${team.roster[5].name} in` })
      .closest(".player-time-row");
    expect(benchPlayer).toHaveTextContent("2 min played");
    expect(benchPlayer).not.toHaveTextContent("Sitting");
    expect(screen.getByLabelText("Shared bench time")).toHaveTextContent(
      "All 2 sitting since start10:00",
    );
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
      .getByRole("button", { name: `Plan ${team.roster[5].name} in` })
      .closest(".player-time-row");
    expect(benchPlayer).toHaveTextContent("6 min played");
    expect(benchPlayer).toHaveTextContent("12 min total bench");
    expect(benchPlayer).not.toHaveTextContent("Sitting");
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
      .getByRole("button", { name: "Plan Dylan in" })
      .closest(".player-time-row");
    expect(screen.getByRole("button", { name: "Plan Dylan in" })).toHaveClass(
      "primary-action",
    );
    expect(dylanRow).toHaveTextContent("Not played yet");
    expect(dylanRow).not.toHaveTextContent("Sitting");
    expect(dylanRow).not.toHaveTextContent("total bench");
    expect(screen.getByLabelText("Shared bench time")).toHaveTextContent(
      "All 4 sitting since start0:00",
    );
  });

  it("shows every field timer once one player's time diverges", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const [positionId, outgoingId] = Object.entries(game.assignments)[1];
    const incomingId = game.benchIds[0];
    Object.values(game.assignments).forEach((id) => {
      game.totals[id].fieldSeconds = 600;
    });
    game.benchIds.forEach((id) => {
      game.totals[id].benchSeconds = 600;
    });
    game.clock.elapsedSeconds = 600;
    game = applySubstitutions(
      game,
      [{ outPlayerId: outgoingId, inPlayerId: incomingId, positionId }],
      team.sideSize,
      1_000,
    );
    game.clock.elapsedSeconds = 637;
    Object.values(game.assignments).forEach((id) => {
      game.totals[id].fieldSeconds += 37;
    });
    game.benchIds.forEach((id) => {
      game.totals[id].benchSeconds += 37;
    });
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const incomingName = team.roster.find(
      (player) => player.id === incomingId,
    )!.name;
    const outgoingName = team.roster.find(
      (player) => player.id === outgoingId,
    )!.name;
    const fieldIds = Object.values(game.assignments);
    expect(
      within(
        screen.getByRole("button", {
          name: `Open actions for ${incomingName}`,
        }),
      ).getByText("0:37"),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".pitch-time")).toHaveLength(
      team.sideSize,
    );
    expect(screen.getByLabelText("Shared bench time")).toHaveTextContent(
      "3 of 4 sitting since start10:37",
    );
    expect(
      screen
        .getByRole("button", { name: `Plan ${outgoingName} in` })
        .closest(".player-time-row"),
    ).toHaveTextContent("Sitting0:37");

    const fullGamePlayerId = fieldIds.find((id) => id !== incomingId)!;
    const fullGamePlayer = team.roster.find(
      (player) => player.id === fullGamePlayerId,
    )!;
    const fullGamePlayerName = fullGamePlayer.name;
    const fullGamePlayerLabel = fullGamePlayer.number
      ? `#${fullGamePlayer.number} ${fullGamePlayerName}`
      : fullGamePlayerName;
    const fullGamePitchPlayer = screen.getByRole("button", {
      name: `Open actions for ${fullGamePlayerName}`,
    });
    expect(fullGamePitchPlayer).toHaveTextContent("11 min");
    fireEvent.click(fullGamePitchPlayer);
    const playerActions = screen.getByRole("dialog", {
      name: fullGamePlayerLabel,
    });
    expect(playerActions).toHaveTextContent("Playing total11 min");
    expect(playerActions).toHaveTextContent("Field stint11 min");
    fireEvent.click(
      within(playerActions).getByRole("button", { name: "Close" }),
    );

    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    expect(
      document.querySelectorAll(".field-player-list .primary-time"),
    ).toHaveLength(team.sideSize);
    expect(
      screen
        .getByRole("button", { name: `Plan ${fullGamePlayerName} out` })
        .closest(".player-time-row"),
    ).toHaveTextContent("Playing11 min");
    expect(
      screen
        .getByRole("button", { name: `Plan ${incomingName} out` })
        .closest(".player-time-row"),
    ).toHaveTextContent("Playing0:37");
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
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
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
      .getByRole("button", { name: `Plan ${scorerName} in` })
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

  it("shows goal markers on the scorer's pitch card", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const scorerId = Object.values(game.assignments)[1];
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    game = recordGoal(game, "us", scorerId, 1_000);
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const scorerName = team.roster.find(
      (player) => player.id === scorerId,
    )!.name;
    const pitchCard = screen.getByRole("button", {
      name: `Open actions for ${scorerName}`,
    });
    expect(
      within(pitchCard)
        .getByLabelText(`${scorerName} scored 1 goal`)
        .querySelectorAll(".soccer-ball-icon"),
    ).toHaveLength(1);
  });

  it("uses a hatted ball for a hat trick across player markers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      10_000,
    );
    const scorerId = Object.values(game.assignments)[1];
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 10_000 };
    for (let goal = 0; goal < 3; goal += 1) {
      game = recordGoal(game, "us", scorerId, 10_000 + goal);
    }
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const scorerName = team.roster.find(
      (player) => player.id === scorerId,
    )!.name;
    const pitchCard = screen.getByRole("button", {
      name: `Open actions for ${scorerName}`,
    });
    const goalTotal = within(pitchCard).getByLabelText(
      `${scorerName} scored 3 goals`,
    );
    expect(goalTotal.querySelectorAll(".soccer-ball-icon")).toHaveLength(3);
    expect(goalTotal.querySelectorAll(".hat-trick-icon")).toHaveLength(3);
    expect(goalTotal).not.toHaveTextContent("×3");

    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    const visibleMarkers = screen.getAllByLabelText(
      `${scorerName} scored 3 goals`,
    );
    expect(visibleMarkers).toHaveLength(2);
    visibleMarkers.forEach((marker) => {
      expect(marker.querySelectorAll(".hat-trick-icon")).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
    const scorerDialog = screen.getByRole("dialog", { name: "Record a goal" });
    const scorerChoice = within(scorerDialog).getByRole("button", {
      name: new RegExp(`Record goal for .*${scorerName}`),
    });
    const compactGoalTotal =
      within(scorerChoice).getByLabelText(/scored 3 goals/);
    expect(compactGoalTotal.querySelectorAll(".hat-trick-icon")).toHaveLength(
      1,
    );
    expect(compactGoalTotal).toHaveTextContent("×3");
  });

  it("adds the exact count after the hatted marker above three goals", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    const scorerId = Object.values(game.assignments)[1];
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
    for (let goal = 0; goal < 4; goal += 1) {
      game = recordGoal(game, "us", scorerId, 1_000 + goal);
    }
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const scorerName = team.roster.find(
      (player) => player.id === scorerId,
    )!.name;
    const pitchCard = screen.getByRole("button", {
      name: `Open actions for ${scorerName}`,
    });
    const goalTotal = within(pitchCard).getByLabelText(
      `${scorerName} scored 4 goals`,
    );
    expect(goalTotal.querySelectorAll(".hat-trick-icon")).toHaveLength(1);
    expect(goalTotal).toHaveTextContent("×4");
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
      screen.getByRole("button", { name: "Plan Simon out" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan Simon out" })).toHaveClass(
      "primary-action",
    );
    expect(
      screen
        .getByRole("button", { name: "Plan Simon out" })
        .closest(".player-time-row"),
    ).not.toHaveTextContent("Playing");

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

    fireEvent.click(screen.getByRole("button", { name: "Plan Simon out" }));
    const picker = screen.getByRole("dialog", { name: /#10 Simon - Plan out/ });
    const dylanChoice = within(picker).getByRole("button", { name: /Dylan/ });
    expect(dylanChoice).toHaveTextContent(
      "PrefersDEF · MIDBench0:00PlayedNot played yet",
    );
    expect(
      within(dylanChoice).getByLabelText(
        "Preferred roles: Defense and Midfield",
      ),
    ).toBeInTheDocument();
    fireEvent.click(dylanChoice);
    expect(
      screen.queryByRole("button", {
        name: "Edit planned substitution for Simon out",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole("button", { name: "Add to plan" }),
    );

    const simonRow = screen
      .getByRole("button", {
        name: "Edit planned substitution for Simon out",
      })
      .closest(".player-time-row");
    expect(simonRow).toHaveTextContent("Coming out for Dylan");
    expect(
      simonRow?.querySelector(".bench-queue-status .lucide-arrow-right-left"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit planned substitution for Simon out",
      }),
    );
    const editPicker = screen.getByRole("dialog", {
      name: /#10 Simon - Plan out/,
    });
    expect(editPicker).toHaveTextContent("Next rotationComing out for Dylan");
    const selectedIncoming = within(editPicker).getByRole("button", {
      name: /Dylan/,
    });
    expect(selectedIncoming).toHaveAttribute("aria-pressed", "true");
    expect(
      selectedIncoming.querySelector(".replacement-selected-icon"),
    ).toBeInTheDocument();

    fireEvent.click(within(editPicker).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan Ollie out" }));
    const otherPicker = screen.getByRole("dialog", {
      name: "#23 Ollie - Plan out",
    });
    const alreadyPlannedIncoming = within(otherPicker).getByRole("button", {
      name: /Dylan/,
    });
    expect(alreadyPlannedIncoming).toHaveTextContent("Going in for Simon");
    expect(
      alreadyPlannedIncoming.querySelector(
        ".replacement-player-status.incoming-status .lucide-arrow-right-left",
      ),
    ).toBeInTheDocument();
  });

  it("opens position and availability actions from an on-field row", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Simon" }),
    );
    const actions = screen.getByRole("dialog", { name: "#10 Simon" });
    expect(
      within(actions).getByRole("button", {
        name: "Take Simon out of game",
      }),
    ).toBeInTheDocument();
    expect(
      within(actions).queryByRole("button", { name: "Plan Simon out" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(actions).getByRole("button", { name: "Change positions" }),
    );
    expect(
      screen.getByRole("dialog", { name: "#10 Simon - Change position" }),
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
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 1_000 };
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

  it("shows a persisted period break with rotation and next-period actions", () => {
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
    expect(breakBanner).toHaveTextContent("Quarter 1 ended");
    expect(breakBanner).toHaveTextContent("Ended at 10:00");
    expect(
      within(breakBanner).getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".match-header .match-clock-button"),
    ).toHaveTextContent("Start Q2");
    fireEvent.click(
      document.querySelector(
        ".match-header .match-clock-button",
      ) as HTMLElement,
    );

    expect(screen.queryByLabelText("End of Quarter 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Game clock, running")).toBeInTheDocument();
  });

  it("uses a period-specific Resume label for a persisted final break", () => {
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
      elapsedSeconds: 40 * 60,
      running: false,
      lastStartedAt: null,
    };
    game.period = { current: 4, startedAtSeconds: 30 * 60 };
    game.periodBreak = { completedPeriod: 4, final: true };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const regulationBanner = screen.getByLabelText("Regulation time complete");
    const endGameButton = within(regulationBanner).getByRole("button", {
      name: "End game",
    });
    expect(endGameButton.querySelector(".lucide-flag")).toBeInTheDocument();
    expect(
      document.querySelector(".match-header .match-clock-button"),
    ).toHaveTextContent("Resume");

    fireEvent.click(endGameButton);
    const confirmation = screen.getByRole("alertdialog", {
      name: "End this game?",
    });
    expect(
      within(confirmation)
        .getByRole("button", { name: "End game" })
        .querySelector(".lucide-flag"),
    ).toBeInTheDocument();
  });

  it("keeps running in added time and starts the next period from the actual endpoint", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(6_000));
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
      elapsedSeconds: 9 * 60 + 59,
      running: true,
      lastStartedAt: 1_000,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const addedTimeBanner = screen.getByLabelText("Quarter 1 time reached");
    expect(addedTimeBanner).toHaveTextContent(
      "+0:04 added time · Clock running",
    );
    expect(
      within(addedTimeBanner).getByRole("button", { name: "Plan subs" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Substitution reminder"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record a goal" })).toBeEnabled();
    const gameClock = screen.getByLabelText("Game clock, running");
    expect(gameClock).toHaveTextContent("10:04");
    expect(gameClock.querySelector(".game-clock-icon svg")).toBeInTheDocument();

    const compactHeader = document.querySelector(".compact-match-header");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 140,
    });
    fireEvent.scroll(window);
    expect(
      within(compactHeader as HTMLElement).getByText("Q1"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByText("10:04"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByText("+0:04 added"),
    ).toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement)
        .getByText("+0:04 added")
        .closest(".compact-match-clock"),
    ).toHaveClass("added-time");

    fireEvent.click(
      within(addedTimeBanner).getByRole("button", {
        name: "End Quarter 1",
      }),
    );

    const breakBanner = screen.getByLabelText("End of Quarter 1");
    expect(breakBanner).toHaveTextContent("Ended at 10:04");
    expect(breakBanner).toHaveTextContent("+0:04 added time");
    expect(
      document.querySelector(".match-header .match-clock-button"),
    ).toHaveTextContent("Start Q2");

    fireEvent.click(
      within(breakBanner).getByRole("button", { name: "Start Quarter 2" }),
    );
    expect(screen.getByText("Quarter 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Game clock, running")).toBeInTheDocument();
    expect(screen.getByLabelText("Game clock, running")).toHaveTextContent(
      "10:04",
    );
    fireEvent.click(screen.getByText("Game timeline"));
    const periodMarker = screen.getByText("Quarter 2 started").closest("li");
    expect(periodMarker).toBeInTheDocument();
    expect(
      periodMarker?.querySelector(".timeline-event-icon svg"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quarter 1 ended · +0:04 added time"),
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1_000);
    });
    expect(screen.getByLabelText("Quarter 2 time reached")).toHaveTextContent(
      "+0:00 added time",
    );
    expect(screen.getByLabelText("Game clock, running")).toHaveTextContent(
      "20:04",
    );
  });

  it("keeps final regulation running until the coach ends the game", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(11_000));
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u12;
    const game = createGame(
      team,
      "9-3-1-3-1",
      team.roster.map((player) => player.id),
      60,
      1_000,
    );
    game.period = { current: 2, startedAtSeconds: 30 * 60 };
    game.clock = {
      elapsedSeconds: 59 * 60 + 58,
      running: true,
      lastStartedAt: 1_000,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    const regulationBanner = screen.getByLabelText("Regulation time reached");
    expect(regulationBanner).toHaveTextContent(
      "+0:08 added time · Clock running",
    );
    expect(
      within(regulationBanner).getByRole("button", { name: "End game" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record a goal" })).toBeEnabled();
  });

  it("identifies an interrupted added-time game before it is resumed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(6_000));
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
      elapsedSeconds: 9 * 60 + 59,
      running: true,
      lastStartedAt: 1_000,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Go to team selection" }),
    );

    expect(screen.getByText("Added time +0:04 · 10:04")).toBeInTheDocument();
  });

  it("consolidates ready substitutions into the period-break banner", () => {
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
    expect(breakBanner).toHaveTextContent("2 substitutions ready");
    expect(
      within(breakBanner).getByRole("button", {
        name: "Review substitutions",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Ready substitutions"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(breakBanner).getByRole("button", { name: "Start Quarter 2" }),
    );
    expect(screen.getByLabelText("Ready substitutions")).toBeInTheDocument();
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

    const confirmation = screen.getByRole("alertdialog", {
      name: "Take Simon out of game?",
    });
    expect(
      screen.queryByRole("dialog", { name: "Players are in" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Remove player",
      }),
    );
    const summary = screen.getByRole("dialog", {
      name: "Players are in",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("Simon #10");
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("Noah #7");
    expect(screen.getByText("Simon out of game")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: / - Change position/ }),
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
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", {
          name: "Take Simon out of game?",
        }),
      ).getByRole("button", { name: "Remove player" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Simon to game" }));

    const summary = screen.getByRole("dialog", { name: "Player ready" });
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("POSITION");
    expect(summary).toHaveTextContent("Center Back");
  });

  it("keeps substitution direction styling out of the live toolbar", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      container.querySelector(".mobile-control-dock .swap-transfer"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    expect(
      screen
        .getByRole("dialog", { name: "Plan substitutions" })
        .querySelector(".swap-row .swap-transfer svg"),
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

    const dialog = screen.getByRole("dialog", { name: "Install Sideline" });
    expect(dialog).toHaveTextContent(
      "Open your browser menu and choose Install app or Add to Home screen.",
    );
    expect(
      within(dialog).getAllByText(
        "Open your browser menu and choose Install app or Add to Home screen.",
      ),
    ).toHaveLength(1);
    expect(document.body).toHaveAttribute("data-dialog-scroll-disabled");

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(document.body).not.toHaveAttribute("data-dialog-scroll-disabled");
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
