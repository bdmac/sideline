import { fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRotationDueReview } from "./useRotationDueReview";

const setup = (initialDue = false) => {
  const onOpen = vi.fn();
  const initialProps = {
    cycleKey: "game:start",
    due: initialDue,
    eligible: true,
    now: 0,
    onOpen,
  };
  const { rerender } = renderHook(useRotationDueReview, { initialProps });
  return {
    onOpen,
    update: (props: Partial<typeof initialProps>) =>
      rerender({ ...initialProps, ...props }),
  };
};

afterEach(() => vi.restoreAllMocks());

describe("automatic rotation review", () => {
  it("opens once on the due transition and rearms for the next rotation", () => {
    const { onOpen, update } = setup();
    update({ due: true, now: 1 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    update({ due: true, now: 2 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    update({ cycleKey: "game:swap", due: false, now: 3 });
    update({ cycleKey: "game:swap", due: true, now: 4 });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("does not open on an already-overdue mount", () => {
    const { onOpen, update } = setup(true);
    update({ due: true, now: 1 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each(["dialog", "alertdialog", "menu", "listbox"])(
    "does not interrupt a %s or open after it closes",
    (role) => {
      const overlay = render(<div role={role}>Current interaction</div>);
      const { onOpen, update } = setup();
      update({ due: true, now: 1 });
      expect(onOpen).not.toHaveBeenCalled();
      overlay.unmount();
      update({ due: true, now: 2 });
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

  it("honors an expanded menu trigger even without a menu role", () => {
    const menu = render(<button aria-expanded="true">Settings</button>);
    const { onOpen, update } = setup();
    update({ due: true, now: 1 });
    menu.unmount();
    update({ due: true, now: 2 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not interrupt a pointer gesture or replay after release", () => {
    const { onOpen, update } = setup();
    fireEvent.pointerDown(document, { pointerId: 1 });
    update({ due: true, now: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });
    update({ due: true, now: 2 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("clears a cancelled pointer before the due transition", () => {
    const { onOpen, update } = setup();
    fireEvent.pointerDown(document, { pointerId: 1 });
    fireEvent.pointerCancel(document, { pointerId: 1 });
    update({ due: true, now: 1 });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("does not interrupt keyboard interaction or text entry", () => {
    const { onOpen, update } = setup();
    fireEvent.keyDown(document, { code: "Space" });
    update({ due: true, now: 1 });
    fireEvent.keyUp(document, { code: "Space" });
    update({ due: true, now: 2 });
    expect(onOpen).not.toHaveBeenCalled();

    const input = render(<input aria-label="Player name" />);
    input.getByRole("textbox").focus();
    update({ cycleKey: "game:swap", due: false, now: 3 });
    update({ cycleKey: "game:swap", due: true, now: 4 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open while hidden or catch up on return", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const { onOpen, update } = setup();
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    update({ due: true, now: 1 });
    expect(onOpen).not.toHaveBeenCalled();
    update({ due: true, now: 2 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("allows a later due transition after returning before the deadline", () => {
    const { onOpen, update } = setup();
    fireEvent(window, new Event("pageshow"));
    update({ due: false, now: 1 });
    update({ due: true, now: 2 });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("does not open while the window is unfocused or catch up on focus", () => {
    const { onOpen, update } = setup();
    fireEvent.blur(window);
    update({ due: false, now: 1 });
    update({ due: true, now: 2 });
    fireEvent.focus(window);
    update({ due: true, now: 3 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("consumes an ineligible transition without delaying the popup", () => {
    const { onOpen, update } = setup();
    update({ due: true, eligible: false, now: 1 });
    update({ due: true, eligible: true, now: 2 });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
