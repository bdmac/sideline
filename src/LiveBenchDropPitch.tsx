import { ArrowRightLeft, CircleAlert, Move } from "lucide-react";
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Formation, Player, SubstitutionPair } from "./types";
import {
  getCompactDropPositions,
  getPlannedPositionChange,
} from "./benchDropModel";
import { preferredRoleLabel } from "./playerLabels";
import { PlayerIdentity } from "./PlayerIdentity";

export function PlannedPitchIncoming({
  change,
  players,
}: {
  change: ReturnType<typeof getPlannedPositionChange>;
  players: Player[];
}) {
  if (!change) return null;
  const name =
    players.find((player) => player.id === change.playerId)?.name ??
    "Unknown player";
  const Icon = change.kind === "move" ? Move : ArrowRightLeft;
  return (
    <span
      className="planned-pitch-incoming"
      aria-label={`${change.kind === "move" ? "Planned move" : "Planned in"}: ${name}`}
      title={`${change.kind === "move" ? "Planned move" : "Planned in"}: ${name}`}
    >
      <Icon size={12} aria-hidden="true" />
      <span>{name}</span>
    </span>
  );
}

export function LiveBenchDropPitch({
  compact,
  formation,
  assignments,
  queuedSubstitutions,
  players,
  incoming,
  targetPositionId,
  pitchRef,
  fieldRef,
  warning,
  manualPlanning = false,
  planImpact,
}: {
  compact: boolean;
  formation: Formation;
  assignments: Record<string, string>;
  queuedSubstitutions?: SubstitutionPair[];
  players: Player[];
  incoming: Player;
  targetPositionId: string | null;
  pitchRef: RefObject<HTMLDivElement | null>;
  fieldRef: RefObject<HTMLDivElement | null>;
  warning?: string;
  manualPlanning?: boolean;
  planImpact?: string;
}) {
  const statusRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (compact || !fieldRef.current || !statusRef.current) return;
    const field = fieldRef.current;
    const status = statusRef.current;
    const fieldBounds = field.getBoundingClientRect();
    const statusBounds = status.getBoundingClientRect();
    let top = 8;
    for (const target of field.querySelectorAll("[data-position-id]")) {
      const bounds = target.getBoundingClientRect();
      if (
        bounds.right > statusBounds.left &&
        bounds.left < statusBounds.right
      ) {
        top = Math.min(
          top,
          bounds.top - fieldBounds.top - statusBounds.height - 8,
        );
      }
    }
    status.style.top = `${top}px`;
  }, [compact, fieldRef]);
  const position = formation.positions.find(
    (item) => item.id === targetPositionId,
  );
  const outgoing = players.find(
    (player) => player.id === assignments[targetPositionId ?? ""],
  );
  const summary = (
    <div className="bench-drop-summary" role="status" aria-live="polite">
      <p className="bench-drop-positions">
        Positions:{" "}
        {incoming.preferredRoles.length
          ? incoming.preferredRoles.map(preferredRoleLabel).join(" · ")
          : "Not set"}
      </p>
      <div className="bench-drop-preview">
        {outgoing ? (
          <div className="bench-drop-pair">
            <span>
              <small>IN · {position?.mediumLabel}</small>
              <strong>
                <PlayerIdentity name={incoming.name} number={incoming.number} />
              </strong>
            </span>
            <ArrowRightLeft size={20} aria-hidden="true" />
            <span>
              <small>OUT</small>
              <strong>
                <PlayerIdentity name={outgoing.name} number={outgoing.number} />
              </strong>
            </span>
          </div>
        ) : (
          <p className="bench-drop-instruction">
            {manualPlanning
              ? `Drop on a player to plan ${incoming.name}'s swap.`
              : `Drop on a player to send ${incoming.name} in now.`}
          </p>
        )}
      </div>
      <div className="bench-drop-notice">
        {(warning || planImpact) && (
          <p className="bench-drop-warning">
            <CircleAlert size={15} aria-hidden="true" />
            {warning || planImpact}
          </p>
        )}
      </div>
    </div>
  );
  if (!compact) {
    const container = fieldRef.current?.parentElement;
    if (!container) return null;
    return createPortal(
      <aside
        ref={statusRef}
        className="bench-drag-status"
        aria-label={
          manualPlanning
            ? "Planned substitution preview"
            : "Immediate substitution preview"
        }
      >
        {summary}
      </aside>,
      container,
    );
  }
  return createPortal(
    <div className="bench-drop-overlay">
      <section
        className="bench-drop-board"
        aria-label="Temporary substitution pitch"
      >
        {summary}
        <div
          className="bench-drop-pitch"
          ref={pitchRef}
          aria-label={`${formation.name} drop positions`}
        >
          <div className="pitch-halfway" aria-hidden="true" />
          <div className="pitch-circle" aria-hidden="true" />
          <div className="pitch-box top" aria-hidden="true" />
          <div className="pitch-box bottom" aria-hidden="true" />
          {getCompactDropPositions(formation).map((item) => {
            const player = players.find(
              (candidate) => candidate.id === assignments[item.id],
            );
            const positionLabel = item.mediumLabel;
            const plannedChange = getPlannedPositionChange(
              item.id,
              assignments,
              queuedSubstitutions,
            );
            return (
              <div
                key={item.id}
                className={`bench-drop-target ${item.id === targetPositionId ? "selected" : ""} ${player ? "" : "empty"} ${plannedChange ? "has-planned-change" : ""}`}
                data-position-id={item.id}
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
              >
                <strong>
                  <PlayerIdentity
                    name={player?.name ?? "Open"}
                    number={player?.number}
                  />
                </strong>
                <small>{positionLabel}</small>
                <PlannedPitchIncoming
                  change={plannedChange}
                  players={players}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
