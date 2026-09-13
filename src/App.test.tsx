import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { STORAGE_KEY } from "./storage";

describe("Sideline app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

    const markAvailable = screen.getByRole("button", {
      name: "Mark Evan available",
    });
    expect(markAvailable).toBeInTheDocument();
    fireEvent.click(markAvailable);

    expect(
      screen.queryByRole("button", { name: "Mark Evan available" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Evan")).toBeInTheDocument();
  });

  it("opens U12 setup directly without configurable duration or format", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Fireballers"));

    expect(
      screen.getByRole("heading", { name: "Prepare game" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Game duration")).not.toBeInTheDocument();
    expect(screen.queryByText("Game format")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "3-1-3-1 formation",
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Jackson Present/i }),
    ).toBeInTheDocument();
  });

  it("restores an active game immediately after a reload", () => {
    const firstRender = render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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

  it("shows current assignments in both position-change selectors", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    fireEvent.click(screen.getByRole("button", { name: "Positions" }));

    expect(
      screen.getByRole("option", { name: "Simon (Goalkeeper)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "(Goalkeeper) Simon" }),
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
