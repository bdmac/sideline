import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CircleAlert, GripVertical } from "lucide-react";
import { PlayerDragPreview } from "./PlayerDragPreview";
import { TOUCH_DRAG_HOLD_MS } from "./playerDrag";
import type { Formation, Player } from "./types";
import {
  getStarterLineupAdvice,
  previewStarterMove,
} from "./starterLineupModel";

type DropTarget = { kind: "pitch" | "bench"; id: string };

type Drag = {
  playerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: DropTarget | null;
  waitingForHold?: boolean;
};

export function StarterLineup({
  formation,
  assignments,
  players,
  onChoosePosition,
  onMove,
}: {
  formation: Formation;
  assignments: Record<string, string>;
  players: Player[];
  onChoosePosition: (positionId: string) => void;
  onMove: (playerId: string, positionId: string) => void;
}) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLUListElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [hoverPositionId, setHoverPositionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guidanceId = useId();
  const bench = players
    .filter((p) => !Object.values(assignments).includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activePlayerId = drag?.active ? drag.playerId : selectedPlayerId;
  const activePlayer = players.find((p) => p.id === activePlayerId);
  const target: DropTarget | null = drag?.active
    ? drag.target
    : hoverPositionId
      ? { kind: "pitch", id: hoverPositionId }
      : null;
  const resolveMove = (playerId: string, destination: DropTarget) => {
    if (destination.kind === "pitch")
      return { playerId, positionId: destination.id };
    const positionId = Object.keys(assignments).find(
      (id) => assignments[id] === playerId,
    );
    return positionId ? { playerId: destination.id, positionId } : null;
  };
  const proposedMove =
    activePlayerId && target ? resolveMove(activePlayerId, target) : null;
  const preview = proposedMove
    ? previewStarterMove(
        formation,
        assignments,
        players,
        proposedMove.playerId,
        proposedMove.positionId,
      )
    : null;
  const advice = getStarterLineupAdvice(formation, assignments, players);

  const cancel = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    dragRef.current = null;
    setDrag(null);
    setSelectedPlayerId(null);
    setHoverPositionId(null);
  };

  useEffect(() => {
    if (!selectedPlayerId) return;
    const dismissSelection = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element) {
        const slot = target.closest(".starter-slot");
        const benchPlayer = target.closest(".starter-bench-name");
        if (
          (slot && pitchRef.current?.contains(slot)) ||
          (benchPlayer && benchRef.current?.contains(benchPlayer))
        )
          return;
      }
      cancel();
    };
    document.addEventListener("pointerdown", dismissSelection, true);
    return () =>
      document.removeEventListener("pointerdown", dismissSelection, true);
  }, [selectedPlayerId]);

  useEffect(() => {
    const bench = benchRef.current;
    const pitch = pitchRef.current;
    const preventDragScroll = (event: TouchEvent) => {
      if (dragRef.current?.active && event.cancelable) event.preventDefault();
    };
    bench?.addEventListener("touchmove", preventDragScroll, { passive: false });
    pitch?.addEventListener("touchmove", preventDragScroll, { passive: false });
    const preventContextMenu = (event: Event) => {
      if (dragRef.current) event.preventDefault();
    };
    bench?.addEventListener("contextmenu", preventContextMenu);
    pitch?.addEventListener("contextmenu", preventContextMenu);
    return () => {
      bench?.removeEventListener("touchmove", preventDragScroll);
      pitch?.removeEventListener("touchmove", preventDragScroll);
      bench?.removeEventListener("contextmenu", preventContextMenu);
      pitch?.removeEventListener("contextmenu", preventContextMenu);
    };
  }, [bench.length]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancel);
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancel);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  const findTarget = useCallback(
    (x: number, y: number, playerId: string): DropTarget | null => {
      const containsPoint = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      };
      const positionId =
        [
          ...(pitchRef.current?.querySelectorAll<HTMLElement>(
            "[data-position-id]",
          ) ?? []),
        ].find((element) => {
          if (assignments[element.dataset.positionId!] === playerId)
            return false;
          return containsPoint(element);
        })?.dataset.positionId ?? null;
      if (positionId) return { kind: "pitch", id: positionId };
      if (!Object.values(assignments).includes(playerId)) return null;
      const benchPlayer = [
        ...(benchRef.current?.querySelectorAll<HTMLElement>(
          "[data-bench-player-id]",
        ) ?? []),
      ].find(containsPoint);
      return benchPlayer
        ? { kind: "bench", id: benchPlayer.dataset.benchPlayerId! }
        : null;
    },
    [assignments],
  );

  useEffect(() => {
    if (!drag?.active) return;
    let frame: number;
    const scroll = () => {
      const current = dragRef.current;
      if (!current?.active) return;
      const speed =
        current.y < 72 ? -10 : current.y > window.innerHeight - 72 ? 10 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        const target = findTarget(current.x, current.y, current.playerId);
        if (
          target?.kind !== current.target?.kind ||
          target?.id !== current.target?.id
        ) {
          dragRef.current = { ...current, target };
          setDrag(dragRef.current);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [drag?.active, findTarget]);

  const commit = (playerId: string, positionId: string) => {
    const result = previewStarterMove(
      formation,
      assignments,
      players,
      playerId,
      positionId,
    );
    if (result.changes.length) {
      onMove(playerId, positionId);
      setMessage(`${result.changes.join(". ")}. Lineup updated.`);
      pitchRef.current
        ?.querySelector<HTMLButtonElement>(`[data-position-id="${positionId}"]`)
        ?.focus({ preventScroll: true });
    }
    cancel();
  };

  const pointerHandlers = (playerId: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.isPrimary === false || dragRef.current)
        return;
      setMessage("");
      dragRef.current = {
        playerId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
        target: null,
        waitingForHold: event.pointerType === "touch",
      };
      if (dragRef.current.waitingForHold) {
        holdTimer.current = setTimeout(() => {
          const current = dragRef.current;
          if (!current) return;
          dragRef.current = { ...current, active: true, waitingForHold: false };
          setDrag(dragRef.current);
        }, TOUCH_DRAG_HOLD_MS);
      }
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (
        !current.active &&
        Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        ) <= 8
      )
        return;
      if (current.waitingForHold) {
        cancel();
        return;
      }
      event.preventDefault();
      const next = {
        ...current,
        active: true,
        x: event.clientX,
        y: event.clientY,
        target: findTarget(event.clientX, event.clientY, current.playerId),
      };
      dragRef.current = next;
      setDrag(next);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const current = dragRef.current;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (!current || current.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      if (!current.active) return;
      event.preventDefault();
      suppressClick.current = true;
      clickTimer.current = setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const destination = findTarget(
        event.clientX,
        event.clientY,
        current.playerId,
      );
      const move = destination
        ? resolveMove(current.playerId, destination)
        : null;
      if (move) commit(move.playerId, move.positionId);
      else {
        cancel();
        setMessage("Move cancelled. Lineup unchanged.");
      }
    },
    onPointerCancel: cancel,
    onLostPointerCapture: () => {
      if (dragRef.current) cancel();
    },
  });

  const selectBenchPlayer = (id: string) => {
    if (suppressClick.current) return;
    setMessage("");
    setSelectedPlayerId(selectedPlayerId === id ? null : id);
    setHoverPositionId(null);
  };

  return (
    <div className="starter-lineup">
      <div className="sr-only" id={guidanceId} role="status" aria-atomic="true">
        {activePlayer &&
          (preview ? (
            <>
              {preview.changes.map((change) => (
                <span key={change}>{change}</span>
              ))}
            </>
          ) : (
            `${activePlayer.name} selected. Choose a position.`
          ))}
      </div>
      <div
        className="pitch starter-pitch"
        ref={pitchRef}
        aria-label={`${formation.name} starter assignments`}
      >
        {drag?.active && preview && (
          <div className="player-drag-feedback" aria-hidden="true">
            {[...preview.feedback]
              .sort(
                (a, b) =>
                  Number(b.playerId === activePlayerId) -
                  Number(a.playerId === activePlayerId),
              )
              .map((detail) => (
                <div
                  className="player-drag-feedback-row"
                  key={detail.playerId ?? detail.name}
                >
                  <span className="player-drag-destination">
                    <strong>{detail.name}</strong>
                    <span>{detail.destination}</span>
                  </span>
                  {detail.preference && (
                    <span
                      className={`player-drag-fit ${detail.outsidePreferences ? "player-drag-warning" : ""}`}
                    >
                      {detail.preference}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}
        <div className="pitch-halfway" aria-hidden="true" />
        <div className="pitch-circle" aria-hidden="true" />
        <div className="pitch-box top" aria-hidden="true" />
        <div className="pitch-box bottom" aria-hidden="true" />
        <span className="pitch-direction attack" aria-hidden="true">
          Attack
        </span>
        <span className="pitch-direction defend" aria-hidden="true">
          Defend
        </span>
        {formation.positions.map((position) => {
          const player = players.find((p) => p.id === assignments[position.id]);
          const hasIssues = advice.issuesByPosition[position.id].length > 0;
          const warningId = `${guidanceId}-${position.id}`;
          return (
            <button
              type="button"
              key={position.id}
              className={`pitch-player starter-slot ${player ? "" : "empty"} ${target?.kind === "pitch" && target.id === position.id ? "starter-drop-target" : ""} ${drag?.active && drag.playerId === player?.id ? "starter-drag-source" : ""}`}
              data-position-id={position.id}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              aria-label={
                selectedPlayerId
                  ? `Place ${activePlayer?.name} at ${position.label}${player ? `, replacing ${player.name}` : ""}`
                  : `${player ? `Change ${player.name}` : "Assign player"} at ${position.label}`
              }
              aria-describedby={
                [activePlayerId ? guidanceId : "", hasIssues ? warningId : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              {...(player ? pointerHandlers(player.id) : {})}
              onFocus={() => setHoverPositionId(position.id)}
              onBlur={() => setHoverPositionId(null)}
              onMouseEnter={() => setHoverPositionId(position.id)}
              onMouseLeave={() => setHoverPositionId(null)}
              onClick={() => {
                if (suppressClick.current) return;
                if (selectedPlayerId) commit(selectedPlayerId, position.id);
                else onChoosePosition(position.id);
              }}
            >
              <span className="position-label">{position.shortLabel}</span>
              <strong>{player?.name ?? "Open"}</strong>
              {hasIssues && (
                <>
                  <CircleAlert
                    className="starter-player-warning"
                    size={20}
                    aria-hidden="true"
                  />
                  <span className="sr-only" id={warningId}>
                    Lineup warning. Open this position to review.
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div className="bench-preview starter-bench">
        <strong>Starting bench</strong>
        {bench.length ? (
          <ul className="starter-bench-list" ref={benchRef}>
            {bench.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  className={`starter-bench-name ${target?.kind === "bench" && target.id === player.id ? "starter-drop-target" : ""}`}
                  data-bench-player-id={player.id}
                  aria-label={`Place ${player.name} on the starting pitch`}
                  aria-describedby={
                    drag?.active &&
                    target?.kind === "bench" &&
                    target.id === player.id
                      ? guidanceId
                      : undefined
                  }
                  aria-pressed={selectedPlayerId === player.id}
                  {...pointerHandlers(player.id)}
                  onClick={() => selectBenchPlayer(player.id)}
                >
                  <GripVertical
                    className="bench-row-grip starter-bench-grip"
                    size={18}
                    aria-hidden="true"
                    focusable="false"
                  />
                  <span>{player.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span>
            {players.length === formation.sideSize
              ? "No bench — exactly enough players. 🪦 their little legs and lungs."
              : "No bench — playing short-sided."}
          </span>
        )}
      </div>
      <span className="sr-only" role="status">
        {message}
      </span>
      {drag?.active && activePlayer && (
        <PlayerDragPreview name={activePlayer.name} x={drag.x} y={drag.y} />
      )}
    </div>
  );
}
