import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DragEvent, MouseEvent, PointerEvent } from "react";
import { TOUCH_DRAG_HOLD_MS } from "./playerDrag";

export type LiveBenchDrag = {
  lineupKey: string;
  playerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  moved: boolean;
  waitingForHold: boolean;
  compact: boolean;
  targetPositionId: string | null;
};

type Options = {
  lineupKey: string;
  benchIds: string[];
  assignments: Record<string, string>;
  onDrop: (incomingId: string, outgoingId: string) => boolean;
  manualPlanning?: boolean;
};

export function useLiveBenchDrag(options: Options) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const compactPitchRef = useRef<HTMLDivElement>(null);
  const currentOptions = useRef(options);
  const dragRef = useRef<LiveBenchDrag | null>(null);
  const [drag, setDrag] = useState<LiveBenchDrag | null>(null);
  const [message, setMessage] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    currentOptions.current = options;
  });

  const clear = useCallback(() => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    dragRef.current = null;
    setDrag(null);
  }, []);

  const cancel = useCallback(() => {
    if (dragRef.current?.active) {
      suppressClick.current = true;
      setMessage("Substitution cancelled. Lineup unchanged.");
    }
    clear();
  }, [clear]);

  useEffect(() => {
    cancel();
  }, [options.lineupKey, cancel]);

  useEffect(() => {
    const touchMove = (event: TouchEvent) => {
      if (dragRef.current?.active && event.cancelable) event.preventDefault();
    };
    const multiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) cancel();
    };
    const wheel = (event: WheelEvent) => {
      if (dragRef.current?.active && dragRef.current.compact)
        event.preventDefault();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const contextMenu = (event: Event) => {
      if (dragRef.current) event.preventDefault();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("touchstart", multiTouch, { passive: true });
    document.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("contextmenu", contextMenu);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    window.visualViewport?.addEventListener("resize", cancel);
    return () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchstart", multiTouch);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      window.visualViewport?.removeEventListener("resize", cancel);
    };
  }, [cancel]);

  const findTarget = useCallback((current: LiveBenchDrag) => {
    const root = current.compact ? compactPitchRef.current : pitchRef.current;
    const targets =
      root?.querySelectorAll<HTMLElement>("[data-position-id]") ?? [];
    return (
      Array.from(targets).find((target) => {
        if (!currentOptions.current.assignments[target.dataset.positionId!])
          return false;
        const rect = target.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          current.x >= rect.left &&
          current.x <= rect.right &&
          current.y >= rect.top &&
          current.y <= rect.bottom
        );
      })?.dataset.positionId ?? null
    );
  }, []);

  useEffect(() => {
    if (!drag?.active || drag.compact) return;
    let frame: number;
    const scroll = () => {
      const current = dragRef.current;
      if (!current?.active) return;
      const speed =
        current.y < 64
          ? -Math.ceil(14 * (1 - Math.max(0, current.y) / 64))
          : current.y > window.innerHeight - 64
            ? Math.ceil(
                14 * (1 - Math.max(0, window.innerHeight - current.y) / 64),
              )
            : 0;
      if (speed) {
        window.scrollBy(0, speed);
        const targetPositionId = current.moved ? findTarget(current) : null;
        if (targetPositionId !== current.targetPositionId) {
          dragRef.current = { ...current, targetPositionId };
          setDrag(dragRef.current);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [drag?.active, drag?.compact, findTarget]);

  const bindings = (playerId: string) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        dragRef.current ||
        !currentOptions.current.benchIds.includes(playerId)
      )
        return;
      suppressClick.current = false;
      setMessage("");
      const current: LiveBenchDrag = {
        lineupKey: currentOptions.current.lineupKey,
        playerId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        moved: false,
        waitingForHold: event.pointerType === "touch",
        compact: window.innerWidth <= 760 || window.innerHeight <= 540,
        targetPositionId: null,
      };
      dragRef.current = current;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (current.waitingForHold) {
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          if (!dragRef.current) return;
          dragRef.current = {
            ...dragRef.current,
            active: true,
            waitingForHold: false,
          };
          suppressClick.current = true;
          setDrag(dragRef.current);
        }, TOUCH_DRAG_HOLD_MS);
      }
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.lineupKey !== currentOptions.current.lineupKey) {
        cancel();
        return;
      }
      const moved =
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) > 8;
      if (current.waitingForHold) {
        if (moved) {
          suppressClick.current = true;
          cancel();
        }
        return;
      }
      if (!current.active && !moved) return;
      event.preventDefault();
      suppressClick.current = true;
      const next = {
        ...current,
        active: true,
        moved: current.moved || moved,
        x: event.clientX,
        y: event.clientY,
      };
      next.targetPositionId = next.moved ? findTarget(next) : null;
      dragRef.current = next;
      setDrag(next);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.lineupKey !== currentOptions.current.lineupKey) {
        cancel();
        return;
      }
      if (!current.active) {
        clear();
        return;
      }
      event.preventDefault();
      suppressClick.current = true;
      const finalTarget = current.moved
        ? findTarget({ ...current, x: event.clientX, y: event.clientY })
        : null;
      const targetPositionId =
        finalTarget === current.targetPositionId ? finalTarget : null;
      const outgoingId = targetPositionId
        ? currentOptions.current.assignments[targetPositionId]
        : undefined;
      clear();
      if (
        outgoingId &&
        currentOptions.current.benchIds.includes(current.playerId)
      ) {
        if (currentOptions.current.onDrop(current.playerId, outgoingId)) {
          setMessage(
            currentOptions.current.manualPlanning
              ? "Swap added to plan. Lineup unchanged."
              : "Substitution sent immediately.",
          );
        }
      } else {
        setMessage("Substitution cancelled. Lineup unchanged.");
      }
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) cancel();
    },
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) cancel();
    },
    onClickCapture: (event: MouseEvent<HTMLButtonElement>) => {
      if (suppressClick.current && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }
    },
    onDragStart: (event: DragEvent<HTMLButtonElement>) =>
      event.preventDefault(),
  });

  return { drag, pitchRef, compactPitchRef, bindings, cancel, message };
}

export type LiveBenchDragBindings = ReturnType<
  typeof useLiveBenchDrag
>["bindings"];
