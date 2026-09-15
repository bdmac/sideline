import { useEffect, useRef } from "react";

export function useRotationDueReview({
  cycleKey,
  due,
  eligible,
  now,
  onOpen,
}: {
  cycleKey: string;
  due: boolean;
  eligible: boolean;
  now: number;
  onOpen: () => void;
}) {
  const observed = useRef<{ cycleKey: string; due: boolean } | null>(null);
  const interaction = useRef({
    pointers: new Set<number>(),
    keys: new Set<string>(),
    foreground: document.visibilityState === "visible",
    focused: true,
  });

  useEffect(() => {
    const state = interaction.current;
    const pointerDown = (event: PointerEvent) =>
      state.pointers.add(event.pointerId);
    const pointerUp = (event: PointerEvent) =>
      state.pointers.delete(event.pointerId);
    const keyDown = (event: KeyboardEvent) => state.keys.add(event.code);
    const keyUp = (event: KeyboardEvent) => state.keys.delete(event.code);
    const interrupt = () => {
      state.foreground = false;
      state.pointers.clear();
      state.keys.clear();
    };
    const blur = () => {
      state.focused = false;
      interrupt();
    };
    const focus = () => {
      state.focused = true;
    };
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("keyup", keyUp, true);
    document.addEventListener("visibilitychange", interrupt);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", interrupt);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("keyup", keyUp, true);
      document.removeEventListener("visibilitychange", interrupt);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", interrupt);
    };
  }, []);

  useEffect(() => {
    const previous = observed.current;
    observed.current = { cycleKey, due };
    const state = interaction.current;
    const wasForeground = state.foreground;
    state.foreground = document.visibilityState === "visible" && state.focused;

    // Consume the transition even when blocked; closing another surface must
    // not trigger a delayed popup, nor should restoring an overdue game.
    if (
      previous?.cycleKey !== cycleKey ||
      previous.due ||
      !due ||
      !eligible ||
      !wasForeground ||
      !state.foreground ||
      state.pointers.size > 0 ||
      state.keys.size > 0
    ) {
      return;
    }

    const openSurface = document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [aria-expanded="true"], dialog[open]',
    );
    const editing = document.activeElement?.matches(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );
    if (!openSurface && !editing) onOpen();
  }, [cycleKey, due, eligible, now, onOpen]);
}
