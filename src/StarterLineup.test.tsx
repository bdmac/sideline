import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StarterLineup } from "./StarterLineup";
import { assignPlayerToPosition, getFormation } from "./domain";
import type { Player } from "./types";

const players: Player[] = [
  {
    id: "keeper",
    name: "Keeper",
    active: true,
    preferredRoles: ["goalkeeper"],
  },
  {
    id: "defender",
    name: "Defender",
    active: true,
    preferredRoles: ["defender"],
  },
  {
    id: "reserve",
    name: "Reserve",
    active: true,
    preferredRoles: ["goalkeeper", "forward"],
  },
];
const formation = getFormation("5-1-2-1");
const keeper = formation.positions.find((p) => p.role === "goalkeeper")!;
const defender = formation.positions.find((p) => p.role === "defender")!;
const empty = formation.positions.find((p) => p.role === "midfielder")!;

function setup(extraPlayers: Player[] = []) {
  const choose = vi.fn();
  const move = vi.fn();
  function Fixture() {
    const [assignments, setAssignments] = useState({
      [keeper.id]: "keeper",
      [defender.id]: "defender",
    });
    return (
      <StarterLineup
        formation={formation}
        assignments={assignments}
        players={[...players, ...extraPlayers]}
        onChoosePosition={choose}
        onMove={(id, target) => {
          move(id, target);
          setAssignments((current) =>
            assignPlayerToPosition(current, target, id),
          );
        }}
      />
    );
  }
  const result = render(<Fixture />);
  const target = screen.getByRole("button", {
    name: `Change Defender at ${defender.label}`,
  });
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    left: 200,
    right: 300,
    top: 200,
    bottom: 260,
    width: 100,
    height: 60,
    x: 200,
    y: 200,
    toJSON: () => ({}),
  });
  return { ...result, choose, move, target };
}

function pointer(element: HTMLElement, type: string, x: number, y: number) {
  fireEvent(
    element,
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }),
  );
}

describe("starter lineup interactions", () => {
  afterEach(() => vi.useRealTimers());
  it.each(["no bench", "outfield bench", "keeper reserve"] as const)(
    "keeps outfield keeper options free of reserve labels and warnings with %s",
    (attendance) => {
      const forward = formation.positions.find((p) => p.role === "forward")!;
      const attending = players.filter((p) => p.id !== "defender");
      if (attendance === "outfield bench") attending.push(players[1]);
      if (attendance === "keeper reserve")
        attending.push({
          id: "backup",
          name: "Backup",
          active: true,
          preferredRoles: ["goalkeeper"],
        });
      render(
        <StarterLineup
          formation={formation}
          assignments={{ [keeper.id]: "keeper", [forward.id]: "reserve" }}
          players={attending}
          onChoosePosition={vi.fn()}
          onMove={vi.fn()}
        />,
      );
      const option = screen.getByRole("button", {
        name: `Change Reserve at ${forward.label}`,
      });
      expect(option.querySelector(".starter-keeper-option")).toBeNull();
      expect(option).not.toHaveAccessibleDescription(/Goalkeeper option/);
      expect(document.querySelectorAll(".starter-keeper-option")).toHaveLength(
        0,
      );
      expect(document.querySelector(".starter-player-warning")).toBeNull();
      expect(
        screen.queryByRole("status", { name: "Goalkeeper reserve" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/No backup goalkeeper/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/rest.*goalkeeper/i)).not.toBeInTheDocument();
    },
  );

  it("still marks a missing starting goalkeeper without a reserve banner", () => {
    render(
      <StarterLineup
        formation={formation}
        assignments={{}}
        players={players.slice(1, 2)}
        onChoosePosition={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    const position = screen.getByRole("button", {
      name: `Assign player at ${keeper.label}`,
    });
    expect(position).toHaveAccessibleDescription(/Lineup warning/);
    expect(
      position.querySelector(".starter-player-warning"),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".starter-player-warning")).toHaveLength(
      1,
    );
    expect(screen.queryByText(/No backup goalkeeper/)).not.toBeInTheDocument();
  });

  it("shows feedback inside the pitch only while hovering a valid drag destination", () => {
    const { move } = setup();
    const source = screen.getByRole("button", {
      name: "Place Reserve on the starting pitch",
    });
    pointer(source, "pointerdown", 50, 400);
    pointer(source, "pointermove", 100, 350);
    expect(document.querySelector(".player-drag-preview")).toBeInTheDocument();
    expect(document.querySelector(".player-drag-feedback")).toBeNull();
    expect(screen.queryByText(/Drop on/)).not.toBeInTheDocument();
    pointer(source, "pointermove", 250, 230);
    const feedback = document.querySelector(".player-drag-feedback");
    expect(feedback).toBeInTheDocument();
    expect(feedback?.parentElement).toHaveClass("starter-pitch");
    pointer(source, "pointermove", 100, 350);
    expect(document.querySelector(".player-drag-feedback")).toBeNull();
    pointer(source, "pointerup", 100, 350);
    expect(move).not.toHaveBeenCalled();
  });

  it.each(["mouse", "touch"])(
    "swaps a pitch player with a bench player on %s drop",
    (pointerType) => {
      vi.useFakeTimers();
      const { move, choose, target: source } = setup();
      const benchPlayer = screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      });
      vi.spyOn(benchPlayer, "getBoundingClientRect").mockReturnValue({
        x: 20,
        y: 400,
        left: 20,
        right: 120,
        top: 400,
        bottom: 450,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      });
      const dispatch = (type: string, x: number, y: number) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        Object.defineProperty(event, "pointerType", { value: pointerType });
        fireEvent(source, event);
      };
      dispatch("pointerdown", 250, 230);
      if (pointerType === "touch") act(() => vi.advanceTimersByTime(200));
      dispatch("pointermove", 70, 425);
      expect(benchPlayer).toHaveClass("starter-drop-target");
      expect(
        document.querySelector(".player-drag-feedback-row"),
      ).toHaveTextContent("DefenderBench");
      expect(benchPlayer).toHaveAccessibleDescription(
        /Reserve.*Defender.*Starting bench/,
      );
      expect(move).not.toHaveBeenCalled();
      dispatch("pointerup", 70, 425);
      fireEvent.click(source);
      expect(move).toHaveBeenCalledExactlyOnceWith("reserve", defender.id);
      expect(choose).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", {
          name: `Change Reserve at ${defender.label}`,
        }),
      ).toHaveFocus();
      expect(
        screen.getByRole("button", {
          name: "Place Defender on the starting pitch",
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Place Reserve on the starting pitch",
        }),
      ).not.toBeInTheDocument();
      expect(
        document.querySelectorAll(".starter-slot:not(.empty)"),
      ).toHaveLength(2);
    },
  );

  it.each(["pointercancel", "outside", "escape"])(
    "cancels a pitch-to-bench drag on %s without swapping",
    (reason) => {
      const { move, target: source } = setup();
      const benchPlayer = screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      });
      vi.spyOn(benchPlayer, "getBoundingClientRect").mockReturnValue({
        x: 20,
        y: 400,
        left: 20,
        right: 120,
        top: 400,
        bottom: 450,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      });
      pointer(source, "pointerdown", 250, 230);
      pointer(source, "pointermove", 70, 425);
      expect(benchPlayer).toHaveClass("starter-drop-target");
      if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
      else
        pointer(source, reason === "outside" ? "pointerup" : reason, 150, 470);
      expect(benchPlayer).not.toHaveClass("starter-drop-target");
      expect(move).not.toHaveBeenCalled();
    },
  );

  it("does not treat another bench player as a destination for a bench drag", () => {
    const { move } = setup([
      { id: "extra", name: "Extra", active: true, preferredRoles: [] },
    ]);
    const extra = screen.getByRole("button", {
      name: "Place Extra on the starting pitch",
    });
    vi.spyOn(extra, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 400,
      left: 20,
      right: 120,
      top: 400,
      bottom: 450,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    });
    const source = screen.getByRole("button", {
      name: "Place Reserve on the starting pitch",
    });
    pointer(source, "pointerdown", 200, 425);
    pointer(source, "pointermove", 70, 425);
    expect(extra).not.toHaveClass("starter-drop-target");
    pointer(source, "pointerup", 70, 425);
    expect(move).not.toHaveBeenCalled();
  });

  it.each(["pitch", "bench", "outside"] as const)(
    "dismisses a bench selection by tapping the %s without changing assignments",
    (area) => {
      const { move } = setup();
      const source = screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      });
      fireEvent.click(source);
      const target =
        area === "outside"
          ? document.body
          : document.querySelector(
              area === "pitch" ? ".pitch-halfway" : ".starter-bench > strong",
            )!;
      fireEvent.pointerDown(target);
      expect(source).toHaveAttribute("aria-pressed", "false");
      expect(move).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Cancel selection" }),
      ).not.toBeInTheDocument();
    },
  );

  it("allows switching bench selection and then tapping a pitch player to place them", () => {
    const { move, target } = setup([
      {
        id: "extra",
        name: "Extra",
        active: true,
        preferredRoles: ["defender"],
      },
    ]);
    const reserve = screen.getByRole("button", {
      name: "Place Reserve on the starting pitch",
    });
    const extra = screen.getByRole("button", {
      name: "Place Extra on the starting pitch",
    });
    fireEvent.click(reserve);
    fireEvent.pointerDown(extra);
    fireEvent.click(extra);
    expect(reserve).toHaveAttribute("aria-pressed", "false");
    expect(extra).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(target);
    fireEvent.click(target);
    expect(move).toHaveBeenCalledExactlyOnceWith("extra", defender.id);
  });

  it("does not swallow another control's action when dismissing selection", () => {
    const { move } = setup();
    const action = vi.fn();
    render(<button onClick={action}>Other action</button>);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    );
    const control = screen.getByRole("button", { name: "Other action" });
    fireEvent.pointerDown(control);
    fireEvent.click(control);
    expect(action).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the pitch free of notes panels, including during bench selection", () => {
    setup();
    expect(document.querySelector(".starter-guidance")).toBeNull();
    expect(document.querySelector(".starter-player-warning")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    );
    expect(document.querySelector(".starter-guidance")).toBeNull();
    expect(
      screen.getByText("Reserve selected. Choose a position."),
    ).toHaveClass("sr-only");
    fireEvent.pointerDown(document.body);
    expect(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector(".starter-player-warning")).toBeNull();
  });

  it("marks an affected player and opens their existing picker through the warning icon", async () => {
    const { choose, target } = setup();
    const source = screen.getByRole("button", {
      name: "Place Reserve on the starting pitch",
    });
    pointer(source, "pointerdown", 50, 400);
    pointer(source, "pointermove", 250, 230);
    pointer(source, "pointerup", 250, 230);
    expect(target).toHaveAccessibleDescription(/Lineup warning/);
    const icon = target.querySelector(".starter-player-warning");
    expect(icon).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    act(() => target.focus());
    expect(target).toHaveFocus();
    fireEvent.click(icon!);
    expect(choose).toHaveBeenCalledWith(defender.id);
  });

  it.each(
    ["bench", "pitch"].flatMap((origin) =>
      ["hold", "swipe", "tap"].map((gesture) => ({ origin, gesture })),
    ),
  )(
    "uses touch $gesture on a $origin player without accidental drags",
    ({ origin, gesture }) => {
      vi.useFakeTimers();
      try {
        const { move, choose } = setup();
        const source = screen.getByRole("button", {
          name:
            origin === "bench"
              ? "Place Reserve on the starting pitch"
              : `Change Keeper at ${keeper.label}`,
        });
        expect(document.querySelector(".starter-bench-grip")).toBeNull();
        const touchPointer = (type: string, x: number, y: number) => {
          const event = new MouseEvent(type, {
            bubbles: true,
            button: 0,
            clientX: x,
            clientY: y,
          });
          Object.defineProperty(event, "pointerType", { value: "touch" });
          fireEvent(source, event);
        };
        touchPointer("pointerdown", 50, 400);
        act(() => vi.advanceTimersByTime(199));
        expect(document.querySelector(".player-drag-preview")).toBeNull();
        if (gesture === "hold") {
          act(() => vi.advanceTimersByTime(1));
          expect(
            document.querySelector(".player-drag-preview"),
          ).toBeInTheDocument();
          touchPointer("pointermove", 250, 230);
          const touchMove = new Event("touchmove", {
            bubbles: true,
            cancelable: true,
          });
          fireEvent(source, touchMove);
          expect(touchMove.defaultPrevented).toBe(true);
          touchPointer("pointerup", 250, 230);
          expect(move).toHaveBeenCalledExactlyOnceWith(
            origin === "bench" ? "reserve" : "keeper",
            defender.id,
          );
        } else if (gesture === "swipe") {
          touchPointer("pointermove", 50, 350);
          act(() => vi.advanceTimersByTime(300));
          const touchMove = new Event("touchmove", {
            bubbles: true,
            cancelable: true,
          });
          fireEvent(source, touchMove);
          expect(touchMove.defaultPrevented).toBe(false);
          expect(document.querySelector(".player-drag-preview")).toBeNull();
          expect(move).not.toHaveBeenCalled();
        } else {
          touchPointer("pointerup", 50, 400);
          fireEvent.click(source);
          act(() => vi.advanceTimersByTime(300));
          if (origin === "bench")
            expect(source).toHaveAttribute("aria-pressed", "true");
          else expect(choose).toHaveBeenCalledExactlyOnceWith(keeper.id);
          expect(document.querySelector(".player-drag-preview")).toBeNull();
          expect(move).not.toHaveBeenCalled();
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("previews both players in a field swap without changing the lineup until release", () => {
    const { move, target } = setup();
    const source = screen.getByRole("button", {
      name: `Change Keeper at ${keeper.label}`,
    });
    pointer(source, "pointerdown", 50, 50);
    pointer(source, "pointermove", 250, 230);
    expect(document.querySelector(".player-drag-preview")).toHaveStyle({
      left: "250px",
      top: "230px",
    });
    expect(source).toHaveClass("starter-drag-source");
    expect(source.style.transform).toBe("");
    expect(move).not.toHaveBeenCalled();
    expect(
      screen.getByText(`Keeper → ${defender.label} · Outside preferences`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Defender → ${keeper.label} · Outside preferences`),
    ).toBeInTheDocument();
    expect(target).toHaveClass("starter-drop-target");
    const feedback = document.querySelector(".player-drag-feedback");
    expect(
      feedback?.querySelector(".player-drag-feedback-row"),
    ).toHaveTextContent(`Keeper${defender.label}`);
    expect(feedback).toHaveTextContent(`Keeper${defender.label}Not preferred`);
    expect(feedback).toHaveTextContent(`Defender${keeper.label}Not preferred`);
    expect(feedback).not.toHaveTextContent("goalkeeper on the bench");
    pointer(source, "pointerup", 250, 230);
    expect(move).toHaveBeenCalledExactlyOnceWith("keeper", defender.id);
    expect(document.querySelector(".player-drag-feedback")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: `Change Keeper at ${defender.label}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Change Defender at ${keeper.label}`,
      }),
    ).toHaveAccessibleDescription(/Lineup warning/);
  });

  it("drops the last bench keeper without reserve warnings or shifting pitch slots", () => {
    const { move, choose, target } = setup();
    const source = screen.getByRole("button", {
      name: "Place Reserve on the starting pitch",
    });
    const slotStyle = target.getAttribute("style");
    pointer(source, "pointerdown", 50, 400);
    pointer(source, "pointermove", 250, 230);
    expect(screen.queryByText(/No backup goalkeeper/)).not.toBeInTheDocument();
    expect(document.querySelector(".player-drag-preview")).toHaveStyle({
      left: "250px",
      top: "230px",
    });
    expect(target).toHaveAttribute("style", slotStyle);
    expect(screen.getByText("Defender → Starting bench")).toBeInTheDocument();
    expect(
      document.querySelector(".player-drag-feedback"),
    ).not.toHaveTextContent("Uses the last goalkeeper on the bench.");
    expect(document.querySelector(".player-drag-feedback")).toHaveTextContent(
      `Reserve${defender.label}Not preferred`,
    );
    expect(document.querySelector(".player-drag-feedback")).toHaveTextContent(
      "DefenderBench",
    );
    expect(move).not.toHaveBeenCalled();
    pointer(source, "pointerup", 250, 230);
    fireEvent.click(source);
    expect(choose).not.toHaveBeenCalled();
    expect(move).toHaveBeenCalledExactlyOnceWith("reserve", defender.id);
    expect(
      screen.getByRole("button", {
        name: `Change Keeper at ${keeper.label}`,
      }),
    ).not.toHaveAccessibleDescription(/Lineup warning/);
    expect(target).toHaveAttribute("style", slotStyle);
    expect(
      screen.queryByText("No backup goalkeeper on the bench."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Place Defender on the starting pitch",
      }),
    ).toBeInTheDocument();
    const reserveOnField = screen.getByRole("button", {
      name: `Change Reserve at ${defender.label}`,
    });
    expect(
      reserveOnField.querySelector(".starter-player-warning"),
    ).toBeInTheDocument();
    expect(reserveOnField.querySelector(".starter-keeper-option")).toBeNull();
    expect(reserveOnField).not.toHaveAccessibleDescription(/Goalkeeper option/);
    expect(
      screen.queryByRole("status", { name: "Goalkeeper reserve" }),
    ).not.toBeInTheDocument();
    const benchedDefender = screen.getByRole("button", {
      name: "Place Defender on the starting pitch",
    });
    pointer(benchedDefender, "pointerdown", 50, 400);
    pointer(benchedDefender, "pointermove", 250, 230);
    pointer(benchedDefender, "pointerup", 250, 230);
    expect(
      screen.queryByRole("status", { name: "Goalkeeper reserve" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".starter-keeper-option")).toBeNull();
  });

  it.each(["outside", "pointercancel", "lostpointercapture", "escape", "blur"])(
    "cancels a %s drag without changing assignments",
    (reason) => {
      const { move, target } = setup();
      const source = screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      });
      pointer(source, "pointerdown", 50, 400);
      pointer(source, "pointermove", 250, 230);
      if (reason === "outside") pointer(source, "pointerup", 500, 500);
      else if (reason === "escape")
        fireEvent.keyDown(window, { key: "Escape" });
      else if (reason === "blur") fireEvent(window, new Event("blur"));
      else pointer(source, reason, 250, 230);
      expect(move).not.toHaveBeenCalled();
      expect(target).not.toHaveClass("starter-drop-target");
      expect(
        document.querySelector(".player-drag-preview"),
      ).not.toBeInTheDocument();
      expect(document.querySelector(".player-drag-feedback")).toBeNull();
    },
  );

  it("retains tap-to-choose and supports focus-based bench placement without dragging", () => {
    const { choose, move } = setup();
    const target = screen.getByRole("button", {
      name: `Change Defender at ${defender.label}`,
    });
    pointer(target, "pointerdown", 250, 230);
    pointer(target, "pointerup", 252, 230);
    fireEvent.click(target);
    expect(choose).toHaveBeenCalledWith(defender.id);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    );
    act(() => target.focus());
    expect(screen.queryByText(/No backup goalkeeper/)).not.toBeInTheDocument();
    expect(target).toHaveAccessibleDescription(
      /Reserve.*Outside preferences.*Defender.*Starting bench/,
    );
    fireEvent.click(target);
    expect(move).toHaveBeenCalledExactlyOnceWith("reserve", defender.id);
    expect(target).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Cancel selection" }),
    ).not.toBeInTheDocument();
  });

  it("fills an empty position and cancels bench selection with Escape", () => {
    const { move } = setup();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: `Assign player at ${empty.label}` }),
    ).toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Place Reserve on the starting pitch",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Place Reserve at ${empty.label}` }),
    );
    expect(move).toHaveBeenCalledExactlyOnceWith("reserve", empty.id);
    expect(
      screen.getByRole("button", { name: `Change Reserve at ${empty.label}` }),
    ).toBeInTheDocument();
  });
});
