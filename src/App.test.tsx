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
import { COACH_ID_STORAGE_KEY } from "./coaches";
import {
  applySubstitutions,
  assignStartingPlayersByPreference,
  compareSubstitutionDestinations,
  createGame,
  fastForwardGame,
  formatDuration,
  getCurrentFieldSeconds,
  getFormation,
  getGoalkeeperChangeStatus,
  getSubstitutionReminderStatus,
  getSubstitutionTimeBandSize,
  INITIAL_STATE,
  queueSubstitutions,
  recordGoal,
  setClockRunning,
  suggestSubstitutions,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { DEVICE_PREFERENCES_STORAGE_KEY } from "./devicePreferences";
import { STORAGE_KEY } from "./storage";
import { THEME_STORAGE_KEY } from "./theme";
import type { AppState } from "./types";
import {
  u12ThirdRotation,
  u8RepeatKeeperRotation,
} from "./test/rotationFixtures";

const startGame = () => {
  fireEvent.click(screen.getByRole("button", { name: "Formation" }));
  const oneTwoOne = screen.queryByRole("button", { name: /1-2-1/ });
  if (oneTwoOne) fireEvent.click(oneTwoOne);
  fireEvent.click(screen.getByRole("button", { name: "Starters" }));
  fireEvent.click(screen.getByRole("button", { name: "Start game" }));
};

const openPositionEditor = (playerName: string) => {
  fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
  fireEvent.click(
    screen.getByRole("button", {
      name: `Change positions for ${playerName}`,
    }),
  );
};

const prepareUpcomingRotation = (queued: boolean, alertsEnabled = true) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  const vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    value: vibrate,
    configurable: true,
  });
  localStorage.setItem(
    DEVICE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ substitutionAlerts: alertsEnabled }),
  );
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u8;
  let game = createGame(
    team,
    "5-1-2-1",
    team.roster.map((player) => player.id),
    team.defaultDurationMinutes,
    Date.now(),
    2,
  );
  game.clock.elapsedSeconds =
    getSubstitutionReminderStatus(game).intervalSeconds - 1;
  if (queued) {
    game = queueSubstitutions(game, suggestSubstitutions(game, 1, team));
  }
  game = setClockRunning(game, true, Date.now());
  state.activeGame = game;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return { game, vibrate };
};

const prepareU12KeeperHandoff = () => {
  const state = structuredClone(INITIAL_STATE);
  const team = state.teams.u12;
  team.roster = team.roster.slice(0, 12);
  team.roster.forEach((player) => {
    player.preferredRoles = ["midfielder", "defender", "forward"];
  });
  team.roster[0].preferredRoles = ["goalkeeper"];
  team.roster[1].preferredRoles = ["defender", "goalkeeper"];
  let game = createGame(
    team,
    "9-3-1-3-1",
    team.roster.map((player) => player.id),
    60,
    Date.now(),
    2,
  );
  game = fastForwardGame(game, 900, Date.now());
  game = applySubstitutions(
    game,
    suggestSubstitutions(game, 1, team),
    team.sideSize,
    Date.now(),
  );
  state.activeGame = game;
  return { state, game, team };
};

describe("Sideline app", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "wakeLock");
    Reflect.deleteProperty(navigator, "vibrate");
  });

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(COACH_ID_STORAGE_KEY, "brian");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
  });

  it("starts fresh devices on local coach selection", () => {
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Who’s coaching?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose your name to see your teams. No password required on this device.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Continue as Brian\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Continue as Chris\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Continue as Scott\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Continue as Lindsey\./ }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: /^Continue as Brian\./ })
        .querySelectorAll(".team-crest.mini"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Install Sideline/i }),
    ).toBeInTheDocument();
  });

  it("shows both assigned teams after continuing as Brian", () => {
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /^Continue as Brian\./ }),
    );

    expect(
      screen.getByRole("heading", { name: "Which team is playing?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Golden Dragons")).toBeInTheDocument();
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Install Sideline/i }),
    ).not.toBeInTheDocument();
  });

  it("marks the exact coach assignment with the active game", () => {
    const state = structuredClone(INITIAL_STATE);
    state.activeGame = createGame(
      state.teams.u8,
      state.teams.u8.defaultFormationId,
      state.teams.u8.roster.map((player) => player.id),
      state.teams.u8.defaultDurationMinutes,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(COACH_ID_STORAGE_KEY);

    render(<App />);

    const brian = screen.getByRole("button", {
      name: /Continue as Brian.*Golden Dragons, Head coach, live game in progress/,
    });
    const assignments = brian.querySelectorAll(".coach-assignment");
    expect(assignments[0]).toHaveTextContent(
      "Golden Dragons · Head coach · Live game",
    );
    expect(assignments[1]).not.toHaveTextContent("Live game");
    const chris = screen.getByRole("button", {
      name: /Chris unavailable.*Golden Dragons game in progress/,
    });
    expect(chris).toHaveAttribute("aria-disabled", "true");
    expect(chris).toHaveTextContent("Golden Dragons game active");
    expect(chris).not.toHaveTextContent("Live game");
    expect(
      screen.getByRole("button", {
        name: /Scott unavailable.*Golden Dragons game in progress/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", {
        name: /Continue as Lindsey.*Golden Dragons, Assistant coach, live game in progress/,
      }),
    ).toHaveTextContent("Golden Dragons · Assistant coach · Live game");
    fireEvent.click(chris);
    expect(
      screen.getByRole("heading", { name: "Who’s coaching?" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(COACH_ID_STORAGE_KEY)).toBeNull();

    fireEvent.click(brian);
    expect(
      screen.getByRole("heading", { name: "On the field" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Which team is playing?" }),
    ).not.toBeInTheDocument();
  });

  it("ends an active game from coach selection after confirmation", () => {
    const state = structuredClone(INITIAL_STATE);
    state.activeGame = createGame(
      state.teams.u8,
      state.teams.u8.defaultFormationId,
      state.teams.u8.roster.map((player) => player.id),
      state.teams.u8.defaultDurationMinutes,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(COACH_ID_STORAGE_KEY);

    render(<App />);

    expect(
      screen.getByRole("region", {
        name: "Golden Dragons game in progress",
      }),
    ).toHaveTextContent(
      "Choose a coach assigned to Golden Dragons to resume the game, or end it here.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "End Golden Dragons game" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "End Golden Dragons game?",
    });
    expect(confirmation).toHaveTextContent(
      "This will stop the clock, cancel any ready substitutions, and end the Golden Dragons game. You’ll see the game summary next.",
    );
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "End game" }),
    );

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").activeGame,
    ).toBeNull();
    expect(
      screen.getByRole("main", { name: "Game summary" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to coaches" }));
    expect(
      screen.getByRole("heading", { name: "Who’s coaching?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Live game")).not.toBeInTheDocument();
  });

  it("takes single-team coaches directly to their assigned team", () => {
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /^Continue as Chris\./ }),
    );

    const setupHeading = screen
      .getByRole("heading", { name: "Prepare game" })
      .closest("section");
    expect(setupHeading).toBeInTheDocument();
    expect(
      setupHeading?.querySelector(
        ".setup-team-lockup .team-crest.fireballers.mini",
      ),
    ).toBeInTheDocument();
    expect(setupHeading).toHaveTextContent("FireballersU12 · 9v9");
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
    expect(screen.queryByText("Golden Dragons")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Change team/ }),
    ).not.toBeInTheDocument();
  });

  it("ends definitively before returning a single-team coach to setup", () => {
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Continue as Chris\./ }),
    );
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    expect(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByText(
        "The clock will stop and you’ll see the game summary before preparing for the next Fireballers game.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").activeGame,
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prep for next game" }));
    expect(
      screen.getByRole("heading", { name: "Prepare game" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
  });

  it("does not offer an ended game for resume after exiting its summary", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );
    expect(
      screen.getByRole("main", { name: "Game summary" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Change coaches. Current coach: Brian",
      }),
    );
    expect(
      screen.queryByText("Game in progress", { exact: false }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /^Continue as Brian\./ }),
    );

    expect(
      screen.getByRole("heading", { name: "Which team is playing?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Game in progress", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("persists the coach locally and signs out cleanly", () => {
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    localStorage.setItem("sideline-state-v1", JSON.stringify(INITIAL_STATE));
    const firstRender = render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Continue as Scott\./ }),
    );

    expect(localStorage.getItem(COACH_ID_STORAGE_KEY)).toBe("scott");
    expect(screen.getByText("Fireballers")).toBeInTheDocument();
    firstRender.unmount();

    render(<App />);
    expect(
      screen.queryByRole("heading", { name: "Who’s coaching?" }),
    ).not.toBeInTheDocument();
    const coachSwitcher = screen.getByRole("button", {
      name: "Change coaches. Current coach: Scott",
    });
    expect(coachSwitcher).toHaveTextContent("Scott");
    expect(
      coachSwitcher.querySelector(".lucide-users-round"),
    ).toBeInTheDocument();
    expect(
      coachSwitcher.querySelector(".lucide-move-horizontal"),
    ).toBeInTheDocument();
    fireEvent.click(coachSwitcher);

    expect(
      screen.getByRole("heading", { name: "Who’s coaching?" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(COACH_ID_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("sideline-state-v1")).not.toBeNull();
  });

  it("protects an active game from an unassigned coach", () => {
    const state = structuredClone(INITIAL_STATE);
    state.activeGame = createGame(
      state.teams.u8,
      state.teams.u8.defaultFormationId,
      state.teams.u8.roster.map((player) => player.id),
      state.teams.u8.defaultDurationMinutes,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(COACH_ID_STORAGE_KEY, "chris");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Your team" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Golden Dragons has a game in progress on this device. Sign in as one of its coaches to resume it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fireballers/ })).toBeDisabled();
    expect(screen.getByText("Golden Dragons active")).toBeInTheDocument();
    expect(screen.queryByText(/Game in progress ·/)).not.toBeInTheDocument();
  });

  it("signs out without losing an active game", () => {
    const state = structuredClone(INITIAL_STATE);
    state.activeGame = createGame(
      state.teams.u8,
      state.teams.u8.defaultFormationId,
      state.teams.u8.roster.map((player) => player.id),
      state.teams.u8.defaultDurationMinutes,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change coaches. Current coach: Brian",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Who’s coaching?" }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").activeGame.teamId,
    ).toBe("u8");
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

  it("opens U8 setup with 2-2 selected as the first formation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));

    const formationButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".formation-picker button"),
    );
    expect(formationButtons[0]).toHaveTextContent("2-2");
    expect(formationButtons[0]).toHaveClass("active");
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
    expect(
      screen
        .getByText("Keep screen awake")
        .closest(".settings-option")
        ?.querySelector(".lucide-sun-medium"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("Substitution alerts")
        .closest(".settings-option")
        ?.querySelector(".lucide-bell-ring"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText("Demo mode")
        .closest(".settings-option")
        ?.querySelector(".tardis-icon"),
    ).toBeInTheDocument();
    expect(wakeLockSwitch).toHaveAttribute("aria-pressed", "false");
    expect(alertSwitch).toHaveAttribute("aria-pressed", "false");
    const awakeDescription =
      /^\s*Prevents auto-lock while Sideline is visible during an active game\.$/;
    const alertsDescription = /^\s*Remind me when to consider substitutions\.$/;
    expect(wakeLockSwitch).toHaveAccessibleDescription(awakeDescription);
    expect(alertSwitch).toHaveAccessibleDescription(alertsDescription);

    fireEvent.click(wakeLockSwitch);
    fireEvent.click(alertSwitch);
    expect(wakeLockSwitch).toHaveAccessibleDescription(awakeDescription);
    expect(alertSwitch).toHaveAccessibleDescription(alertsDescription);

    expect(
      JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toEqual({
      keepScreenAwake: true,
      substitutionAlerts: true,
      demoClock: false,
    });
    expect(wakeLockRequest).not.toHaveBeenCalled();
    expect(
      document
        .querySelector(".settings-menu")
        ?.getAttribute("data-position-regular"),
    ).not.toBe("bottom");
  });

  it("previews alerts only when toggled on, not off or restored", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const toggle = screen.getByRole("button", { name: "Substitution alerts" });
    expect(vibrate).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith([160, 80, 160]);
    fireEvent.click(toggle);
    expect(vibrate).toHaveBeenCalledOnce();
    fireEvent.click(toggle);
    expect(vibrate).toHaveBeenCalledTimes(2);
    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("button", { name: "Substitution alerts" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "does not duplicate an alert preview or suppress a future deadline (already due=%s)",
    (alreadyDue) => {
      const { game, vibrate } = prepareUpcomingRotation(false, false);
      if (alreadyDue) {
        game.clock.elapsedSeconds =
          getSubstitutionReminderStatus(game).intervalSeconds;
        const state = structuredClone(INITIAL_STATE);
        state.activeGame = game;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Substitution alerts" }),
      );
      expect(vibrate).toHaveBeenCalledOnce();
      act(() => vi.advanceTimersByTime(1_000));
      expect(vibrate).toHaveBeenCalledTimes(alreadyDue ? 1 : 2);
      act(() => vi.advanceTimersByTime(2_000));
      expect(vibrate).toHaveBeenCalledTimes(alreadyDue ? 1 : 2);
    },
  );

  it("persists demo mode and gates the expanded-header clock control", async () => {
    const state = structuredClone(INITIAL_STATE);
    state.activeGame = setClockRunning(
      createGame(
        state.teams.u8,
        state.teams.u8.defaultFormationId,
        state.teams.u8.roster.map((player) => player.id),
        state.teams.u8.defaultDurationMinutes,
        1_000,
      ),
      true,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    expect(
      screen.queryByRole("button", { name: "Fast-forward game clock" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute(
      "data-component",
      "Button",
    );
    expect(screen.getByRole("button", { name: "End game" })).toHaveAttribute(
      "data-component",
      "Button",
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const demoModeSwitch = await screen.findByRole("button", {
      name: "Demo mode",
    });
    expect(demoModeSwitch).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(demoModeSwitch);

    expect(
      JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toEqual({
      keepScreenAwake: false,
      substitutionAlerts: false,
      demoClock: true,
    });
    expect(
      screen.getByRole("button", { name: "Fast-forward game clock" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute(
      "data-component",
      "Button",
    );
    expect(screen.getByRole("button", { name: "End game" })).toHaveAttribute(
      "data-component",
      "Button",
    );
    expect(screen.getByRole("button", { name: "Pause" })).toHaveTextContent(
      "Pause",
    );
    expect(screen.getByRole("button", { name: "End game" })).toHaveTextContent(
      "End game",
    );
  });

  it("keeps demo clock controls labeled above the mobile breakpoint", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      Date.now(),
    );
    state.activeGame.clock.elapsedSeconds = 120;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: false,
        substitutionAlerts: false,
        demoClock: true,
      }),
    );
    window.innerWidth = 390;
    render(<App />);
    for (const width of [390, 760, 761, 1024]) {
      window.innerWidth = width;
      fireEvent.resize(window);
      const kind = width <= 760 ? "IconButton" : "Button";
      const clock = screen.getByRole("button", { name: "Resume" });
      const end = screen.getByRole("button", { name: "End game" });
      expect(clock).toHaveAttribute("data-component", kind);
      expect(end).toHaveAttribute("data-component", kind);
      if (width > 760) {
        expect(clock).toHaveTextContent("Resume");
        expect(end).toHaveTextContent("End game");
      } else {
        expect(clock).toHaveTextContent(/^$/);
        expect(end).toHaveTextContent(/^$/);
      }
      expect(
        screen.getByRole("button", { name: "Fast-forward game clock" }),
      ).toHaveAttribute("data-component", "IconButton");
    }
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByRole("button", { name: "Pause" })).toHaveTextContent(
      "Pause",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toHaveTextContent(
      "Resume",
    );
  });

  it("jumps by demo minute offsets and continues normal timing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Demo mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Golden Dragons/ }));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Fast-forward game clock" }),
    );
    expect(
      screen.getByRole("heading", { name: "Fast-forward" }),
    ).toBeInTheDocument();
    let minuteInput = screen.getByRole("spinbutton", {
      name: "Jump forward by minutes",
    });
    fireEvent.change(minuteInput, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Jump to 6:00" }));

    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(saved.activeGame?.clock.elapsedSeconds).toBe(6 * 60);
    expect(saved.activeGame?.clock.running).toBe(false);
    expect(saved.activeGame?.clock.lastStartedAt).toBeNull();
    Object.values(saved.activeGame!.assignments).forEach((playerId) => {
      expect(saved.activeGame!.totals[playerId].fieldSeconds).toBe(6 * 60);
    });
    saved.activeGame!.benchIds.forEach((playerId) => {
      expect(saved.activeGame!.totals[playerId].benchSeconds).toBe(6 * 60);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Fast-forward game clock" }),
    );
    expect(screen.getByText(/Current match time:/)).toHaveTextContent(
      "Current match time: 6:00",
    );
    minuteInput = screen.getByRole("spinbutton", {
      name: "Jump forward by minutes",
    });
    fireEvent.change(minuteInput, { target: { value: "9" } });
    expect(
      screen.getByRole("button", { name: "Jump to 15:00" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jump to 15:00" }));

    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(saved.activeGame?.clock.elapsedSeconds).toBe(15 * 60);
    expect(saved.activeGame?.clock.running).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    act(() => vi.advanceTimersByTime(5_000));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(saved.activeGame?.clock.elapsedSeconds).toBe(15 * 60 + 5);
  });

  it("uses the live match clock for fast-forward current and target times after added time", () => {
    const { state, game } = u12ThirdRotation();
    state.activeGame = fastForwardGame(
      game,
      4_313 - game.clock.elapsedSeconds,
      1_000,
    );
    state.activeGame.periodEnds = [{ period: 1, atSeconds: 2_581 }];
    const before = structuredClone(state.activeGame);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ demoClock: true }),
    );
    render(<App />);
    expect(screen.getAllByText("58:52").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Fast-forward game clock" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Fast-forward" });
    expect(within(dialog).getByText(/Current match time:/)).toHaveTextContent(
      "Current match time: 58:52",
    );
    expect(within(dialog).queryByText("71:53")).not.toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole("spinbutton", {
        name: "Jump forward by minutes",
      }),
      {
        target: { value: "5" },
      },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Jump to 63:52" }),
    );
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(saved.activeGame?.clock.elapsedSeconds).toBe(4_613);
    expect(saved.activeGame?.clock.running).toBe(false);
    expect(saved.activeGame?.period).toEqual(before.period);
    expect(saved.activeGame?.history).toEqual(before.history);
    Object.values(before.assignments).forEach((id) => {
      expect(saved.activeGame?.totals[id].fieldSeconds).toBe(
        before.totals[id].fieldSeconds + 300,
      );
    });
    before.benchIds.forEach((id) => {
      expect(saved.activeGame?.totals[id].benchSeconds).toBe(
        before.totals[id].benchSeconds + 300,
      );
    });
    expect(screen.getAllByText("63:52").length).toBeGreaterThan(0);
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
    const toggle = screen.getByRole("button", { name: "Keep screen awake" });
    const description =
      /^\s*Prevents auto-lock while Sideline is visible during an active game\.$/;
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAccessibleDescription(description);
    fireEvent.click(toggle);
    await waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAccessibleDescription(description);
    fireEvent.click(toggle);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAccessibleDescription(description);
  });

  it("reports a wake-lock failure separately from the static setting description", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: vi.fn().mockRejectedValue(new Error("Wake lock denied")),
      },
      configurable: true,
    });
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      team.defaultFormationId,
      team.roster.map((player) => player.id),
      team.defaultDurationMinutes,
      Date.now(),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(
      DEVICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        keepScreenAwake: true,
        substitutionAlerts: false,
        demoClock: false,
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      await screen.findByText(
        "Enabled, but the device could not keep the screen awake.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      document.getElementById("keep-screen-awake-description")?.textContent,
    ).toBe(
      "Prevents auto-lock while Sideline is visible during an active game.",
    );
    expect(
      screen.getByRole("button", { name: "Keep screen awake" }),
    ).toHaveAccessibleDescription(
      /Prevents auto-lock.*Enabled, but the device could not keep the screen awake\./,
    );
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
      2,
    );
    state.activeGame.clock.elapsedSeconds = getSubstitutionReminderStatus(
      state.activeGame,
    ).intervalSeconds;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    await waitFor(() => expect(vibrate).toHaveBeenCalledWith([160, 80, 160]));
    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["u8", 4, false],
    ["u8", 4, true],
    ["u8", 2, false],
    ["u8", 2, true],
    ["u12", 2, false],
    ["u12", 2, true],
  ] as const)(
    "quiets %s/%i-period prompts with 41 seconds remaining and a reminder due in 20 seconds (queued=%s)",
    (teamId, periodCount, queued) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-18T18:00:00Z"));
      const vibrate = vi.fn();
      Object.defineProperty(navigator, "vibrate", {
        value: vibrate,
        configurable: true,
      });
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const currentPeriod = periodCount === 4 ? 2 : 1;
      const periodLabel = periodCount === 4 ? "Quarter" : "Half";
      const periodLength = (team.defaultDurationMinutes * 60) / periodCount;
      const periodEnd = currentPeriod * periodLength;
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((p) => p.id),
        team.defaultDurationMinutes,
        Date.now(),
        periodCount,
      );
      const interval = getSubstitutionReminderStatus(game).intervalSeconds;
      game = fastForwardGame(game, periodEnd - 21 - interval, Date.now());
      game.period = {
        current: currentPeriod,
        startedAtSeconds: periodEnd - periodLength,
      };
      game = applySubstitutions(
        game,
        suggestSubstitutions(game, 1, team),
        team.sideSize,
        Date.now(),
      );
      game = fastForwardGame(game, interval - 20, Date.now());
      if (queued) {
        game = queueSubstitutions(
          game,
          suggestSubstitutions(game, 5, team, { allowEarlyKeeperChange: true }),
        );
        expect(game.queuedSubstitutions).toHaveLength(5);
      }
      state.activeGame = setClockRunning(game, true, Date.now());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ substitutionAlerts: true }),
      );
      render(<App />);
      expect(screen.getByLabelText("Next reminder")).toHaveTextContent(
        "At the break",
      );
      expect(
        screen.queryByLabelText("Ready substitutions"),
      ).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(20_000));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Substitution reminder"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Ready substitutions"),
      ).not.toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame!.assignments).toEqual(game.assignments);
      expect(saved.activeGame!.history).toEqual(game.history);
      expect(saved.activeGame!.queuedSubstitutions).toEqual(
        game.queuedSubstitutions,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: queued ? "Review substitutions" : "Create plan",
        }),
      );
      expect(
        screen.getByRole("dialog", {
          name: queued ? "Substitution plan (5)" : "Substitution plan",
        }),
      ).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Close",
        }),
      );
      act(() => vi.advanceTimersByTime(51_000));
      expect(
        screen.getByLabelText(`${periodLabel} ${currentPeriod} time reached`),
      ).toHaveTextContent("+0:30 added time");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", {
          name: `End ${periodLabel} ${currentPeriod}`,
        }),
      );
      if (queued) {
        expect(
          screen.getByLabelText(`End of ${periodLabel} ${currentPeriod}`),
        ).toHaveTextContent("5 substitutions ready");
        fireEvent.click(
          within(
            screen.getByLabelText(`End of ${periodLabel} ${currentPeriod}`),
          ).getByRole("button", {
            name: "Review substitutions",
          }),
        );
        fireEvent.click(
          within(
            screen.getByRole("dialog", {
              name: "Substitution plan (5)",
            }),
          ).getByRole("button", { name: "Send players in" }),
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      }
      fireEvent.click(
        screen.getAllByRole("button", {
          name: `Start ${periodCount === 4 ? "Q" : "H"}${currentPeriod + 1}`,
        })[0],
      );
      expect(screen.getByLabelText("Next reminder")).toHaveTextContent(
        queued ? `Due in ${formatDuration(interval)}` : "Due now",
      );
      const restarted = JSON.parse(
        localStorage.getItem(STORAGE_KEY)!,
      ) as AppState;
      expect(restarted.activeGame!.period).toEqual({
        current: currentPeriod + 1,
        startedAtSeconds: periodEnd + 30,
      });
      expect(restarted.activeGame!.history).toHaveLength(
        game.history.length + (queued ? 1 : 0),
      );
      expect(validateGame(restarted.activeGame!, team.sideSize)).toEqual([]);
    },
  );

  it.each([false, true])(
    "suppresses final-minute automatic prompts but keeps manual and saved plans available (%s)",
    (queued) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-16T17:00:00Z"));
      const vibrate = vi.fn();
      Object.defineProperty(navigator, "vibrate", {
        value: vibrate,
        configurable: true,
      });
      const fixture = u12ThirdRotation();
      const { state, team } = fixture;
      const endAt = fixture.game.period.startedAtSeconds + 1_800;
      let game = fastForwardGame(
        fixture.game,
        endAt - 960 - fixture.game.clock.elapsedSeconds,
        Date.now(),
      );
      game = applySubstitutions(
        game,
        suggestSubstitutions(game, 1, team),
        9,
        Date.now(),
      );
      game = fastForwardGame(game, 899, Date.now());
      if (queued)
        game = queueSubstitutions(game, suggestSubstitutions(game, 1, team));
      state.activeGame = setClockRunning(game, true, Date.now());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ substitutionAlerts: true }),
      );
      render(<App />);
      expect(screen.getByLabelText("Next reminder")).toHaveTextContent(
        "No more scheduled",
      );
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("status", { name: "Substitution reminder" }),
      ).not.toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();
      if (queued) {
        expect(
          screen.queryByLabelText("Ready substitutions"),
        ).not.toBeInTheDocument();
        fireEvent.click(
          screen.getByRole("button", { name: "Review substitutions" }),
        );
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
        const planner = screen.getByRole("dialog", {
          name: "Substitution plan",
        });
        expect(
          within(planner).getByRole("button", { name: "Choose a swap count" }),
        ).toBeDisabled();
        expect(planner.querySelector(".error-message")).toBeNull();
        fireEvent.click(within(planner).getByRole("button", { name: "1" }));
        fireEvent.click(
          within(planner).getByRole("button", { name: "Ready 1 swap" }),
        );
      }
      const review = screen.getByRole("dialog", {
        name: "Substitution plan (1)",
      });
      fireEvent.click(
        within(review).getByRole("button", { name: "Send players in" }),
      );
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame?.history).toHaveLength(game.history.length + 1);
      expect(validateGame(saved.activeGame!, 9)).toEqual([]);
    },
  );

  it.each([
    { queued: false, alertsEnabled: true },
    { queued: true, alertsEnabled: true },
    { queued: false, alertsEnabled: false },
    { queued: true, alertsEnabled: false },
  ])(
    "opens the due plan once (queued=$queued, sound=$alertsEnabled)",
    ({ queued, alertsEnabled }) => {
      const { game, vibrate } = prepareUpcomingRotation(queued, alertsEnabled);
      render(<App />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(vibrate).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(1_000));

      const review = screen.getByRole("dialog", {
        name: queued ? /^Substitution plan \([0-9]+\)$/ : "Substitution plan",
      });
      expect(vibrate).toHaveBeenCalledTimes(alertsEnabled ? 1 : 0);
      const persisted = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "{}",
      ).activeGame;
      expect(persisted.assignments).toEqual(game.assignments);
      expect(persisted.benchIds).toEqual(game.benchIds);
      expect(persisted.clock.running).toBe(true);
      expect(persisted.history).toEqual(game.history);

      fireEvent.click(
        within(review).getByRole("button", {
          name: "Close",
        }),
      );
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(vibrate).toHaveBeenCalledTimes(alertsEnabled ? 1 : 0);
    },
  );

  it.each(["settings", "goal", "pointer"] as const)(
    "still alerts for a queued plan without interrupting %s",
    (interaction) => {
      const { vibrate } = prepareUpcomingRotation(true);
      render(<App />);
      if (interaction === "settings") {
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      } else if (interaction === "goal") {
        fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
      } else {
        fireEvent.pointerDown(document, { pointerId: 1 });
      }

      act(() => vi.advanceTimersByTime(1_000));

      expect(vibrate).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("dialog", {
          name: /^Substitution plan \([0-9]+\)$/,
        }),
      ).not.toBeInTheDocument();
      if (interaction === "settings") {
        expect(screen.getByText("Game-day settings")).toBeInTheDocument();
        fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
        fireEvent.keyUp(document, { key: "Escape", code: "Escape" });
      } else if (interaction === "goal") {
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Close",
          }),
        );
      } else {
        fireEvent.pointerUp(document, { pointerId: 1 });
      }
      act(() => vi.advanceTimersByTime(2_000));
      expect(
        screen.queryByRole("dialog", {
          name: /^Substitution plan \([0-9]+\)$/,
        }),
      ).not.toBeInTheDocument();
      expect(vibrate).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])(
    "preserves the reminder cycle through an injury replacement (already due=%s)",
    (alreadyDue) => {
      const { vibrate } = prepareUpcomingRotation(false);
      render(<App />);
      if (alreadyDue) {
        act(() => vi.advanceTimersByTime(1_000));
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Close",
          }),
        );
        expect(vibrate).toHaveBeenCalledOnce();
      }
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      const initialReminder = getSubstitutionReminderStatus(saved.activeGame!);
      const outgoingId = Object.values(saved.activeGame!.assignments)[0];
      const name = saved.teams.u8.roster.find(
        (player) => player.id === outgoingId,
      )!.name;
      fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      fireEvent.click(
        screen.getByRole("button", { name: `Take ${name} out of game` }),
      );
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Remove player",
        }),
      );
      fireEvent.click(
        within(
          screen.getByRole("dialog", { name: "Players are in" }),
        ).getByRole("button", { name: "Close" }),
      );
      const updated = JSON.parse(
        localStorage.getItem(STORAGE_KEY)!,
      ) as AppState;
      expect(updated.activeGame!.history.at(-1)?.pairs).toHaveLength(1);
      expect(getSubstitutionReminderStatus(updated.activeGame!).cycleKey).toBe(
        initialReminder.cycleKey,
      );
      expect(vibrate).toHaveBeenCalledTimes(alreadyDue ? 1 : 0);
      act(() => vi.advanceTimersByTime(1_000));
      expect(vibrate).toHaveBeenCalledOnce();
      expect(screen.getByLabelText("Substitution reminder")).toHaveTextContent(
        "Reminder timer:",
      );
      if (alreadyDue) {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByRole("dialog", { name: "Substitution plan" }),
        ).toBeInTheDocument();
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Close",
          }),
        );
      }
      act(() => vi.advanceTimersByTime(2_000));
      expect(vibrate).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("restarts the interval after an early confirmed rotation and opens at the new deadline", () => {
    const { vibrate, game } = prepareUpcomingRotation(true);
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    const review = screen.getByRole("dialog", {
      name: /^Substitution plan \([0-9]+\)$/,
    });
    fireEvent.click(
      within(review).getByRole("button", { name: "Send players in" }),
    );
    const confirmation = screen.queryByRole("dialog");
    if (confirmation) {
      fireEvent.click(
        within(confirmation).getByRole("button", { name: "Close" }),
      );
    }
    act(() =>
      vi.advanceTimersByTime(
        (getSubstitutionReminderStatus(game).intervalSeconds - 1) * 1_000,
      ),
    );
    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(vibrate).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("dialog", { name: "Substitution plan" }),
    ).toBeInTheDocument();
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
        2,
      ),
      true,
      Date.now(),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    vi.setSystemTime(new Date("2026-09-14T12:10:01Z"));
    act(() => window.dispatchEvent(new Event("pageshow")));

    const recovered = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ).activeGame;
    expect(recovered.clock.elapsedSeconds).toBe(601);
    expect(recovered.clock.lastStartedAt).toBe(Date.now());
    expect(screen.getByLabelText("Substitution reminder")).toBeInTheDocument();
  });

  it("resumes the active-game timer directly for a multi-team coach", () => {
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
    expect(
      screen.queryByRole("heading", { name: "Which team is playing?" }),
    ).not.toBeInTheDocument();
    const gameClock = screen.getByLabelText("Game clock, running");
    expect(gameClock).toHaveTextContent("0:00");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(gameClock).toHaveTextContent("0:02");
  });

  it("keeps the roster fixed while allowing attendance selection", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    expect(
      screen.queryByRole("button", { name: /edit roster/i }),
    ).not.toBeInTheDocument();
    const simon = screen.getByRole("button", { name: /Simon Present/i });
    expect(simon.querySelector(".player-identity-number")).toHaveTextContent(
      "#10",
    );
    expect(simon).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(simon);
    const absentSimon = screen.getByRole("button", { name: /Simon Absent/i });
    expect(absentSimon).toBeInTheDocument();
    expect(
      absentSimon.querySelector(".player-identity-number"),
    ).toHaveTextContent("#10");
    expect(absentSimon).toHaveAttribute("aria-pressed", "false");
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
    expect(gameFormat).toHaveValue("halves-25");
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

  it.each([
    {
      teamId: "u8" as const,
      name: "Golden Dragons",
      expected: [
        "Collier",
        "Dylan",
        "Evan",
        "Haru",
        "Henry",
        "Maddox",
        "Malik",
        "Noah",
        "Ollie",
        "Simon",
      ],
    },
    {
      teamId: "u12" as const,
      name: "Fireballers",
      expected: [
        "Aaron",
        "Andrew",
        "Eli",
        "Elliott",
        "Jack",
        "Jackson",
        "John",
        "Kai",
        "Lazar",
        "Matt",
        "Nikola",
        "Obasi",
        "Rayek",
        "Ryan",
        "William",
      ],
    },
  ])(
    "sorts $name attendance A–Z without changing roster order",
    ({ teamId, name, expected }) => {
      render(<App />);
      fireEvent.click(screen.getByText(name));
      const names = () =>
        Array.from(
          document.querySelectorAll(".attendance-grid .player-identity-name"),
          (element) => element.textContent,
        );
      expect(names()).toEqual(expected);
      fireEvent.click(
        screen.getByRole("button", {
          name: `${expected[0]} Present`,
        }),
      );
      expect(names()).toEqual(expected);
      fireEvent.click(screen.getByRole("button", { name: "Formation" }));
      fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
      expect(names()).toEqual(expected);
      expect(
        screen.getByRole("button", {
          name: `${expected[0]} Absent`,
        }),
      ).toBeInTheDocument();
      startGame();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      expect(stored.teams[teamId].roster).toEqual(
        INITIAL_STATE.teams[teamId].roster,
      );
    },
  );

  it("sorts guest attendance by name and jersey number within its section", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    for (const [name, number] of [
      ["Zoe", "1"],
      ["Amy", "10"],
      ["Amy", "2"],
      ["Amy", ""],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: "Add guest player" }));
      const dialog = screen.getByRole("dialog", { name: "Add guest player" });
      fireEvent.change(within(dialog).getByLabelText("Player name"), {
        target: { value: name },
      });
      fireEvent.change(within(dialog).getByLabelText(/Jersey number/), {
        target: { value: number },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Add guest" }),
      );
    }
    expect(
      Array.from(
        document.querySelectorAll(
          ".guest-attendance-list .attendance-player-heading",
        ),
        (element) => element.textContent,
      ),
    ).toEqual(["Amy #2", "Amy #10", "Amy", "Zoe #1"]);
    expect(
      document.querySelectorAll(".attendance-grid .attendance-button"),
    ).toHaveLength(INITIAL_STATE.teams.u8.roster.length);
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

    ["Simon", "Noah", "Maddox", "Ollie", "Malik", "Collier"].forEach((name) => {
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

  it("includes Collier with his provisional number in U8 attendance", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    const attendance = screen.getByRole("button", {
      name: "Collier Present",
    });
    expect(
      attendance.querySelector(".player-identity-number"),
    ).toHaveTextContent("#56");
    startGame();
    expect(screen.getByRole("tab", { name: "Bench 5" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Plan Collier in" }),
    ).toBeInTheDocument();
    const game = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ).activeGame;
    expect(game.presentIds).toContain("u8-p10");
    expect(game.benchIds).toContain("u8-p10");
    expect(Object.values(game.assignments)).toHaveLength(5);
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
    expect(guestRow.querySelector(".player-identity-number")).toHaveTextContent(
      "#31",
    );
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
    ["Simon", "Noah", "Maddox", "Ollie", "Malik", "Collier"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name: `${name} Present` }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: /1-2-1/ }));
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
      screen.getByRole("button", { name: "Plan substitution for Late Guest" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "On the field" }).parentElement
        ?.parentElement,
    ).toHaveTextContent("5/5");
  });

  it("calls out the no-bench case when exactly enough players attend", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Simon", "Noah", "Maddox", "Ollie", "Collier"].forEach((name) => {
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

    const pitchPlayer = document.querySelector(".pitch-player") as HTMLElement;
    expect(pitchPlayer).toBeEnabled();
    const before = localStorage.getItem(STORAGE_KEY);
    fireEvent.click(pitchPlayer);
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
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("replaces a starter from the bench, undoes it, and starts with the edited lineup", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: /1-2-1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    const undo = screen.getByRole("button", { name: "Undo lineup change" });
    expect(undo).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Place Evan on the starting pitch" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Evan at Goalkeeper, replacing Maddox",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Change Evan at Goalkeeper" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Place Maddox on the starting pitch",
      }),
    ).toBeInTheDocument();
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    ).toBeInTheDocument();
    expect(undo).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    );
    const picker = screen.getByRole("dialog", { name: "Choose Goalkeeper" });
    const evan = within(picker).getByRole("button", { name: /^Evan / });
    expect(evan).toHaveTextContent("Prefers");
    expect(evan).toHaveTextContent("CurrentBench");
    expect(evan).not.toHaveTextContent("→");
    expect(evan).not.toHaveTextContent("Backup goalkeepers on bench:");
    fireEvent.click(evan);
    expect(undo).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    const game = saved.activeGame!;
    const evanId = saved.teams.u8.roster.find((p) => p.name === "Evan")!.id;
    const maddoxId = saved.teams.u8.roster.find((p) => p.name === "Maddox")!.id;
    const gk = getFormation(game.formationId).positions.find(
      (p) => p.role === "goalkeeper",
    )!;
    expect(game.assignments[gk.id]).toBe(evanId);
    expect(game.benchIds).toContain(maddoxId);
    expect(game.history).toEqual([]);
    expect(validateGame(game, 5)).toEqual([]);
  });

  it("orders starter choices by position preference without prioritizing bench status", () => {
    const state = structuredClone(INITIAL_STATE);
    const roster = state.teams.u8.roster;
    roster.forEach((player) => {
      player.preferredRoles = ["forward"];
    });
    roster.find((player) => player.name === "Evan")!.preferredRoles = [
      "goalkeeper",
    ];
    roster.find((player) => player.name === "Maddox")!.preferredRoles = [
      "goalkeeper",
    ];
    roster.find((player) => player.name === "Henry")!.preferredRoles = [
      "defender",
      "goalkeeper",
    ];
    roster.find((player) => player.name === "Noah")!.preferredRoles = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Change .* at Goalkeeper$/ }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Leave open",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Assign player at Goalkeeper" }),
    );
    const picker = screen.getByRole("dialog", { name: "Choose Goalkeeper" });
    const choices = within(picker).getAllByRole("button", {
      name: / Prefers /,
    });
    expect(
      choices.map(
        (button) =>
          button.querySelector(".starter-choice-player strong")?.textContent,
      ),
    ).toEqual([
      "Evan",
      "Maddox",
      "Henry",
      "Noah",
      "Collier",
      "Dylan",
      "Haru",
      "Malik",
      "Ollie",
      "Simon",
    ]);
    expect(choices[0]).toHaveTextContent("CurrentBench");
    expect(choices[2]).not.toHaveTextContent("CurrentBench");
    fireEvent.click(choices[2]);
    expect(
      screen.getByRole("button", { name: "Change Henry at Goalkeeper" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Henry at Goalkeeper" }),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: /^Henry Prefers /,
      }),
    ).not.toBeInTheDocument();
  });

  it("reveals a starter's concerns only in their picker and clears the icon when fixed", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    );
    let picker = screen.getByRole("dialog", { name: "Choose Goalkeeper" });
    expect(
      within(picker).queryByRole("status", {
        name: "Current starter concerns",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: /^Simon / }));
    const simon = screen.getByRole("button", {
      name: "Change Simon at Goalkeeper",
    });
    expect(simon).toHaveAccessibleDescription(/Lineup warning/);
    expect(document.querySelector(".starter-guidance")).toBeNull();
    expect(
      screen.queryByText("Simon prefers forward, midfield, and defense."),
    ).not.toBeInTheDocument();
    fireEvent.click(simon.querySelector(".starter-player-warning")!);
    picker = screen.getByRole("dialog", { name: "Choose Goalkeeper" });
    const notes = within(picker).getByRole("status", {
      name: "Current starter concerns",
    });
    expect(notes).toHaveTextContent(
      "Simon prefers forward, midfield, and defense.",
    );
    expect(notes).toHaveAttribute("data-variant", "warning");
    expect(notes).not.toHaveTextContent("Maddox at");
    fireEvent.click(within(picker).getByRole("button", { name: /^Maddox / }));
    expect(
      screen
        .getByRole("button", { name: "Change Maddox at Goalkeeper" })
        .querySelector(".starter-player-warning"),
    ).toBeNull();
  });

  it("allows a keeper option to start outfield without reserve warnings or labels", () => {
    const state = structuredClone(INITIAL_STATE);
    const henry = state.teams.u8.roster.find((p) => p.name === "Henry")!;
    henry.preferredRoles = henry.preferredRoles.filter(
      (role) => role !== "goalkeeper",
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: /1-2-1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    );
    let picker = screen.getByRole("dialog");
    expect(
      within(picker).queryByText("Uses the last goalkeeper on the bench."),
    ).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "Cancel" }));
    const outfield = [
      ...document.querySelectorAll<HTMLButtonElement>(".starter-slot"),
    ].find((button) => button.dataset.positionId !== "gk")!;
    fireEvent.click(outfield);
    picker = screen.getByRole("dialog");
    const evan = within(picker).getByRole("button", { name: /^Evan / });
    expect(evan).not.toHaveAttribute("aria-describedby");
    expect(
      within(picker).queryByText("Uses the last goalkeeper on the bench."),
    ).not.toBeInTheDocument();
    expect(
      within(picker).getByRole("button", { name: /^Dylan / }),
    ).not.toHaveAttribute("aria-describedby");
    expect(picker.querySelector(".starter-choice-list")).not.toHaveTextContent(
      "→",
    );
    fireEvent.click(evan);
    expect(screen.queryByText("GK option")).not.toBeInTheDocument();
    expect(screen.queryByText("No backup goalkeeper")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    );
    picker = screen.getByRole("dialog");
    expect(
      within(picker).queryByText("No backup goalkeeper on the bench.", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(picker.querySelector(".starter-choice-list")).not.toHaveTextContent(
      "No backup goalkeeper",
    );
    expect(picker.querySelector(".starter-choice-list")).not.toHaveTextContent(
      "Uses the last goalkeeper",
    );
    expect(picker.querySelector(".starter-choice-list")).not.toHaveTextContent(
      "→",
    );
  });

  it("does not undo a starter edit across an attendance change", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      screen.getByRole("button", { name: "Undo lineup change" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    fireEvent.click(screen.getByRole("button", { name: "Evan Present" }));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    expect(
      screen.getByRole("button", { name: "Undo lineup change" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: "Place Evan on the starting pitch",
      }),
    ).not.toBeInTheDocument();
  });

  it.each([0, 300, 601])(
    "shows keeper preparation guidance only when rest is at risk at %s seconds",
    (elapsedSeconds) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      team.roster = team.roster.slice(0, 7);
      team.roster.forEach((player) => {
        player.preferredRoles = ["defender", "midfielder", "forward"];
      });
      team.roster[0].preferredRoles = ["goalkeeper"];
      team.roster[1].preferredRoles = ["defender", "goalkeeper"];
      const game = createGame(
        team,
        "5-2-2",
        team.roster.map((p) => p.id),
        40,
        1_000,
        4,
      );
      game.clock.elapsedSeconds = elapsedSeconds;
      const current = Math.floor(elapsedSeconds / 600) + 1;
      game.period = { current, startedAtSeconds: (current - 1) * 600 };
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const notice = screen.queryByRole("status", {
        name: "Goalkeeper preparation",
      });
      if (elapsedSeconds > 600) {
        expect(notice).toHaveTextContent(
          "Noah needs a full bench turn before taking over.",
        );
        expect(
          screen.getByRole("status", { name: "Substitution reminder" }),
        ).toContainElement(notice);
        expect(notice?.closest('[data-component="Banner"]')).toBeNull();
        fireEvent.click(
          within(
            screen.getByRole("status", { name: "Substitution reminder" }),
          ).getByRole("button", { name: "Create plan" }),
        );
        const planner = screen.getByRole("dialog", {
          name: "Substitution plan",
        });
        const outgoing = [
          ...planner.querySelectorAll('[data-player-menu-id^="out-"]'),
        ];
        expect(
          outgoing.some((button) => button.textContent?.includes("Noah")),
        ).toBe(true);
        expect(
          outgoing.some((button) => button.textContent?.includes("Simon")),
        ).toBe(false);
      } else {
        expect(notice).not.toBeInTheDocument();
      }
    },
  );

  it("remembers one U8 kickoff across games and keeps manual choices during attendance changes", () => {
    const app = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    const read = () =>
      JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    const firstGame = read().activeGame!;
    const firstIds = Object.values(firstGame.assignments);
    expect(read().teams.u8.lastStartingLineup).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(read().teams.u8.lastStartingLineup?.starterIds).toEqual(firstIds);
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );
    expect(read().activeGame).toBeNull();
    app.unmount();
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    const team = read().teams.u8;
    const formation = getFormation(team.defaultFormationId);
    const ids = team.roster.map((player) => player.id);
    const expected = assignStartingPlayersByPreference(
      formation,
      ids,
      team.roster,
      team.lastStartingLineup,
    );
    for (const position of formation.positions) {
      const name = team.roster.find(
        (player) => player.id === expected[position.id],
      )!.name;
      expect(
        screen.getByRole("button", {
          name: `Change ${name} at ${position.label}`,
        }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto-fill" }));
    const returningNames = team.roster
      .filter((p) => !firstIds.includes(p.id))
      .map((p) => p.name);
    expect(
      returningNames.filter((name) =>
        screen.queryByRole("button", {
          name: new RegExp(`^Change ${name} at `),
        }),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    fireEvent.click(
      screen.getByRole("button", { name: /^Change .* at Goalkeeper$/ }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Choose Goalkeeper" }),
      ).getByRole("button", { name: /^Maddox\b/ }),
    );
    const absentName = document.querySelector(
      '.starter-slot:not([data-position-id="gk"]) > strong',
    )!.textContent!;
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    fireEvent.click(
      screen.getByRole("button", { name: `${absentName} Present` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    expect(
      screen.getByRole("button", { name: "Change Maddox at Goalkeeper" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(read().teams.u8.lastStartingLineup?.starterIds).toEqual(firstIds);
    const secondIds = Object.values(read().activeGame!.assignments);
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(read().teams.u8.lastStartingLineup?.starterIds).toEqual(secondIds);
    expect(read().teams.u12.lastStartingLineup).toBeUndefined();
  });

  it.each([
    ["Matt", "Rayek", "Jack"],
    ["Matt", "Jack", "Rayek"],
    ["Rayek", "Matt", "Jack"],
    ["Rayek", "Jack", "Matt"],
    ["Jack", "Matt", "Rayek"],
    ["Jack", "Rayek", "Matt"],
  ])(
    "keeps U12 starters consistent after marking %s, %s, and %s absent",
    (first, second, third) => {
      render(<App />);
      fireEvent.click(screen.getByText("Fireballers"));
      for (const name of [first, second, third]) {
        fireEvent.click(
          screen.getByRole("button", { name: `${name} Present` }),
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "Formation" }));
      fireEvent.click(screen.getByRole("button", { name: "Starters" }));
      const striker = screen.getByRole("button", {
        name: "Change John at Striker",
      });
      expect(striker.querySelector(".starter-player-warning")).toBeNull();
      expect(
        screen.getByRole("button", {
          name: "Place Aaron on the starting pitch",
        }),
      ).toBeInTheDocument();
      const lineupLabels = () =>
        Array.from(document.querySelectorAll(".starter-slot"), (slot) =>
          slot.getAttribute("aria-label"),
        );
      const initialLineup = lineupLabels();
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      fireEvent.click(screen.getByRole("button", { name: "Auto-fill" }));
      expect(
        screen.getByRole("button", { name: "Change John at Striker" }),
      ).toBeInTheDocument();
      expect(lineupLabels()).toEqual(initialLineup);
    },
  );

  it("assigns starters from the tactics board and swaps occupied positions", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    fireEvent.click(screen.getByRole("button", { name: /1-2-1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));

    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeDisabled();
    expect(
      Array.from(document.querySelectorAll(".starter-bench-list li")).map(
        (playerName) => playerName.textContent,
      ),
    ).toEqual(["Collier", "Dylan", "Evan", "Henry", "Malik"]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Change Noah at Left Midfielder",
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
      "Haru",
      "Collier",
      "Dylan",
      "Henry",
      "Maddox",
      "Malik",
      "Simon",
      "Evan",
      "Ollie",
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
        name: "Change Noah at Right Midfielder",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const goalkeeperSlot = screen.getByRole("button", {
      name: "Assign player at Goalkeeper",
    });
    expect(goalkeeperSlot).toBeInTheDocument();
    expect(goalkeeperSlot).toHaveTextContent("GKOpen");
    expect(goalkeeperSlot).not.toHaveTextContent("Goalkeeper");
    expect(goalkeeperSlot.querySelector(".starter-player-warning")).toBeNull();
    expect(screen.getByRole("button", { name: "Start game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auto-fill" })).toBeEnabled();

    fireEvent.click(goalkeeperSlot);
    expect(
      screen.queryByRole("status", { name: "Current starter concerns" }),
    ).not.toBeInTheDocument();
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

  it("uses the team identity as compact team-selection navigation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));

    const formationButton = screen.getByRole("button", { name: "Formation" });
    expect(formationButton).toHaveAttribute("data-component", "Button");
    expect(formationButton).toHaveAttribute("data-variant", "primary");
    expect(formationButton.querySelector("svg")).toBeInTheDocument();

    const teamSwitcher = screen.getByRole("button", {
      name: "Change team. Current team: Golden Dragons",
    });
    expect(teamSwitcher).toHaveTextContent("Golden Dragons");
    expect(teamSwitcher).toHaveTextContent("U8 · 5v5Change");
    expect(
      teamSwitcher.querySelector(".setup-team-change .lucide-move-horizontal"),
    ).toBeInTheDocument();
    expect(
      teamSwitcher.querySelector(".team-crest.golden-dragons"),
    ).toBeInTheDocument();
    fireEvent.click(teamSwitcher);
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

  it.each([
    { teamName: "Golden Dragons", firstMarker: "Half 1 started" },
    { teamName: "Fireballers", firstMarker: "Half 1 started" },
  ])(
    "hides $teamName timeline until a real event exists",
    ({ teamName, firstMarker }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
      render(<App />);
      fireEvent.click(screen.getByText(teamName));
      startGame();

      expect(screen.queryByText("Out of game")).not.toBeInTheDocument();
      expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Start game" }));
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
      fireEvent.click(screen.getByRole("button", { name: "Opponent scored" }));
      const timeline = screen.getByText("Game timeline").closest("details")!;
      expect(timeline).toHaveClass("follows-roster");
      expect(timeline).not.toHaveAttribute("open");
      expect(timeline).toHaveTextContent("1 events");
      fireEvent.click(screen.getByText("Game timeline"));
      expect(within(timeline).getByText(firstMarker)).toBeVisible();
      expect(within(timeline).getByText("Opponent scored")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
      expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();
    },
  );

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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

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
    expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();
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
      within(gameLog as HTMLElement).getByText("Half 1 ended"),
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
    expect(
      within(screen.getByRole("dialog")).getByText("Center Back"),
    ).toBeInTheDocument();
    expect(screen.getByText("Played")).toBeInTheDocument();
    expect(screen.getByText("Playing now")).toBeInTheDocument();
    const maddoxTarget = screen.getByRole("button", {
      name: "Maddox (Goalkeeper)",
    });
    expect(maddoxTarget).toHaveTextContent("Maddox #14");
    expect(maddoxTarget).toHaveTextContent("Playing0:00TotalNot played yet");
    expect(maddoxTarget).toHaveTextContent("Goalkeeper");
    expect(
      screen.queryByRole("button", { name: "Plan substitution" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Take Simon out of game",
      }),
    ).not.toBeInTheDocument();
  });

  it.each(["u8", "u12"] as const)(
    "opens the Plan out picker directly from a $teamId pitch card without persisting a draft",
    (teamId) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const outgoing = team.roster.find(
        (player) => player.id === Object.values(game.assignments)[1],
      )!;
      const title = `${outgoing.name} #${outgoing.number} Plan out`;
      const before = localStorage.getItem(STORAGE_KEY);
      const card = screen.getByRole("button", {
        name: `Plan substitution for ${outgoing.name}`,
      });
      expect(card).toHaveAttribute("type", "button");
      expect(card).toHaveAttribute(
        "title",
        "Tap to plan a substitution or drag to another position",
      );
      fireEvent.click(card);
      const picker = screen.getByRole("dialog", { name: title });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(picker).not.toHaveClass("sideline-dialog-bodyless");
      expect(
        Array.from(picker.querySelectorAll(".player-context-grid dt")).map(
          (label) => label.textContent,
        ),
      ).toEqual(["Current Position", "Played", "Playing now", "Goals"]);
      expect(
        within(picker)
          .getByRole("heading", { name: title })
          .querySelector(".soccer-ball-icon"),
      ).not.toBeInTheDocument();
      expect(
        within(picker).queryByRole("button", {
          name: /Change positions|Take .* out of game/,
        }),
      ).not.toBeInTheDocument();
      expect(
        within(picker).getByRole("button", { name: "Sub now" }),
      ).toBeDisabled();
      expect(
        within(picker).getByRole("button", { name: "Add to plan" }),
      ).toBeDisabled();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      const incoming = team.roster.find(
        (player) => player.id === game.benchIds[0],
      )!;
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(`^${incoming.name} #`),
        }),
      );
      expect(
        within(picker).getByRole("button", { name: "Add to plan" }),
      ).toBeEnabled();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      fireEvent.mouseDown(picker.parentElement!);
      fireEvent.click(picker.parentElement!);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);

      for (const key of ["Enter", " "]) {
        const code = key === " " ? "Space" : "Enter";
        card.focus();
        fireEvent.keyDown(card, { key, code });
        fireEvent.keyUp(card, { key, code });
        fireEvent.click(card, { detail: 0 });
        const reopened = screen.getByRole("dialog", { name: title });
        expect(
          within(reopened).getByRole("button", { name: "Add to plan" }),
        ).toBeDisabled();
        fireEvent.click(
          within(reopened).getByRole("button", { name: "Close" }),
        );
        expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      }
    },
  );

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
      screen.getByRole("button", { name: "Ollie (Center Back)" }),
    ).toBeInTheDocument();
    const centerBackChoice = screen.getByRole("button", {
      name: "Ollie (Center Back)",
    });
    expect(
      centerBackChoice.querySelector(".replacement-position-primary"),
    ).toHaveTextContent("Center Back");
    expect(
      centerBackChoice.querySelector(".position-destination-player"),
    ).toHaveTextContent("Ollie");
  });

  it("opens position editing with the on-field row player selected", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    openPositionEditor("Maddox");

    const positionDialog = screen.getByRole("dialog", {
      name: "Maddox #14 Change position",
    });
    expect(positionDialog).toBeInTheDocument();
    expect(
      within(positionDialog)
        .getByRole("heading", { name: "Maddox #14 Change position" })
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
        "Position changing from Center Back to Right Midfielder",
      ),
    ).toHaveTextContent("Center BackRM");
    fireEvent.click(confirmButton);

    expect(screen.getByText("Ollie ↔ Haru")).toBeInTheDocument();
    expect(
      screen.getByText("Center Back ↔ Right Midfielder"),
    ).toBeInTheDocument();
  });

  it.each(["outside", "pointercancel", "lostpointercapture"])(
    "keeps the source card in place and removes the name preview after %s",
    (reason) => {
      render(<App />);
      fireEvent.click(screen.getByText("Golden Dragons"));
      startGame();

      const ollie = screen.getByRole("button", {
        name: "Plan substitution for Ollie",
      });
      const originalStyle = ollie.getAttribute("style");
      const haru = screen.getByRole("button", {
        name: "Plan substitution for Haru",
      });
      vi.spyOn(haru, "getBoundingClientRect").mockReturnValue({
        left: 640,
        top: 380,
        right: 760,
        bottom: 460,
        width: 120,
        height: 80,
        x: 640,
        y: 380,
        toJSON: () => ({}),
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
      expect(haru).toHaveClass("drop-target");
      expect(ollie).toHaveClass("dragging");
      expect(ollie.getAttribute("style")).toBe(originalStyle);
      const preview = document.querySelector(".player-drag-preview");
      expect(preview).toHaveTextContent("Ollie");
      expect(preview).toHaveAttribute("aria-hidden", "true");
      expect(preview).toHaveStyle({ left: "700px", top: "420px" });
      fireEvent(
        ollie,
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 790,
          clientY: 320,
        }),
      );
      expect(haru).not.toHaveClass("drop-target");
      fireEvent(
        ollie,
        new MouseEvent(reason === "outside" ? "pointerup" : reason, {
          bubbles: true,
          clientX: 820,
          clientY: 340,
        }),
      );

      expect(ollie).not.toHaveClass("dragging");
      expect(document.querySelector(".player-drag-preview")).toBeNull();
      expect(ollie.getAttribute("style")).toBe(originalStyle);
      expect(screen.queryByText("Ollie ↔ Haru")).not.toBeInTheDocument();
      fireEvent.click(ollie, { detail: 1 });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("drags an on-field player onto another position", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const ollie = screen.getByRole("button", {
      name: "Plan substitution for Ollie",
    });
    const haru = screen.getByRole("button", {
      name: "Plan substitution for Haru",
    });
    vi.spyOn(haru, "getBoundingClientRect").mockReturnValue({
      left: 640,
      top: 380,
      right: 760,
      bottom: 460,
      width: 120,
      height: 80,
      x: 640,
      y: 380,
      toJSON: () => ({}),
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
    expect(document.querySelector(".player-drag-preview")).toHaveTextContent(
      "Ollie",
    );
    expect(ollie.style.transform).toBe("");
    expect(ollie).toHaveClass("dragging");
    fireEvent(
      ollie,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 700,
        clientY: 420,
      }),
    );

    expect(screen.getByText("Ollie ↔ Haru")).toBeInTheDocument();
    expect(document.querySelector(".player-drag-preview")).toBeNull();
    expect(
      screen.getByText("Center Back ↔ Right Midfielder"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ollie and Haru swapped",
    );
    expect(
      container.querySelectorAll(".pitch-player.swap-confirmed"),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll(".pitch-swap-confirmation-mark"),
    ).toHaveLength(2);
    fireEvent.click(ollie, { detail: 1 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["hold", "swipe", "tap", "cancel", "blur", "escape"])(
    "requires a deliberate touch hold on live pitch players (%s)",
    (gesture) => {
      render(<App />);
      fireEvent.click(screen.getByText("Golden Dragons"));
      startGame();
      vi.useFakeTimers();
      const source = screen.getByRole("button", {
        name: "Plan substitution for Ollie",
      });
      const target = screen.getByRole("button", {
        name: "Plan substitution for Haru",
      });
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        left: 640,
        top: 380,
        right: 760,
        bottom: 460,
        width: 120,
        height: 80,
        x: 640,
        y: 380,
        toJSON: () => ({}),
      });
      const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      const touchPointer = (type: string, x = 300, y = 420) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        Object.defineProperty(event, "pointerType", { value: "touch" });
        fireEvent(source, event);
      };
      touchPointer("pointerdown");
      act(() => vi.advanceTimersByTime(124));
      expect(document.querySelector(".player-drag-preview")).toBeNull();
      if (gesture === "hold") act(() => vi.advanceTimersByTime(1));
      else if (gesture === "tap") {
        touchPointer("pointerup");
        fireEvent.click(source);
      } else if (gesture === "cancel") touchPointer("pointercancel");
      else if (gesture === "blur") fireEvent.blur(window);
      else if (gesture === "escape")
        fireEvent.keyDown(window, { key: "Escape" });
      touchPointer("pointermove", 700, 420);
      const touchMove = new Event("touchmove", {
        bubbles: true,
        cancelable: true,
      });
      fireEvent(source, touchMove);
      expect(touchMove.defaultPrevented).toBe(gesture === "hold");
      act(() => vi.advanceTimersByTime(500));
      if (gesture === "hold") {
        expect(source).toHaveClass("dragging");
        expect(target).toHaveClass("drop-target");
      } else expect(document.querySelector(".player-drag-preview")).toBeNull();
      touchPointer("pointerup", 700, 420);
      if (gesture === "hold") fireEvent.click(source, { detail: 1 });
      const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      if (gesture === "hold") {
        expect(screen.getByText("Ollie ↔ Haru")).toBeInTheDocument();
        expect(validateGame(after.activeGame!, 5)).toEqual([]);
      } else {
        expect(after.activeGame?.assignments).toEqual(
          before.activeGame?.assignments,
        );
        expect(after.activeGame?.history).toEqual(before.activeGame?.history);
        if (gesture === "tap") {
          expect(
            screen.getByRole("dialog", { name: "Ollie #23 Plan out" }),
          ).toBeInTheDocument();
          expect(after).toEqual(before);
        }
      }
      if (gesture !== "tap")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("readies substitutions without changing the lineup, then sends them in", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const planner = screen.getByRole("dialog", {
      name: "Substitution plan",
    });
    fireEvent.click(within(planner).getByRole("button", { name: "3" }));
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
      ).every(Boolean),
    ).toBe(true);
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
      screen.getByText(`Who should ${secondIncomingName} replace?`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Who's coming OUT?")).not.toBeInTheDocument();
    const repeatedOutgoing = screen
      .getAllByRole("menuitemradio")
      .find((item) => item.textContent?.includes(firstOutgoingName));
    expect(repeatedOutgoing).toBeDefined();
    expect(repeatedOutgoing).toHaveTextContent(
      `Scheduled out for ${firstIncomingName}`,
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
    expect(repeatedIncoming).toHaveTextContent(/.+ #\d+/);
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
      `Scheduled in for ${secondOutgoingName}`,
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
      name: "Substitution plan (3)",
    });
    expect(
      within(summary).getByRole("button", { name: "Send players in" }),
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
      ).every(Boolean),
    ).toBe(true);
    expect(
      summary.querySelectorAll(".ready-player.out .player-identity-number"),
    ).toHaveLength(3);
    expect(
      summary.querySelectorAll(".ready-player.in .player-identity-number"),
    ).toHaveLength(3);
    expect(
      screen.getByRole("button", {
        name: /Plan substitution for Simon\. Scheduled out for/,
      }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".pitch-plan-icon")).toHaveLength(3);
    document.querySelectorAll(".pitch-plan-icon").forEach((icon) => {
      expect(icon.parentElement).toHaveClass("pitch-player");
    });

    fireEvent.click(
      within(summary).getByRole("button", { name: "Send players in" }),
    );
    expect(
      screen.getByRole("button", { name: "Plan substitution for Dylan" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /^Substitution plan \([0-9]+\)$/ }),
    ).not.toBeInTheDocument();
  });

  it("removes a specific row from the substitution planner", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    const planner = screen.getByRole("dialog", {
      name: "Substitution plan",
    });
    fireEvent.click(within(planner).getByRole("button", { name: "3" }));
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
      name: "Substitution plan (1)",
    });
    expect(within(review).getByText(targetPosition.mediumLabel)).toBeVisible();
    expect(
      within(review).queryByText(targetPosition.shortLabel),
    ).not.toBeInTheDocument();
    expect(
      within(review).getByRole("button", { name: "Send players in" }),
    ).toBeEnabled();
    expect(
      within(review).queryByText("Plan needs attention"),
    ).not.toBeInTheDocument();
  });

  it("keeps all six U12 bench players selectable while refilling the displaced row", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    const planner = screen.getByRole("dialog", {
      name: "Substitution plan",
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

  it("prompts default U8 halves after six minutes fifteen seconds without a swap", () => {
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
    game.clock.elapsedSeconds = 375;
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const reminder = screen.getByLabelText("Substitution reminder");
    expect(reminder).toHaveTextContent("Reminder timer: 6:15");
    expect(screen.getByRole("tab", { name: "Bench 5" })).toBeInTheDocument();
    expect(screen.getByLabelText("Next reminder")).toHaveTextContent(
      "Next reminderDue now",
    );
    fireEvent.click(
      within(reminder).getByRole("button", { name: "Create plan" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Substitution plan" }),
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

    expect(screen.getByLabelText("Next reminder")).toHaveTextContent(
      "Next reminderDue in 4:15",
    );
  });

  it.each([false, true])(
    "prioritizes a rested six-player return while preserving saved smaller plans (%s)",
    (savedPlan) => {
      const { state, game, team } = u12ThirdRotation();
      if (savedPlan)
        state.activeGame = queueSubstitutions(
          game,
          suggestSubstitutions(game, 3, team),
        );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (savedPlan) {
        fireEvent.click(
          screen.getByRole("button", { name: "Review substitutions" }),
        );
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Edit plan",
          }),
        );
      } else {
        fireEvent.click(
          screen.getAllByRole("button", { name: "Create plan" })[0],
        );
      }
      const planner = screen.getByRole("dialog", {
        name: "Substitution plan",
      });
      const count = savedPlan ? 3 : 6;
      expect(
        within(planner).getByRole("button", { name: String(count) }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(planner.querySelectorAll(".swap-row")).toHaveLength(count);
      expect(
        within(planner).getByRole("button", { name: `Ready ${count} swaps` }),
      ).toBeEnabled();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(stored.activeGame?.assignments).toEqual(game.assignments);
      expect(stored.activeGame?.history).toEqual(game.history);
      if (!savedPlan) {
        fireEvent.click(
          within(planner).getByRole("button", { name: "Ready 6 swaps" }),
        );
        const review = screen.getByRole("dialog", {
          name: "Substitution plan (6)",
        });
        fireEvent.click(within(review).getByRole("button", { name: "Close" }));
        expect(screen.getByLabelText("Ready substitutions")).toHaveTextContent(
          "6 substitutions ready",
        );
        expect(
          screen.queryByRole("status", { name: "Goalkeeper preparation" }),
        ).not.toBeInTheDocument();
        expect(
          document.querySelector(".goalkeeper-preparation-banner"),
        ).toBeNull();
      }
    },
  );

  it("keeps a genuine keeper concern inside the ready banner instead of stacking styles", () => {
    const { state, game, team } = u12ThirdRotation();
    const outgoing = Object.entries(game.assignments).filter(
      ([position, id]) =>
        position !== "gk" &&
        !team.roster
          .find((p) => p.id === id)!
          .preferredRoles.includes("goalkeeper"),
    );
    state.activeGame = queueSubstitutions(
      game,
      outgoing.map(([positionId, outPlayerId], index) => ({
        positionId,
        outPlayerId,
        inPlayerId: game.benchIds[index],
      })),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const banner = screen.getByLabelText("Ready substitutions");
    const note = within(banner).getByRole("status", {
      name: "Goalkeeper preparation",
    });
    expect(note).toHaveTextContent("William is lined up outfield");
    expect(note.parentElement).toBe(banner);
    expect(banner).toHaveClass("has-preparation");
    expect(document.querySelector(".goalkeeper-preparation-banner")).toBeNull();
    expect(banner.querySelector('[data-component="Banner"]')).toBeNull();
    expect(
      within(banner).getByRole("button", { name: "Review plan" }),
    ).toBeEnabled();
  });

  it.each(["early", "at a minute-29 stoppage", "on time"] as const)(
    "keeps a minute-30 keeper plan quiet at minute 15 and rechecks when sending %s",
    (execution) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-16T15:30:00Z"));
      const { state, game, team } = prepareU12KeeperHandoff();
      const keeper = team.roster[0];
      const successor = team.roster[1];
      expect(game.assignments.gk).toBe(keeper.id);
      expect(game.benchIds).toContain(successor.id);
      state.activeGame = setClockRunning(game, true, Date.now());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const planner = screen.getByRole("dialog", {
        name: "Substitution plan",
      });
      expect(planner.querySelector(".keeper-change-warning")).toBeNull();
      expect(
        within(planner).getByRole("group", { name: "Players to swap" }),
      ).not.toHaveAttribute("aria-describedby");
      fireEvent.click(
        within(planner).getByRole("button", { name: /Ready \d swaps?/ }),
      );
      const review = screen.getByRole("dialog", {
        name: /^Substitution plan \([0-9]+\)$/,
      });
      const warning = within(review).getByRole("status", {
        name: "Wait on this rotation",
      });
      expect(warning).toHaveTextContent(
        "Sending now would end Jackson's turn before the recommended 30:00.",
      );
      expect(warning).toHaveTextContent(
        "Lazar has not had their recommended 15:00 bench turn before taking over.",
      );
      const send = within(review).getByRole("button", {
        name: "Send players in",
      });
      expect(send).toBeEnabled();
      expect(send).toHaveAccessibleDescription(/Wait on this rotation/);
      const queued = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(queued.activeGame?.assignments.gk).toBe(keeper.id);
      expect(queued.activeGame?.history).toHaveLength(game.history.length);
      const executionSeconds =
        execution === "early" ? 900 : execution === "on time" ? 1_800 : 1_740;
      if (execution !== "early") {
        act(() => vi.advanceTimersByTime((executionSeconds - 900) * 1_000));
        expect(
          within(review).queryByRole("status", {
            name: "Wait on this rotation",
          }),
        ).not.toBeInTheDocument();
        expect(review.querySelector(".keeper-change-warning")).toBeNull();
        expect(send).not.toHaveAttribute("aria-describedby");
      }
      fireEvent.click(send);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame?.assignments.gk).toBe(successor.id);
      expect(saved.activeGame?.clock.elapsedSeconds).toBe(executionSeconds);
      expect(validateGame(saved.activeGame!, 9)).toEqual([]);
    },
  );

  it.each([false, true])(
    "uses the shortened keeper target in planning and live execution notices (backup first turn=%s)",
    (backupFirstTurn) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-18T18:00:00Z"));
      const { state, game } = u8RepeatKeeperRotation(
        40,
        backupFirstTurn ? { henryOutfieldFirst: true, removeOllie: false } : {},
      );
      const keeperName = state.teams.u8.roster.find(
        (player) => player.id === game.assignments.gk,
      )!.name;
      state.activeGame = setClockRunning(game, true, Date.now());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const planner = screen.getByRole("dialog", { name: "Substitution plan" });
      expect(planner.querySelector(".keeper-change-warning")).toBeNull();
      fireEvent.click(
        within(planner).getByRole("button", { name: "Ready 5 swaps" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Review substitutions" }),
      );
      const review = screen.getByRole("dialog", {
        name: "Substitution plan (5)",
      });
      expect(review).toHaveTextContent(
        `Sending now would end ${keeperName}'s turn before the recommended 5:00.`,
      );
      act(() => vi.advanceTimersByTime(300_000));
      expect(review.querySelector(".keeper-change-warning")).toBeNull();
      fireEvent.click(
        within(review).getByRole("button", { name: "Send players in" }),
      );
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame!.clock.elapsedSeconds).toBe(2_100);
      expect(
        saved.teams.u8.roster.find(
          (player) => player.id === saved.activeGame!.assignments.gk,
        )?.name,
      ).toBe("Henry");
      expect(validateGame(saved.activeGame!, 5)).toEqual([]);
    },
  );

  it.each([120, 300])(
    "explains second-plan limits %i seconds after the first rotation",
    (elapsedSeconds) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      let game = createGame(
        team,
        "5-1-2-1",
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      game.assignments = assignStartingPlayersByPreference(
        getFormation(game.formationId),
        game.presentIds,
        team.roster,
      );
      game.benchIds = game.presentIds.filter(
        (id) => !Object.values(game.assignments).includes(id),
      );
      const firstPlan = suggestSubstitutions(game, 5, team);
      game.clock.elapsedSeconds = 300;
      game = applySubstitutions(game, firstPlan, team.sideSize, 2_000);
      game.clock.elapsedSeconds += elapsedSeconds;
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create plan" })[0],
      );
      const planner = screen.getByRole("dialog", {
        name: "Substitution plan",
      });
      const maximum = elapsedSeconds === 120 ? 4 : 5;
      expect(planner.querySelectorAll(".stepper button")).toHaveLength(5);
      const five = within(planner).getByRole("button", { name: "5" });
      expect(five).toBeEnabled();
      if (maximum === 4) {
        expect(
          within(planner).getByRole("button", { name: "4" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
          planner.querySelector(".sub-count-explanation"),
        ).not.toBeInTheDocument();
      } else {
        expect(within(planner).queryByRole("status")).not.toBeInTheDocument();
        expect(
          within(planner).getByRole("group", { name: "Players to swap" }),
        ).not.toHaveAttribute("aria-describedby");
      }
      expect(
        within(planner).queryByText("Choose at least one substitution"),
      ).not.toBeInTheDocument();
      expect(
        within(planner).getByRole("button", { name: /Ready \d swaps?/ }),
      ).toBeEnabled();
      for (let count = maximum; count >= 1; count -= 1) {
        fireEvent.click(
          within(planner).getByRole("button", { name: String(count) }),
        );
        expect(planner.querySelectorAll(".swap-row")).toHaveLength(count);
        expect(
          within(planner).getByRole("button", {
            name: `Ready ${count} swap${count === 1 ? "" : "s"}`,
          }),
        ).toBeEnabled();
        if (maximum === 4) {
          expect(
            planner.querySelector(".sub-count-explanation"),
          ).not.toBeInTheDocument();
        }
      }
      if (maximum === 4) {
        fireEvent.click(five);
        expect(five).toBeEnabled();
        expect(five).toHaveAttribute("aria-pressed", "true");
        expect(
          within(planner).getByRole("group", { name: "Players to swap" }),
        ).toHaveAccessibleDescription(
          /Early keeper change.*would not complete their recommended 10:00 turn in goal by the next rotation/,
        );
        expect(planner.querySelectorAll(".swap-row")).toHaveLength(5);
        const warning = within(planner).getByRole("status", {
          name: "Early keeper change",
        });
        expect(warning).toHaveAttribute("data-component", "Banner");
        expect(warning).toHaveAttribute("data-variant", "warning");
        expect(warning).toHaveAttribute("data-layout", "compact");
        expect(
          within(warning).getByRole("heading", {
            name: "Early keeper change",
            level: 3,
          }),
        ).toBeVisible();
        expect(
          warning.querySelector('[data-component="Banner.Icon"] svg'),
        ).toBeInTheDocument();
        expect(within(warning).queryByRole("button")).not.toBeInTheDocument();
        expect(
          within(planner).getByLabelText("Swap 1 incoming player"),
        ).toHaveFocus();
        expect(
          within(planner).getByLabelText("Swap 1 incoming player"),
        ).toHaveTextContent("Maddox");
        fireEvent.click(within(planner).getByRole("button", { name: "2" }));
        expect(planner.querySelectorAll(".swap-row")).toHaveLength(2);
        expect(
          planner.querySelector('[data-component="Banner"]'),
        ).not.toBeInTheDocument();
        expect(
          planner.querySelector(".sub-count-explanation"),
        ).not.toBeInTheDocument();
        fireEvent.click(five);
        expect(
          within(planner).getByRole("button", { name: "Ready 5 swaps" }),
        ).toBeEnabled();
        fireEvent.click(
          within(planner).getByRole("button", { name: "Ready 5 swaps" }),
        );
        const stored: AppState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(
          stored.activeGame?.queuedSubstitutions?.find(
            (pair) => pair.positionId === "gk",
          ),
        ).toMatchObject({
          outPlayerId: game.assignments.gk,
        });
      }
    },
  );

  it.each(["automatic", "edited", "ready"])(
    "recalculates untouched plans and preserves coach pairings (%s)",
    (mode) => {
      const ready = mode === "ready";
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      let game = createGame(
        team,
        "5-1-2-1",
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      game.clock.elapsedSeconds = 300;
      game = applySubstitutions(
        game,
        suggestSubstitutions(game, 5, team),
        team.sideSize,
        2_000,
      );
      game.clock.elapsedSeconds += 120;
      let originalPairs = suggestSubstitutions(game, 4, team);
      if (ready) game = queueSubstitutions(game, originalPairs);
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (ready) {
        fireEvent.click(
          screen.getByRole("button", { name: "Review substitutions" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
        fireEvent.click(screen.getByRole("button", { name: "4" }));
      }
      const planner = screen.getByRole("dialog", {
        name: "Substitution plan",
      });
      if (mode === "edited") {
        const [first, second] = originalPairs;
        fireEvent.click(
          planner.querySelector('[data-player-menu-id="out-0"]')!,
        );
        fireEvent.click(
          screen
            .getAllByRole("menuitemradio")
            .find(
              (item) =>
                item.getAttribute("data-player-id") === second.outPlayerId,
            )!,
        );
        originalPairs = originalPairs.map((pair, index) =>
          index === 0
            ? {
                ...pair,
                positionId: second.positionId,
                outPlayerId: second.outPlayerId,
              }
            : index === 1
              ? {
                  ...pair,
                  positionId: first.positionId,
                  outPlayerId: first.outPlayerId,
                }
              : pair,
        );
      }
      const beforeRows = Array.from(
        planner.querySelectorAll(".swap-row"),
        (row) => row.textContent,
      );
      const remainingPlayerId = game.benchIds.find(
        (id) => !originalPairs.some((pair) => pair.inPlayerId === id),
      )!;
      const expectedPairs =
        mode === "automatic"
          ? suggestSubstitutions(game, 5, team, {
              allowEarlyKeeperChange: true,
            })
          : [
              ...originalPairs,
              {
                positionId: "gk",
                outPlayerId: game.assignments.gk,
                inPlayerId: remainingPlayerId,
              },
            ];
      const incomingKeeper = team.roster.find(
        (player) =>
          player.id ===
          expectedPairs.find((pair) => pair.positionId === "gk")!.inPlayerId,
      )!;
      const savedBefore = localStorage.getItem(STORAGE_KEY);
      fireEvent.click(within(planner).getByRole("button", { name: "5" }));
      expect(localStorage.getItem(STORAGE_KEY)).toBe(savedBefore);
      const afterRows = Array.from(
        planner.querySelectorAll(".swap-row"),
        (row) => row.textContent,
      ).slice(0, 4);
      if (mode === "automatic") {
        expect(afterRows).not.toEqual(beforeRows);
        expect(incomingKeeper.name).toBe("Maddox");
        expect(incomingKeeper.preferredRoles).toContain("goalkeeper");
      } else {
        expect(afterRows).toEqual(beforeRows);
      }
      const keeperIndex = expectedPairs.findIndex(
        (pair) => pair.positionId === "gk",
      );
      const keeperIncoming = planner.querySelector(
        `[data-player-menu-id="in-${keeperIndex}"]`,
      )!;
      expect(keeperIncoming).toHaveTextContent(incomingKeeper.name);
      expect(
        planner.querySelector(`[data-player-menu-id="out-${keeperIndex}"]`),
      ).toHaveTextContent(
        team.roster.find((player) => player.id === game.assignments.gk)!.name,
      );
      expect(keeperIncoming).toHaveFocus();
      expect(
        within(planner).getByRole("button", { name: "5" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(within(planner).getByRole("status")).toHaveTextContent(
        "Early keeper change",
      );
      expect(within(planner).getByRole("status")).not.toHaveTextContent("IN /");
      expect(within(planner).getByRole("status")).not.toHaveTextContent(
        "You can change",
      );
      if (!incomingKeeper.preferredRoles.includes("goalkeeper")) {
        expect(within(planner).getByRole("status")).toHaveTextContent(
          `${incomingKeeper.name} does not typically play goalkeeper.`,
        );
      } else {
        expect(within(planner).getByRole("status")).not.toHaveTextContent(
          "does not typically play goalkeeper",
        );
      }
      fireEvent.click(keeperIncoming);
      expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(
        within(planner).getByRole("button", { name: "Ready 5 swaps" }),
      );
      const stored: AppState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activeGame!.queuedSubstitutions).toEqual(expectedPairs);
      expect(
        validateGame(
          applySubstitutions(
            game,
            stored.activeGame!.queuedSubstitutions!,
            team.sideSize,
            3_000,
          ),
          team.sideSize,
        ),
      ).toEqual([]);
    },
  );

  it("does not automatically assign a non-keeper when no eligible keeper is benched", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    team.roster.forEach((player) => {
      player.preferredRoles =
        player.id === game.assignments.gk
          ? ["goalkeeper"]
          : player.preferredRoles.filter((role) => role !== "goalkeeper");
    });
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(within(planner).getByRole("button", { name: "5" }));
    expect(within(planner).getByRole("alert")).toHaveTextContent(
      "A full-team swap needs a replacement keeper from the bench.",
    );
    expect(planner.querySelectorAll(".swap-row")).toHaveLength(4);
    expect(within(planner).getByRole("button", { name: "4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(planner).getByRole("button", { name: "Ready 4 swaps" }),
    ).toBeEnabled();
  });

  it("opens a populated second plan after an immediately prepared five-player first swap", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const firstPlan = suggestSubstitutions(game, 5, team);
    expect(firstPlan).toHaveLength(5);
    game.clock.elapsedSeconds = 300;
    game = applySubstitutions(game, firstPlan, team.sideSize, 2_000);
    game.clock.elapsedSeconds += 120;
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(
      within(planner).queryByText("Choose at least one substitution"),
    ).not.toBeInTheDocument();
    expect(planner.querySelectorAll(".swap-row")).toHaveLength(4);
    expect(within(planner).getByRole("button", { name: "5" })).toBeEnabled();
    expect(
      within(planner).getByRole("button", { name: "Ready 4 swaps" }),
    ).toBeEnabled();
  });

  it("preserves an explicit keeper override when shrinking and expanding a ready full-team plan", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const pairs = Object.entries(game.assignments).map(
      ([positionId, outPlayerId], index) => ({
        positionId,
        outPlayerId,
        inPlayerId: game.benchIds[index],
      }),
    );
    game = queueSubstitutions(game, pairs);
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    for (const count of [4, 5]) {
      fireEvent.click(
        within(planner).getByRole("button", { name: String(count) }),
      );
      expect(planner.querySelectorAll(".swap-row")).toHaveLength(count);
      expect(
        within(planner).getByRole("button", { name: `Ready ${count} swaps` }),
      ).toBeEnabled();
    }
    fireEvent.click(
      within(planner).getByRole("button", { name: "Ready 5 swaps" }),
    );
    const stored: AppState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.activeGame?.queuedSubstitutions).toEqual(pairs);
  });

  it("allows a full opening rotation directly from Golden Dragons setup", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    const five = within(planner).getByRole("button", { name: "5" });
    expect(five).toBeEnabled();
    fireEvent.click(five);
    expect(planner.querySelectorAll(".swap-row")).toHaveLength(5);
    expect(
      within(planner).getByRole("button", { name: "Ready 5 swaps" }),
    ).toBeEnabled();
    fireEvent.click(
      within(planner).getByRole("button", { name: "Ready 5 swaps" }),
    );
    const stored: AppState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const game = stored.activeGame!;
    expect(game.clock.elapsedSeconds).toBe(0);
    expect(game.queuedSubstitutions).toHaveLength(5);
    expect(validateSubstitutionPairs(game, game.queuedSubstitutions!)).toEqual(
      [],
    );
    const keeperPair = game.queuedSubstitutions!.find(
      (pair) => pair.positionId === "gk",
    )!;
    expect(
      stored.teams.u8.roster.find(
        (player) => player.id === keeperPair.inPlayerId,
      )?.preferredRoles,
    ).toContain("goalkeeper");
  });

  it("allows the coach to reduce the default full-bench rotation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(
      screen.getByRole("button", { name: "Ready 1 swap" }),
    ).toBeInTheDocument();
  });

  it("shows rich player details and returns focus after choosing a swap player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    const outgoingTrigger = within(planner).getByLabelText(
      "Swap 1 outgoing player",
    );
    const originalPlayer = outgoingTrigger.textContent;
    fireEvent.click(outgoingTrigger);

    const options = screen.getAllByRole("menuitemradio");
    expect(options[0]).toHaveTextContent(/Playing0:00TotalNot played yet/);
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
      replacement!.querySelector(".player-identity-name")?.textContent ?? "";
    fireEvent.click(replacement!);

    expect(outgoingTrigger).toHaveTextContent(replacementName);
    expect(outgoingTrigger).not.toHaveTextContent(originalPlayer ?? "");
    expect(outgoingTrigger).toHaveFocus();
  });

  it("dismisses an open player menu before opening another selector", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
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
    const planButton = screen.getByRole("button", { name: "Create plan" });
    expect(planButton).not.toHaveAttribute("data-label-wrap");
    planButton.focus();
    fireEvent.click(planButton);

    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
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
      screen.queryByRole("dialog", { name: "Substitution plan" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(planButton).toHaveFocus());
  });

  it("re-optimizes untouched suggestions when the swap count decreases", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    // Isolate outfield ranking from the need to replace an atypical keeper.
    team.roster[0].preferredRoles = ["goalkeeper"];
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

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
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

    const selectedIncomingName = within(planner)
      .getAllByLabelText(/incoming player/)[0]
      .textContent?.trim();
    const selectedIncoming = team.roster.find(
      (player) => player.name === selectedIncomingName,
    )!;
    const formation = getFormation(game.formationId);
    const unavailableOutgoingNames = within(planner)
      .getAllByLabelText(/outgoing player/)
      .slice(1)
      .map((button) => button.textContent?.trim());
    const expectedOutgoingOptions = Object.entries(game.assignments)
      .map(([positionId, playerId]) => {
        const position = formation.positions.find(
          (item) => item.id === positionId,
        )!;
        const preferenceIndex = selectedIncoming.preferredRoles.indexOf(
          position.role,
        );
        return {
          playerId,
          alreadyPlanned: unavailableOutgoingNames.includes(
            playerName(playerId),
          ),
          preferenceIndex:
            preferenceIndex < 0 ? Number.POSITIVE_INFINITY : preferenceIndex,
          currentFieldSeconds: getCurrentFieldSeconds(game, playerId),
          totalFieldSeconds: game.totals[playerId].fieldSeconds,
          formationIndex: formation.positions.findIndex(
            (item) => item.id === positionId,
          ),
          timeBandSeconds: getSubstitutionTimeBandSize(game),
          rotationIntervalSeconds:
            getSubstitutionReminderStatus(game).intervalSeconds,
        };
      })
      .sort(compareSubstitutionDestinations)
      .map(({ playerId }) => playerId);
    fireEvent.click(within(planner).getAllByLabelText(/outgoing player/)[0]);
    const outgoingMenuItems = screen.getAllByRole("menuitemradio");
    for (const item of outgoingMenuItems) {
      const row = item.querySelector(".player-action-menu-row")!;
      expect(row.firstElementChild).toHaveClass("replacement-player-summary");
      expect(row.firstElementChild).toHaveTextContent(/.+ #\d+/);
      expect(
        row.querySelector(".replacement-player-position"),
      ).toBeInTheDocument();
      expect(
        row.querySelector(".replacement-position-primary"),
      ).not.toBeInTheDocument();
    }
    expect(
      outgoingMenuItems.every(
        (item) => item.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
    const visibleOutgoingIds = outgoingMenuItems.map((item) =>
      item.getAttribute("data-player-id"),
    );
    expect(visibleOutgoingIds).toEqual(expectedOutgoingOptions);
    expect(outgoingMenuItems.at(-1)).toHaveTextContent(/^.+Scheduled out for /);
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
        .filter((item) => item.textContent?.includes("Scheduled in for"))
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

  it.each(["Escape", "Close"])(
    "keeps a ready plan accessible after %s until its final swap is removed",
    (dismissAction) => {
      render(<App />);
      fireEvent.click(screen.getByText("Golden Dragons"));
      startGame();
      fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
      fireEvent.click(screen.getByRole("button", { name: "3" }));
      fireEvent.click(screen.getByRole("button", { name: "Ready 3 swaps" }));
      const review = screen.getByRole("dialog", {
        name: "Substitution plan (3)",
      });
      expect(
        within(review).queryByRole("button", { name: "Send later" }),
      ).not.toBeInTheDocument();
      if (dismissAction === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
      } else {
        fireEvent.click(
          within(review).getByRole("button", { name: dismissAction }),
        );
      }

      const readyBanner = screen.getByLabelText("Ready substitutions");
      expect(
        within(readyBanner).getByText("3 substitutions ready"),
      ).toBeVisible();
      expect(within(readyBanner).getByText("Due in 6:15")).toBeVisible();
      expect(
        within(readyBanner).getByLabelText("Next reminder due in 6:15"),
      ).toBeVisible();
      expect(
        within(readyBanner).queryByRole("button", { name: "Send players in" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(readyBanner).getByRole("button", {
          name: "Review plan",
        }),
      );
      expect(
        screen.queryByRole("button", { name: "Delete plan" }),
      ).not.toBeInTheDocument();
      const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      for (const count of [3, 2, 1]) {
        const review = screen.getByRole("dialog", {
          name: `Substitution plan (${count})`,
        });
        expect(review).toHaveAccessibleDescription(
          /Send 'em in now or you can send them in later\. Your call coach\./,
        );
        fireEvent.click(
          within(review).getAllByRole("button", {
            name: /^Remove .* substitution$/,
          })[0],
        );
      }
      const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(after.activeGame?.queuedSubstitutions).toBeUndefined();
      expect(after.activeGame?.assignments).toEqual(
        before.activeGame?.assignments,
      );
      expect(after.activeGame?.totals).toEqual(before.activeGame?.totals);
      expect(after.activeGame?.history).toEqual(before.activeGame?.history);
      expect(
        screen.queryByRole("dialog", {
          name: /^Substitution plan \([0-9]+\)$/,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Ready substitutions"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create plan" }),
      ).toBeInTheDocument();
    },
  );

  it("removes one reviewed substitution and reduces the editable plan count", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready 3 swaps" }));

    const summary = screen.getByRole("dialog", {
      name: "Substitution plan (3)",
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
      name: "Substitution plan (2)",
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
      name: "Substitution plan",
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
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Ready 1 swap" }));

    const summary = screen.getByRole("dialog", {
      name: "Substitution plan (1)",
    });
    fireEvent.click(
      within(summary).getByRole("button", {
        name: /^Remove .* substitution$/,
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: /^Substitution plan \([0-9]+\)$/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create plan" }),
    ).toBeInTheDocument();
  });

  it.each(["bench", "field", "pitch"] as const)(
    "sends a selected swap immediately from the %s picker without creating a plan",
    (direction) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      const [positionId, outPlayerId] = Object.entries(game.assignments)[1];
      const inPlayerId = game.benchIds[0];
      const incoming = team.roster.find((player) => player.id === inPlayerId)!;
      const outgoing = team.roster.find((player) => player.id === outPlayerId)!;
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (direction === "field") {
        fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      }
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "bench"
              ? `Plan ${incoming.name} in`
              : direction === "pitch"
                ? `Plan substitution for ${outgoing.name}`
                : `Plan ${outgoing.name} out`,
        }),
      );
      const picker = screen.getByRole("dialog", { name: /Plan (in|out)/ });
      const position = getFormation(game.formationId).positions.find(
        (item) => item.id === positionId,
      )!;
      expect(picker).toHaveAccessibleDescription(
        direction === "bench"
          ? `Who's ${incoming.name} going in for?`
          : `Who's coming on from the bench at ${position.label}?`,
      );
      const send = within(picker).getByRole("button", {
        name: "Sub now",
      });
      expect(
        within(picker).queryByRole("button", { name: "Remove from plan" }),
      ).not.toBeInTheDocument();
      expect(send).toBeDisabled();
      expect(send).toHaveAttribute("data-variant", "default");
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(
            direction === "bench" ? outgoing.name : incoming.name,
          ),
        }),
      );
      expect(send).toBeEnabled();
      expect(
        within(picker).queryByRole("button", { name: "Remove from plan" }),
      ).not.toBeInTheDocument();
      fireEvent.click(send);
      const result = screen.getByRole("dialog", { name: "Players swapped" });
      expect(result).toHaveTextContent("No plan was created.");
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame?.history.at(-1)?.substitutionKind).toBe(
        "immediate",
      );
      expect(saved.activeGame?.assignments).toEqual({
        ...game.assignments,
        [positionId]: inPlayerId,
      });
      expect(saved.activeGame?.benchIds).toContain(outPlayerId);
      expect(saved.activeGame?.unavailableIds).toEqual(game.unavailableIds);
      expect(saved.activeGame?.queuedSubstitutions).toBeUndefined();
      expect(saved.activeGame?.history.at(-1)?.pairs).toEqual([
        { positionId, outPlayerId, inPlayerId },
      ]);
      fireEvent.click(within(result).getByRole("button", { name: "Done" }));
      expect(
        screen.queryByRole("button", { name: "Review substitutions" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
      const undone = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(undone.activeGame?.assignments).toEqual(game.assignments);
      expect(undone.activeGame?.queuedSubstitutions).toBeUndefined();
    },
  );

  it.each(["bench", "field", "pitch"] as const)(
    "removes only the existing swap from the %s picker's next-rotation context",
    (direction) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      const pairs = suggestSubstitutions(game, 3, team);
      state.activeGame = queueSubstitutions(game, pairs);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const pair = pairs[0];
      const player = team.roster.find(
        (item) =>
          item.id ===
          (direction === "bench" ? pair.inPlayerId : pair.outPlayerId),
      )!;
      if (direction === "field") {
        fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      }
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "bench"
              ? `Edit ${player.name} going in`
              : direction === "pitch"
                ? `Plan substitution for ${player.name}. Scheduled out for ${team.roster.find((item) => item.id === pair.inPlayerId)!.name}`
                : `Edit planned substitution for ${player.name} out`,
        }),
      );
      const picker = screen.getByRole("dialog", { name: /Plan (in|out)/ });
      const remove = within(picker).getByRole("button", {
        name: "Remove from plan",
      });
      expect(remove.closest(".player-context-item")).toHaveTextContent(
        "In this plan",
      );
      expect(remove.closest(".bench-picker-footer")).toBeNull();
      expect(
        within(picker)
          .getByRole("button", { name: "Sub now" })
          .querySelector(".lucide-arrow-right-left"),
      ).toBeInTheDocument();
      expect(
        within(picker)
          .getByRole("button", { name: "Update plan" })
          .querySelector(".lucide-check"),
      ).toBeInTheDocument();
      fireEvent.click(remove);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(saved.activeGame?.queuedSubstitutions).toEqual(pairs.slice(1));
      expect(saved.activeGame?.assignments).toEqual(game.assignments);
      expect(saved.activeGame?.history).toEqual(game.history);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it.each(["bench", "field", "pitch"] as const)(
    "sends an unchanged planned pair from the %s picker and refreshes a smaller remaining plan",
    (direction) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      game = queueSubstitutions(game, suggestSubstitutions(game, 3, team));
      const pair = game.queuedSubstitutions![0];
      const incoming = team.roster.find(
        (player) => player.id === pair.inPlayerId,
      )!;
      const outgoing = team.roster.find(
        (player) => player.id === pair.outPlayerId,
      )!;
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (direction === "field") {
        fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      }
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "bench"
              ? `Edit ${incoming.name} going in`
              : direction === "pitch"
                ? `Plan substitution for ${outgoing.name}. Scheduled out for ${incoming.name}`
                : `Edit planned substitution for ${outgoing.name} out`,
        }),
      );
      const picker = screen.getByRole("dialog", { name: /Plan (in|out)/ });
      expect(
        within(picker).getByRole("button", { name: "Update plan" }),
      ).toBeDisabled();
      const send = within(picker).getByRole("button", {
        name: "Sub now",
      });
      expect(send).toBeEnabled();
      fireEvent.click(send);
      const result = screen.getByRole("dialog", { name: "Players swapped" });
      expect(result).toHaveTextContent(
        "Refreshed the remaining plan with 2 substitutions.",
      );
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      const updated = saved.activeGame!;
      expect(updated.history.at(-1)?.pairs).toEqual([pair]);
      expect(updated.queuedSubstitutions).toHaveLength(2);
      expect(
        updated.queuedSubstitutions!.map((swap) => swap.inPlayerId),
      ).not.toContain(pair.outPlayerId);
      expect(
        validateSubstitutionPairs(updated, updated.queuedSubstitutions!),
      ).toEqual([]);
      fireEvent.click(within(result).getByRole("button", { name: "Done" }));
      fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
      const undone = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(undone.activeGame?.assignments).toEqual(game.assignments);
      expect(undone.activeGame?.queuedSubstitutions).toEqual(
        game.queuedSubstitutions,
      );
    },
  );

  it.each(["bench", "field", "pitch"] as const)(
    "shows current-time keeper cautions for Sub now in the %s picker",
    (direction) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u8;
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        40,
        1_000,
      );
      const incoming = team.roster.find(
        (player) => player.id === game.benchIds[0],
      )!;
      const keeper = team.roster.find(
        (player) => player.id === game.assignments.gk,
      )!;
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (direction === "field") {
        fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      }
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "bench"
              ? `Plan ${incoming.name} in`
              : direction === "pitch"
                ? `Plan substitution for ${keeper.name}`
                : `Plan ${keeper.name} out`,
        }),
      );
      const picker = screen.getByRole("dialog", { name: /Plan (in|out)/ });
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(direction === "bench" ? keeper.name : incoming.name),
        }),
      );
      const send = within(picker).getByRole("button", {
        name: "Sub now",
      });
      expect(send).toHaveAccessibleDescription(/Sending now would end/);
      expect(picker).not.toHaveTextContent("by the next rotation");
      expect(send).toBeEnabled();
    },
  );

  it.each(["bench", "field", "pitch"] as const)(
    "keeps only a compact preference warning for Aaron replacing Jackson in the %s picker",
    (direction) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams.u12;
      let game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        60,
        1_000,
      );
      const aaron = team.roster.find((player) => player.name === "Aaron")!;
      const jackson = team.roster.find((player) => player.name === "Jackson")!;
      const [positionId, originalPlayerId] = Object.entries(
        game.assignments,
      )[1];
      game.assignments[positionId] = aaron.id;
      game.benchIds = game.benchIds
        .filter((id) => id !== aaron.id)
        .concat(originalPlayerId);
      game = fastForwardGame(game, 29 * 60, 1_000);
      game = applySubstitutions(
        game,
        [
          {
            positionId,
            outPlayerId: aaron.id,
            inPlayerId: originalPlayerId,
          },
        ],
        team.sideSize,
        2_000,
      );
      game = fastForwardGame(game, 60, 3_000);
      expect(
        getGoalkeeperChangeStatus(
          game,
          [
            {
              positionId: "gk",
              outPlayerId: jackson.id,
              inPlayerId: aaron.id,
            },
          ],
          game.clock.elapsedSeconds,
        ),
      ).toMatchObject({ early: false, needsRest: true });
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      if (direction === "field") {
        fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
      }
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "bench"
              ? "Plan Aaron in"
              : direction === "pitch"
                ? "Plan substitution for Jackson"
                : "Plan Jackson out",
        }),
      );
      const picker = screen.getByRole("dialog", { name: /Plan (in|out)/ });
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(direction === "bench" ? "Jackson" : "Aaron"),
        }),
      );
      const warning = within(picker).getByRole("status");
      expect(warning).toHaveClass("keeper-change-warning");
      expect(warning).toHaveTextContent(
        "Aaron does not typically play goalkeeper.",
      );
      expect(
        within(warning).getByRole("heading", { name: "Position preference" })
          .parentElement?.className,
      ).toMatch(/VisuallyHidden/);
      expect(picker).not.toHaveTextContent("Keeper needs more rest");
      expect(picker).not.toHaveTextContent("recommended 15:00 bench turn");
      expect(
        within(picker).getByRole("button", { name: "Sub now" }),
      ).toHaveAccessibleDescription(
        /Aaron does not typically play goalkeeper\./,
      );
    },
  );

  it("queues and edits one substitution directly from a bench player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const dylanRow = screen.getByRole("button", { name: "Plan Dylan in" });
    expect(dylanRow.tagName).toBe("BUTTON");
    expect(dylanRow).toHaveClass("player-time-main");
    expect(dylanRow).toHaveAccessibleDescription(/Dylan.*Not played yet/);
    expect(dylanRow.querySelector("button")).not.toBeInTheDocument();
    expect(dylanRow.querySelector(".bench-row-grip")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    fireEvent.click(within(dylanRow).getByText("Dylan"));
    const firstPicker = screen.getByRole("dialog", {
      name: "Dylan #4 Plan in",
    });
    expect(
      within(firstPicker)
        .getByRole("heading", { name: "Dylan #4 Plan in" })
        .querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(firstPicker).toHaveTextContent("Sitting now0:00");
    expect(firstPicker).toHaveTextContent(
      "PositionsDefense · MidfieldPlayedNot played yetSitting now0:00",
    );
    expect(
      Array.from(firstPicker.querySelectorAll(".player-context-grid dt")).map(
        (label) => label.textContent,
      ),
    ).toEqual(["Positions", "Played", "Sitting now", "Goals"]);
    expect(firstPicker).toHaveTextContent("GoalsNo goals… yet!");
    expect(
      within(firstPicker).getByRole("button", {
        name: /Ollie #23.*Center Back/,
      }),
    ).toHaveTextContent(
      "Ollie #231st preferenceCenter BackPlaying0:00TotalNot played yet",
    );
    const centerBackChoice = within(firstPicker).getByRole("button", {
      name: /Ollie #23.*Center Back/,
    });
    expect(centerBackChoice.firstElementChild).toHaveTextContent("Ollie #23");
    expect(centerBackChoice.firstElementChild).toHaveClass(
      "replacement-player-summary",
    );
    expect(
      centerBackChoice.querySelector(".replacement-player-position"),
    ).toHaveTextContent("Center Back");
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
        name: /Ollie #23.*Center Back/,
      }),
    );
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
    fireEvent.click(
      within(firstPicker).getByRole("button", { name: "Add to plan" }),
    );

    expect(screen.getByText("1 substitution ready")).toBeInTheDocument();
    const benchPlanStatus = screen.getByText("Scheduled in at CB for Ollie");
    expect(benchPlanStatus).toBeInTheDocument();
    expect(
      benchPlanStatus.querySelector(".lucide-arrow-right-left"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /^Substitution plan \([0-9]+\)$/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );

    let queued = screen.getByRole("dialog", {
      name: "Substitution plan (1)",
    });
    expect(queued).toHaveTextContent("Ollie #23");
    expect(queued).toHaveTextContent("Dylan #4");
    fireEvent.click(within(queued).getByRole("button", { name: "Edit plan" }));

    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(
      within(planner).getByLabelText("Swap 1 outgoing player"),
    ).toHaveTextContent("Ollie");
    expect(
      within(planner).getByLabelText("Swap 1 incoming player"),
    ).toHaveTextContent("Dylan");
    fireEvent.click(within(planner).getByRole("button", { name: "2" }));
    fireEvent.click(within(planner).getByRole("button", { name: "1" }));
    expect(
      within(planner).getByLabelText("Swap 1 outgoing player"),
    ).toHaveTextContent("Ollie");
    expect(
      within(planner).getByLabelText("Swap 1 incoming player"),
    ).toHaveTextContent("Dylan");
    fireEvent.click(within(planner).getByRole("button", { name: "Close" }));

    expect(
      screen.getByText("Scheduled in at CB for Ollie"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Dylan going in",
      }),
    );
    const editPicker = screen.getByRole("dialog", {
      name: "Dylan #4 Plan in",
    });
    expect(editPicker).toHaveTextContent(
      "In this planScheduled in at Center Back for Ollie",
    );
    const selectedOutgoing = within(editPicker).getByRole("button", {
      name: /Ollie #23.*Center Back/,
    });
    expect(selectedOutgoing).toHaveAttribute("aria-pressed", "true");
    expect(
      selectedOutgoing.querySelector(".replacement-selected-icon"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(editPicker).getByRole("button", {
        name: /Noah #7.*Left Midfielder/,
      }),
    );
    expect(editPicker).toHaveTextContent(
      "In this planScheduled in at Left Mid for Noah",
    );
    expect(
      screen.getByText("Scheduled in at CB for Ollie"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(editPicker).getByRole("button", { name: "Update plan" }),
    );

    expect(
      screen.queryByRole("dialog", { name: /^Substitution plan \([0-9]+\)$/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Scheduled in at LM for Noah")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    queued = screen.getByRole("dialog", {
      name: "Substitution plan (1)",
    });
    expect(queued).toHaveTextContent("Noah #7");
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
    expect(removeFromQueue).toHaveAttribute("data-variant", "invisible");
    expect(removeFromQueue).toHaveTextContent("");
    expect(removeFromQueue.querySelector("svg")).toBeInTheDocument();
    fireEvent.click(removeFromQueue);

    expect(screen.queryByText(/Scheduled in at/)).not.toBeInTheDocument();
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
        screen.getByRole("dialog", { name: "Dylan #4 Plan in" }),
      ).getByRole("button", { name: /Ollie #23.*Center Back/ }),
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
    ).toHaveClass("player-time-main");
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
    expect(screen.queryByText(/Scheduled in at/)).not.toBeInTheDocument();
    expect(screen.queryByText("1 substitution ready")).not.toBeInTheDocument();
  });

  it("tracks our scorer, opponent goals, and the final score", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    const goalButton = screen.getByRole("button", { name: "Record a goal" });
    expect(goalButton).toBeDisabled();
    expect(goalButton.querySelector(".soccer-ball-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(goalButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
    const scorerDialog = screen.getByRole("dialog", { name: "Record a goal" });
    expect(
      within(scorerDialog).queryByRole("button", {
        name: /Record goal for Maddox #14/,
      }),
    ).not.toBeInTheDocument();
    const simonScorer = within(scorerDialog).getByRole("button", {
      name: "Record goal for Simon #10 at Striker",
    });
    expect(simonScorer).toHaveTextContent("Simon #10ST");
    expect(
      simonScorer.querySelector(".soccer-ball-icon"),
    ).not.toBeInTheDocument();
    expect(simonScorer.querySelector(".goal-scorer-position")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      within(scorerDialog).queryByRole("button", {
        name: /Record goal for Malik #9/,
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

    fireEvent.click(
      screen.getByRole("button", { name: "Plan substitution for Simon" }),
    );
    const scorerActions = screen.getByRole("dialog", {
      name: "Simon #10 Plan out",
    });
    expect(
      within(scorerActions).getByText("Goals", { selector: "dt" }),
    ).toBeInTheDocument();
    expect(
      within(scorerActions).getByLabelText("Simon scored 1 goal"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(scorerActions).getByRole("button", { name: "Close" }),
    );

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

  it("defers a ready plan without pausing the clock or executing any swaps", () => {
    prepareUpcomingRotation(true, false);
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    const review = screen.getByRole("dialog", {
      name: "Substitution plan (1)",
    });
    const edit = within(review).getByRole("button", { name: "Edit plan" });
    expect(edit).toHaveAttribute("data-variant", "default");
    expect(edit.closest(".queued-plan-actions")).not.toBeNull();
    expect(edit).toHaveTextContent("Edit plan");
    const later = within(review).getByRole("button", { name: "Close" });
    expect(later.closest(".sheet-header")).not.toBeNull();
    expect(later.closest(".queued-plan-actions")).toBeNull();
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    fireEvent.click(later);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const deferred = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(deferred.activeGame).toEqual(before.activeGame);
    act(() => vi.advanceTimersByTime(1000));
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(after.activeGame?.assignments).toEqual(
      before.activeGame?.assignments,
    );
    expect(after.activeGame?.queuedSubstitutions).toEqual(
      before.activeGame?.queuedSubstitutions,
    );
    expect(after.activeGame?.history).toEqual(before.activeGame?.history);
  });

  it("compacts the match status header after scrolling", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    const compactHeader = container.querySelector(".compact-match-header");

    expect(
      Array.from(compactHeader?.children ?? [], (child) => child.className),
    ).toEqual([
      "compact-match-team",
      "compact-match-score",
      "compact-match-management",
    ]);
    expect(
      compactHeader?.querySelector(".compact-match-team .team-crest.mini"),
    ).toHaveClass("golden-dragons");
    expect(
      compactHeader?.querySelector(".compact-match-team .team-crest"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      compactHeader?.querySelector(".compact-match-team strong"),
    ).toHaveTextContent("Golden Dragons");
    expect(
      compactHeader?.querySelector(".compact-match-management")?.children,
    ).toHaveLength(2);
    expect(
      within(screen.getByLabelText("Match status")).getByText("25:00 left"),
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
    ).not.toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).queryByText("25:00 left"),
    ).not.toBeInTheDocument();
    expect(
      within(compactHeader as HTMLElement).getByText("H1"),
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
    expect(expandedClockButton).toHaveAccessibleName("Start game");
    expect(expandedClockButton).toHaveTextContent("Start game");
    expect(expandedClockButton).toHaveClass("turf-clock-action");
    expect(expandedClockButton).toHaveAttribute("data-variant", "default");
    expect(container.querySelector(".compact-clock-button")).toHaveClass(
      "turf-clock-action",
    );
    expect(
      container.querySelector(".compact-clock-button"),
    ).toHaveAccessibleName("Start game");
    expect(
      container.querySelector(".match-header .match-end-copy-short"),
    ).toHaveTextContent("End");
    const dockButtons = within(
      container.querySelector(".mobile-control-dock") as HTMLElement,
    ).getAllByRole("button");
    expect(dockButtons.map((button) => button.textContent?.trim())).toEqual([
      "Undo",
      "Create plan",
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

    expect(screen.getByRole("tab", { name: "Bench 6" })).toBeInTheDocument();
    expect(screen.getByText("Borrowed Casey")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("tab", { name: "Bench 5" })).toBeInTheDocument();
    expect(screen.queryByText("Borrowed Casey")).not.toBeInTheDocument();
  });

  it("labels the initial U12 clock action as starting the game", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));
    startGame();

    expect(
      container.querySelector(".match-header .match-clock-button"),
    ).toHaveAccessibleName("Start game");
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
      4,
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

  it("prioritizes the below-pace warning over aggregate bench time", () => {
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
    game.clock.elapsedSeconds = 12 * 60;
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
      "All 2 sitting since start12:00",
    );
    expect(benchPlayer).toHaveTextContent("Below 50% pace");
    expect(benchPlayer).not.toHaveTextContent("12 min bench");
  });

  it("shows aggregate bench time when no higher-priority status applies", () => {
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
    expect(benchPlayer).toHaveTextContent("12 min bench");
    expect(benchPlayer).not.toHaveTextContent("Sitting");
    expect(benchPlayer).not.toHaveTextContent("Below 50% pace");
  });

  it.each([
    {
      teamId: "u8",
      count: 10,
      elapsed: 40 * 60,
      played: 17 * 60,
      floor: "40",
      warning: false,
    },
    {
      teamId: "u8",
      count: 10,
      elapsed: 40 * 60,
      played: 16 * 60,
      floor: "40",
      warning: false,
    },
    {
      teamId: "u8",
      count: 10,
      elapsed: 40 * 60,
      played: 15 * 60,
      floor: "40",
      warning: true,
    },
    {
      teamId: "u8",
      count: 9,
      elapsed: 40 * 60,
      played: 14 * 60,
      floor: "44.4",
      warning: true,
    },
    {
      teamId: "u8",
      count: 7,
      elapsed: 40 * 60,
      played: 19 * 60,
      floor: "50",
      warning: true,
    },
    {
      teamId: "u12",
      count: 15,
      elapsed: 60 * 60,
      played: 28 * 60,
      floor: "48",
      warning: true,
    },
    {
      teamId: "u12",
      count: 15,
      elapsed: 60 * 60,
      played: 1728,
      floor: "48",
      warning: false,
    },
    {
      teamId: "u12",
      count: 14,
      elapsed: 60 * 60,
      played: 29 * 60,
      floor: "50",
      warning: true,
    },
  ] as const)(
    "shows the attendance-aware $floor% floor for $teamId/$count ($played seconds played)",
    ({ teamId, count, elapsed, played, floor, warning }) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.slice(0, count).map((player) => player.id),
        teamId === "u8" ? 40 : 60,
        1_000,
        2,
      );
      expect(game.benchIds).toHaveLength(count - team.sideSize);
      const id = game.benchIds[0];
      game.clock.elapsedSeconds = elapsed;
      game.period = {
        current: 2,
        startedAtSeconds: game.durationSeconds / 2,
      };
      game.totals[id] = {
        fieldSeconds: played,
        benchSeconds: elapsed - played,
      };
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const row = screen
        .getByRole("button", {
          name: `Plan ${team.roster.find((player) => player.id === id)!.name} in`,
        })
        .closest<HTMLDivElement>(".player-time-row")!;
      expect(within(row).queryByText(`Below ${floor}% pace`) !== null).toBe(
        warning,
      );
      if (!warning)
        expect(row.querySelector(".minimum-play-warning")).toBeNull();
    },
  );

  it("does not show minimum-play warnings before one normal rotation plus its grace", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    const game = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 7).map((player) => player.id),
      40,
      1_000,
    );
    game.clock.elapsedSeconds = 6 * 60;
    game.benchIds.forEach((id) => {
      game.totals[id].benchSeconds = game.clock.elapsedSeconds;
    });
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
      "player-time-main",
    );
    expect(dylanRow).toHaveTextContent("Not played yet");
    expect(dylanRow).not.toHaveTextContent("Sitting");
    expect(dylanRow).not.toHaveTextContent("bench");
    expect(screen.getByLabelText("Shared bench time")).toHaveTextContent(
      "All 5 sitting since start0:00",
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
    game.totals[incomingId].fieldSeconds = 300;
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
          name: `Plan substitution for ${incomingName}`,
        }),
      ).getByText("0:37"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Plan substitution for ${incomingName}`,
      }),
    ).toHaveTextContent("0:37 playing");
    expect(document.querySelectorAll(".pitch-time")).toHaveLength(
      team.sideSize,
    );
    expect(screen.getByLabelText("Shared bench time")).toHaveTextContent(
      "4 of 5 sitting since start10:37",
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
      ? `${fullGamePlayerName} #${fullGamePlayer.number}`
      : fullGamePlayerName;
    const fullGamePitchPlayer = screen.getByRole("button", {
      name: `Plan substitution for ${fullGamePlayerName}`,
    });
    expect(fullGamePitchPlayer).toHaveTextContent("11 min");
    fireEvent.click(fullGamePitchPlayer);
    const playerActions = screen.getByRole("dialog", {
      name: `${fullGamePlayerLabel} Plan out`,
    });
    expect(playerActions).toHaveTextContent("Played11 min");
    expect(playerActions).toHaveTextContent("Playing now11 min");
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
    const fieldRows = Array.from(
      document.querySelectorAll(".field-player-list .player-time-row"),
    );
    expect(fieldRows.at(-1)).toHaveTextContent(incomingName);

    fireEvent.click(screen.getByRole("tab", { name: /Bench/ }));
    const benchRows = Array.from(
      document.querySelectorAll(
        ".roster-tab-panel > .bench-list > .player-time-row",
      ),
    );
    expect(benchRows.at(-1)).toHaveTextContent(outgoingName);
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

  it("omits goal markers from the ready substitution checklist", () => {
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
      elapsedSeconds: 5 * 60,
      running: true,
      lastStartedAt: 1_000,
    };
    const scorerId = game.assignments.dl;
    game = recordGoal(game, "us", scorerId, 1_000);
    game.clock = {
      ...game.clock,
      running: false,
      lastStartedAt: null,
    };
    game = queueSubstitutions(game, suggestSubstitutions(game, 1, team));
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    const review = screen.getByRole("dialog", {
      name: "Substitution plan (1)",
    });

    expect(review.querySelector(".soccer-ball-icon")).not.toBeInTheDocument();
  });

  it("shows the full out, move, and in goalkeeper handoff", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    let game = createGame(
      team,
      "5-1-2-1",
      team.roster.map((player) => player.id),
      40,
      1_000,
    );
    const fromPositionId = Object.keys(game.assignments).find(
      (positionId) => positionId !== "gk",
    )!;
    const handoffPlayerId = game.assignments[fromPositionId];
    const outgoingGoalkeeperId = game.assignments.gk;
    const incomingPlayerId = game.benchIds[0];
    const ordinaryPositionId = Object.keys(game.assignments).find(
      (positionId) => positionId !== "gk" && positionId !== fromPositionId,
    )!;
    game = queueSubstitutions(game, [
      {
        positionId: "gk",
        outPlayerId: outgoingGoalkeeperId,
        inPlayerId: incomingPlayerId,
        keeperHandoff: {
          playerId: handoffPlayerId,
          fromPositionId,
        },
      },
      {
        positionId: ordinaryPositionId,
        outPlayerId: game.assignments[ordinaryPositionId],
        inPlayerId: game.benchIds[1],
      },
    ]);
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Review substitutions" }),
    );
    const review = screen.getByRole("dialog", {
      name: "Substitution plan (2)",
    });
    const rows = review.querySelectorAll(".ready-swap");

    expect(rows).toHaveLength(2);
    expect(
      rows[1].querySelector(".handoff-route .lucide-move"),
    ).toBeInTheDocument();
    expect(rows[0].querySelector(".handoff-route")).toBeNull();
    expect(rows[1]).toHaveTextContent(
      team.roster.find((player) => player.id === handoffPlayerId)?.name ?? "",
    );
    expect(rows[1]).toHaveTextContent("Keeper");
    expect(
      within(rows[1] as HTMLElement).getByLabelText(/to Keeper/),
    ).toBeVisible();
    expect(review).toHaveTextContent(
      team.roster.find((player) => player.id === outgoingGoalkeeperId)?.name ??
        "",
    );
    expect(review).toHaveTextContent(
      team.roster.find((player) => player.id === incomingPlayerId)?.name ?? "",
    );
    fireEvent.click(within(review).getByRole("button", { name: "Edit plan" }));
    const planner = screen.getByRole("dialog", { name: "Substitution plan" });
    expect(within(planner).getByRole("button", { name: "5" })).toBeDisabled();
    expect(
      within(planner).getByRole("group", { name: "Players to swap" }),
    ).toHaveAccessibleDescription(/stays on.*Up to 4 players can come off/);
    expect(
      within(planner).queryByRole("button", { name: /Swap all \d anyways/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(planner).getByRole("button", { name: "4" }));
    expect(planner.querySelectorAll(".swap-row")).toHaveLength(4);
    fireEvent.click(
      within(planner).getByRole("button", { name: "Ready 4 swaps" }),
    );
    const stored: AppState = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const updatedGame = stored.activeGame!;
    const updatedPairs = updatedGame.queuedSubstitutions!;
    expect(validateSubstitutionPairs(updatedGame, updatedPairs)).toEqual([]);
    const changed = applySubstitutions(
      updatedGame,
      updatedPairs,
      team.sideSize,
      2_000,
    );
    expect(changed.assignments.gk).toBe(handoffPlayerId);
    expect(validateGame(changed, team.sideSize)).toEqual([]);
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
      name: `Plan substitution for ${scorerName}`,
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
    const leadingScorerId = Object.values(game.assignments)[2];
    game.clock = { elapsedSeconds: 0, running: true, lastStartedAt: 10_000 };
    for (let goal = 0; goal < 3; goal += 1) {
      game = recordGoal(game, "us", scorerId, 10_000 + goal);
    }
    for (let goal = 0; goal < 4; goal += 1) {
      game = recordGoal(game, "us", leadingScorerId, 10_100 + goal);
    }
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);

    const scorerName = team.roster.find(
      (player) => player.id === scorerId,
    )!.name;
    const leadingScorerName = team.roster.find(
      (player) => player.id === leadingScorerId,
    )!.name;
    const pitchCard = screen.getByRole("button", {
      name: `Plan substitution for ${scorerName}`,
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

    fireEvent.click(
      within(scorerDialog).getByRole("button", { name: "Close" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "End this game?" }),
      ).getByRole("button", { name: "End game" }),
    );
    const summary = screen.getByRole("main", { name: "Game summary" });
    const hatTrickStamps = within(summary).getAllByText("Hat trick");
    expect(hatTrickStamps).toHaveLength(2);
    hatTrickStamps.forEach((hatTrickStamp) => {
      expect(hatTrickStamp).toHaveClass("hat-trick-summary-stamp");
      expect(hatTrickStamp.closest("li")).toHaveClass("hat-trick-summary");
    });
    const summaryRows = summary.querySelectorAll(".player-game-summaries > li");
    expect(summaryRows[0]).toHaveTextContent(leadingScorerName);
    expect(summaryRows[1]).toHaveTextContent(scorerName);
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
      name: `Plan substitution for ${scorerName}`,
    });
    const goalTotal = within(pitchCard).getByLabelText(
      `${scorerName} scored 4 goals`,
    );
    expect(goalTotal.querySelectorAll(".hat-trick-icon")).toHaveLength(1);
    expect(goalTotal).toHaveTextContent("×4");
  });

  it("switches between bench and on-field lists with tabs and keyboard, not swipes", () => {
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
      "player-time-main",
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
    expect(fieldTab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(benchTab);
    expect(benchTab).toHaveAttribute("aria-selected", "true");
  });

  it.each(["u8", "u12"] as const)(
    "adds and edits a $teamId pitch substitution with the planned pair preselected",
    (teamId) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const [positionId, outPlayerId] = Object.entries(game.assignments)[1];
      const outgoing = team.roster.find((player) => player.id === outPlayerId)!;
      const incoming = team.roster.find(
        (player) => player.id === game.benchIds[0],
      )!;
      const replacement = team.roster.find(
        (player) => player.id === game.benchIds[1],
      )!;
      fireEvent.click(
        screen.getByRole("button", {
          name: `Plan substitution for ${outgoing.name}`,
        }),
      );
      let picker = screen.getByRole("dialog", {
        name: `${outgoing.name} #${outgoing.number} Plan out`,
      });
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(`^${incoming.name} #`),
        }),
      );
      fireEvent.click(
        within(picker).getByRole("button", { name: "Add to plan" }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const queued = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      expect(queued.activeGame!.queuedSubstitutions).toEqual([
        { positionId, outPlayerId, inPlayerId: incoming.id },
      ]);
      expect(queued.activeGame!.assignments).toEqual(game.assignments);
      expect(queued.activeGame!.history).toEqual(game.history);

      const openPlanned = () =>
        fireEvent.click(
          screen.getByRole("button", {
            name: `Plan substitution for ${outgoing.name}. Scheduled out for ${incoming.name}`,
          }),
        );
      openPlanned();
      picker = screen.getByRole("dialog", {
        name: `${outgoing.name} #${outgoing.number} Plan out`,
      });
      expect(picker).toHaveTextContent(
        `In this planScheduled out for ${incoming.name}`,
      );
      expect(
        within(picker).getByRole("button", {
          name: new RegExp(`^${incoming.name} #`),
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(picker).getByRole("button", { name: "Update plan" }),
      ).toBeDisabled();
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(`^${replacement.name} #`),
        }),
      );
      expect(picker).toHaveTextContent(
        `In this planScheduled out for ${replacement.name}`,
      );
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(queued);
      fireEvent.click(within(picker).getByRole("button", { name: "Close" }));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(queued);

      openPlanned();
      picker = screen.getByRole("dialog", {
        name: `${outgoing.name} #${outgoing.number} Plan out`,
      });
      expect(
        within(picker).getByRole("button", {
          name: new RegExp(`^${incoming.name} #`),
        }),
      ).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(
        within(picker).getByRole("button", {
          name: new RegExp(`^${replacement.name} #`),
        }),
      );
      fireEvent.click(
        within(picker).getByRole("button", { name: "Update plan" }),
      );
      const updated = JSON.parse(
        localStorage.getItem(STORAGE_KEY)!,
      ) as AppState;
      expect(updated.activeGame!.queuedSubstitutions).toEqual([
        { positionId, outPlayerId, inPlayerId: replacement.id },
      ]);
      expect(updated.activeGame!.assignments).toEqual(game.assignments);
      expect(updated.activeGame!.history).toEqual(game.history);
      expect(
        screen.getByRole("button", {
          name: `Plan substitution for ${outgoing.name}. Scheduled out for ${replacement.name}`,
        }),
      ).toBeInTheDocument();
    },
  );

  it.each([
    ["u8", "in", false],
    ["u8", "out", false],
    ["u12", "in", false],
    ["u12", "out", false],
    ["u8", "in", true],
    ["u8", "out", true],
    ["u12", "in", true],
    ["u12", "out", true],
  ] as const)(
    "previews and saves scheduled-player replacement in %s Plan %s (editing: %s)",
    (teamId, direction, editing) => {
      const state = structuredClone(INITIAL_STATE);
      const team = state.teams[teamId];
      const game = createGame(
        team,
        team.defaultFormationId,
        team.roster.map((player) => player.id),
        team.defaultDurationMinutes,
        1_000,
      );
      const [positionId, outPlayerId] = Object.entries(game.assignments)[0];
      const inPlayerId = game.benchIds[0];
      game.queuedSubstitutions = [{ positionId, outPlayerId, inPlayerId }];
      const [otherPositionId, otherOutPlayerId] = Object.entries(
        game.assignments,
      )[1];
      const otherInPlayerId = game.benchIds[1];
      if (editing) {
        game.queuedSubstitutions.push({
          positionId: otherPositionId,
          outPlayerId: otherOutPlayerId,
          inPlayerId: otherInPlayerId,
        });
      }
      state.activeGame = game;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      const targetId =
        direction === "in"
          ? game.benchIds[1]
          : Object.values(game.assignments)[1];
      const target = team.roster.find((player) => player.id === targetId)!;
      fireEvent.click(
        screen.getByRole("button", {
          name:
            direction === "in"
              ? editing
                ? `Edit ${target.name} going in`
                : `Plan ${target.name} in`
              : new RegExp(`^Plan substitution for ${target.name}(\\.|$)`),
        }),
      );
      const picker = screen.getByRole("dialog", {
        name: `${target.name} #${target.number} Plan ${direction}`,
      });
      const heading = within(picker).getByRole("heading", {
        name: direction === "in" ? "Already going out" : "Already going in",
      });
      const scheduledId = direction === "in" ? outPlayerId : inPlayerId;
      const scheduled = team.roster.find(
        (player) => player.id === scheduledId,
      )!;
      const choice = within(picker).getByRole("button", {
        name: new RegExp(`^${scheduled.name} #`),
      });
      const groupHeader = heading.closest(".scheduled-choices-header")!;
      expect(groupHeader.nextElementSibling).toBe(choice);
      expect(groupHeader.previousElementSibling?.tagName).toBe("BUTTON");
      expect(groupHeader).toHaveTextContent("Replaces existing pairings.");
      expect(choice).toBeEnabled();
      expect(choice).toHaveTextContent(
        direction === "in" ? "Scheduled out for" : "Scheduled in for",
      );
      const before = localStorage.getItem(STORAGE_KEY);
      expect(
        within(picker).queryByText(/^This leaves/),
      ).not.toBeInTheDocument();
      fireEvent.click(choice);
      expect(choice).toHaveAttribute("aria-pressed", "true");
      const fieldId =
        direction === "out" ? outPlayerId : editing ? otherOutPlayerId : null;
      const benchId =
        direction === "in" ? inPlayerId : editing ? otherInPlayerId : null;
      const outcomes = [
        ...(fieldId
          ? [
              `${team.roster.find((player) => player.id === fieldId)!.name} on the field`,
            ]
          : []),
        ...(benchId
          ? [
              `${team.roster.find((player) => player.id === benchId)!.name} on the bench`,
            ]
          : []),
      ];
      const impactText = `This leaves ${outcomes.join(" and ")}.`;
      expect(within(picker).getByText(impactText)).toHaveAttribute(
        "role",
        "status",
      );
      expect(
        within(picker).getByText(impactText).closest("dd"),
      ).not.toHaveClass("warm");
      const saveLabel = editing ? "Update plan" : "Add to plan";
      expect(
        within(picker).getByRole("button", { name: saveLabel }),
      ).toBeEnabled();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
      fireEvent.click(within(picker).getByRole("button", { name: saveLabel }));
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
      const replacementOutId = direction === "in" ? outPlayerId : targetId;
      const replacementPositionId = Object.entries(game.assignments).find(
        ([, id]) => id === replacementOutId,
      )![0];
      expect(saved.activeGame!.queuedSubstitutions).toEqual([
        {
          positionId: replacementPositionId,
          outPlayerId: replacementOutId,
          inPlayerId: direction === "in" ? targetId : inPlayerId,
        },
      ]);
      expect(saved.activeGame!.assignments).toEqual(game.assignments);
      expect(saved.activeGame!.benchIds).toEqual(game.benchIds);
    },
  );

  it("queues an on-field player out by choosing an incoming bench player", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    const simonButton = screen.getByRole("button", { name: "Plan Simon out" });
    expect(simonButton.tagName).toBe("BUTTON");
    expect(simonButton).toHaveAccessibleDescription(/Simon.*Striker/);
    expect(simonButton.querySelector("button, svg")).not.toBeInTheDocument();
    fireEvent.click(within(simonButton).getByText("Simon"));
    const picker = screen.getByRole("dialog", { name: /Simon #10 Plan out/ });
    expect(
      within(picker).queryByRole("heading", { name: "Already going in" }),
    ).not.toBeInTheDocument();
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
    expect(simonRow).toHaveTextContent("Scheduled out for Dylan");
    expect(
      simonRow?.querySelector(".bench-queue-status .lucide-arrow-right-left"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(
        screen.getByRole("button", {
          name: "Edit planned substitution for Simon out",
        }),
      ).getByText("Simon"),
    );
    const editPicker = screen.getByRole("dialog", {
      name: /Simon #10 Plan out/,
    });
    expect(
      within(editPicker).queryByRole("heading", {
        name: "Already going in",
      }),
    ).not.toBeInTheDocument();
    expect(editPicker).toHaveTextContent("In this planScheduled out for Dylan");
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
      name: "Ollie #23 Plan out",
    });
    const alreadyPlannedIncoming = within(otherPicker).getByRole("button", {
      name: /Dylan/,
    });
    expect(alreadyPlannedIncoming).toHaveTextContent("Scheduled in for Simon");
    expect(
      alreadyPlannedIncoming.querySelector(
        ".replacement-player-status.incoming-status .lucide-arrow-right-left",
      ),
    ).toBeInTheDocument();
  });

  it("opens positions and removal directly from an on-field row without planning a sub", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    expect(
      screen.queryByRole("button", { name: "More actions for Simon" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Change positions for Simon" }),
    );
    const positions = screen.getByRole("dialog", {
      name: "Simon #10 Change position",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(within(positions).getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Take Simon out of game" }),
    );
    const confirmation = screen.getByRole("alertdialog", {
      name: "Take Simon out of game?",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Keep player" }),
    );
    expect(
      screen.getByRole("button", { name: "Plan Simon out" }),
    ).toBeInTheDocument();
  });

  it("keeps field positions and removal available when there is no bench", () => {
    const state = structuredClone(INITIAL_STATE);
    const team = state.teams.u8;
    state.activeGame = createGame(
      team,
      "5-1-2-1",
      team.roster.slice(0, 5).map((player) => player.id),
      40,
      1_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));

    const simonRow = screen.getByRole("button", { name: "Plan Simon out" });
    expect(simonRow).toBeDisabled();
    fireEvent.click(simonRow);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take Simon out of game" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Change positions for Simon" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Simon #10 Change position" }),
    ).toBeInTheDocument();
  });

  it("calls out drag-and-drop position changes in both live entry points", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      screen.getByText(/Tap a player to plan a substitution.*drag.*position/),
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
      4,
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
      within(breakBanner).getByRole("button", { name: "Create plan" }),
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
      4,
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
      within(addedTimeBanner).getByRole("button", { name: "Create plan" }),
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
      within(compactHeader as HTMLElement).getByText("+0:04"),
    ).toBeInTheDocument();
    expect(document.querySelector(".clock-secondary strong")).toHaveTextContent(
      "+0:04",
    );
    expect(
      document.querySelector(".clock-secondary strong"),
    ).not.toHaveTextContent("added");
    expect(
      within(compactHeader as HTMLElement)
        .getByText("+0:04")
        .closest(".compact-match-clock"),
    ).toHaveClass("added-time");
    expect(
      compactHeader?.querySelector(".compact-match-score")?.nextElementSibling,
    ).toHaveClass("compact-match-management");
    expect(
      compactHeader?.querySelector(".compact-match-timing")?.firstElementChild,
    ).toHaveClass("compact-match-period");
    expect(
      compactHeader?.querySelector(".compact-clock-glyph"),
    ).not.toBeInTheDocument();

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
      "10:00",
    );
    expect(
      within(compactHeader as HTMLElement).getByText("10:00"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Game timeline")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record a goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Opponent scored" }));
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
      "20:00",
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

  it("identifies an interrupted added-time game on direct resume", () => {
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
      4,
    );
    game.clock = {
      elapsedSeconds: 9 * 60 + 59,
      running: true,
      lastStartedAt: 1_000,
    };
    state.activeGame = game;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    render(<App />);
    expect(
      screen.queryByRole("heading", { name: "Which team is playing?" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quarter 1 time reached")).toHaveTextContent(
      "+0:04 added time · Clock running",
    );
    expect(screen.getByLabelText("Game clock, running")).toHaveTextContent(
      "10:04",
    );
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
      4,
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
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
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
    expect(summary).toHaveTextContent("Malik #9");
    expect(screen.getByText("Simon out of game")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: / Change position/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the assigned position when an available player fills an open slot", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    ["Dylan", "Henry", "Haru", "Evan", "Collier"].forEach((name) => {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`${name} Present`) }),
      );
    });
    startGame();
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
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
    expect(summary).toHaveTextContent("Simon #10");
    expect(summary).toHaveTextContent("POSITION");
    expect(summary).toHaveTextContent("Left Midfielder");
  });

  it("keeps substitution direction styling out of the live toolbar", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    startGame();

    expect(
      container.querySelector(".mobile-control-dock .swap-transfer"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect(
      screen
        .getByRole("dialog", { name: "Substitution plan" })
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
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
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

    localStorage.removeItem(COACH_ID_STORAGE_KEY);
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
