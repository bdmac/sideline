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
      screen.queryByRole("option", { name: "(Goalkeeper) Simon" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "(Center Back) Noah" }),
    ).toBeInTheDocument();
  });

  it("updates position targets when the selected player changes", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

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

  it("shows a numbered substitution summary after confirmation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));
    expect(
      screen.getByRole("button", { name: "Confirm 4 swaps" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm 4 swaps" }));

    const summary = screen.getByRole("dialog", {
      name: "Substitution ready",
    });
    expect(summary).toHaveTextContent("OUT");
    expect(summary).toHaveTextContent("#10 Simon");
    expect(summary).toHaveTextContent("IN");
    expect(summary).toHaveTextContent("#4 Dylan");
  });

  it("allows the coach to reduce the default full-bench rotation", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan subs" }));

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(
      screen.getByRole("button", { name: "Confirm 1 swap" }),
    ).toBeInTheDocument();
  });

  it("shows the effective substitution after an on-field player becomes unavailable", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Golden Dragons"));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));

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
