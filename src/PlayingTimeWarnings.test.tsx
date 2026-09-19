import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { COACH_ID_STORAGE_KEY } from "./coaches";
import {
  applySubstitutions,
  queueSubstitutions,
  setClockRunning,
} from "./domain";
import { STORAGE_KEY } from "./storage";
import { lateHaruGame } from "./test/playingTimeFixtures";

describe("playing-time safeguards", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    localStorage.setItem(COACH_ID_STORAGE_KEY, "brian");
  });
  afterEach(() => vi.useRealTimers());

  it("shows actionable guest deficits independently of the roster tab", () => {
    const { state } = lateHaruGame();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const notice = screen.getByRole("region", { name: "Playing-time warning" });
    const haru = within(notice).getByText("Haru").closest("li")!;
    expect(haru).toHaveTextContent("7 min played");
    expect(haru).toHaveTextContent("needs about 12 min more by full time");
    fireEvent.click(screen.getByRole("tab", { name: /On field/ }));
    expect(notice).toBeVisible();
    fireEvent.click(
      within(haru).getByRole("button", { name: "Plan more time for Haru" }),
    );
    expect(
      screen.getByRole("dialog", { name: /Haru.*Plan in/ }),
    ).toBeInTheDocument();
  });

  it("keeps both the bench warning and the queued status, with a direct review action", () => {
    const { state, game, guest, positionId, originalPlayerId } =
      lateHaruGame(38);
    state.activeGame = queueSubstitutions(game, [
      {
        positionId,
        outPlayerId: originalPlayerId,
        inPlayerId: guest.id,
      },
    ]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const bench = screen.getByRole("button", { name: "Edit Haru going in" });
    expect(bench).toHaveTextContent("Scheduled in at");
    expect(bench).toHaveTextContent("Below 40% pace");
    const notice = screen.getByRole("region", { name: "Playing-time warning" });
    expect(within(notice).getByRole("heading")).toHaveTextContent(
      "time is running out",
    );
    expect(within(notice).getByText("Haru").closest("li")).toHaveTextContent(
      "Queued, but still on the bench",
    );
    fireEvent.click(
      within(notice).getByRole("button", {
        name: "Review Haru's substitution",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Substitution plan (1)" }),
    ).toBeInTheDocument();
  });

  it("does not hide the deficit when the underplayed player enters the field", () => {
    const { state, game, guest, positionId, originalPlayerId } =
      lateHaruGame(38);
    state.activeGame = applySubstitutions(
      game,
      [
        {
          positionId,
          outPlayerId: originalPlayerId,
          inPlayerId: guest.id,
        },
      ],
      5,
      4_000,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    const notice = screen.getByRole("region", { name: "Playing-time warning" });
    const haru = within(notice).getByText("Haru").closest("li")!;
    expect(haru).toHaveTextContent("7 min played");
    expect(haru).toHaveTextContent("On field — keep playing to catch up");
    expect(within(haru).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["bench", "queued", "field"])(
    "warns on end with Haru %s, allows cancellation, and permits a deliberate finish",
    (location) => {
      const { state, game, guest, positionId, originalPlayerId } =
        lateHaruGame(50);
      const pairs = [
        { positionId, outPlayerId: originalPlayerId, inPlayerId: guest.id },
      ];
      if (location === "queued")
        state.activeGame = queueSubstitutions(game, pairs);
      if (location === "field")
        state.activeGame = applySubstitutions(game, pairs, 5, 4_000);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render(<App />);
      fireEvent.click(screen.getAllByRole("button", { name: "End game" })[0]);
      const dialog = screen.getByRole("alertdialog", {
        name: "End this game?",
      });
      expect(dialog).toHaveAccessibleDescription(/below minimum playing time/);
      const warnings = within(dialog).getByRole("region", {
        name: "End-game playing time",
      });
      const haru = within(warnings).getByText("Haru").closest("li")!;
      expect(haru).toHaveTextContent("7 min played");
      expect(haru).toHaveTextContent("minimum 18:48");
      expect(warnings).toHaveTextContent(
        "You can still end the game if play is over.",
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Continue game" }),
      );
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame,
      ).not.toBeNull();
      fireEvent.click(screen.getAllByRole("button", { name: "End game" })[0]);
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "End game",
        }),
      );
      expect(
        JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame,
      ).toBeNull();
      expect(
        screen.getByRole("heading", { name: "Game summary" }),
      ).toBeInTheDocument();
    },
  );

  it("includes guest deficits when ending from the coach recovery screen", () => {
    const { state } = lateHaruGame(50);
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "End Golden Dragons game" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "End Golden Dragons game?",
    });
    const haru = within(dialog).getByText("Haru").closest("li")!;
    expect(haru).toHaveTextContent("7 min played");
    expect(haru).toHaveTextContent("minimum 18:48");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep game" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame,
    ).not.toBeNull();
  });

  it("updates an open end-game check from the running clock, including coach recovery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    const { state, game, guest, positionId, originalPlayerId } =
      lateHaruGame(38);
    const entered = applySubstitutions(
      game,
      [
        {
          positionId,
          outPlayerId: originalPlayerId,
          inPlayerId: guest.id,
        },
      ],
      5,
      4_000,
    );
    state.activeGame = setClockRunning(entered, true, 4_000);
    localStorage.removeItem(COACH_ID_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "End Golden Dragons game" }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Haru").closest("li")).toHaveTextContent(
      "7 min played",
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(within(dialog).getByText("Haru").closest("li")).toHaveTextContent(
      "8 min played",
    );
  });

  it("selects two 25-minute halves by default and keeps alternative U8 formats available", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Formation" }));
    expect(screen.getByLabelText("Game format")).toHaveValue("halves-25");
    expect(
      screen.getByRole("option", { name: "4 quarters · 10:00 each" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "2 halves · 20:00 each" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Starters" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).activeGame,
    ).toMatchObject({
      durationSeconds: 3000,
      periodCount: 2,
    });
  });
});
