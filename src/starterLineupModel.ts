import {
  assignPlayerToPosition,
  comparePlayersByNameThenNumber,
} from "./domain";
import { preferredRoleLabel } from "./playerLabels";
import type { Formation, Player, PositionRole } from "./types";

const preferenceListFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

type StarterMoveFeedback = {
  playerId: string | null;
  name: string;
  destination: string;
  preference: string | null;
  outsidePreferences: boolean;
};

export const compareStarterPlayersByPreference = (
  a: Player,
  b: Player,
  role: PositionRole,
) => {
  const aIndex = a.preferredRoles.indexOf(role);
  const bIndex = b.preferredRoles.indexOf(role);
  return (
    Number(aIndex < 0) - Number(bIndex < 0) ||
    aIndex - bIndex ||
    Number(a.preferredRoles.length > 0) - Number(b.preferredRoles.length > 0) ||
    comparePlayersByNameThenNumber(a, b)
  );
};

export const starterPreferenceFit = (player: Player, role: PositionRole) => {
  if (player.preferredRoles.length === 0) return "No preferences listed";
  const index = player.preferredRoles.indexOf(role);
  return index < 0
    ? "Outside preferences"
    : `${["1st", "2nd", "3rd", "4th"][index]} preference`;
};

export const getStarterLineupAdvice = (
  formation: Formation,
  assignments: Record<string, string>,
  players: Player[],
) => {
  const issuesByPosition: Record<string, string[]> = {};
  for (const position of formation.positions) {
    const player = players.find((p) => p.id === assignments[position.id]);
    const issues: string[] = [];
    if (
      player &&
      player.preferredRoles.length > 0 &&
      !player.preferredRoles.includes(position.role)
    )
      issues.push(
        `${player.name} prefers ${preferenceListFormatter.format(
          player.preferredRoles.map((role) =>
            preferredRoleLabel(role).toLowerCase(),
          ),
        )}.`,
      );
    issuesByPosition[position.id] = issues;
  }
  return {
    issuesByPosition,
    concerns: [...new Set(Object.values(issuesByPosition).flat())],
  };
};

export const previewStarterMove = (
  formation: Formation,
  assignments: Record<string, string>,
  players: Player[],
  playerId: string,
  targetPositionId: string,
) => {
  const player = players.find((p) => p.id === playerId);
  const target = formation.positions.find((p) => p.id === targetPositionId);
  if (!player || !target)
    throw new Error("Choose a present player and a valid starting position.");
  const next = assignPlayerToPosition(assignments, targetPositionId, playerId);
  const positionChanges = formation.positions.flatMap<{
    change: string;
    feedback: StarterMoveFeedback;
  }>((position) => {
    if (assignments[position.id] === next[position.id]) return [];
    const incoming = players.find((p) => p.id === next[position.id]);
    if (!incoming)
      return [
        {
          change: `${position.label} will be open.`,
          feedback: {
            playerId: null,
            name: position.label,
            destination: "Left open",
            preference: null,
            outsidePreferences: false,
          },
        },
      ];
    const fit = starterPreferenceFit(incoming, position.role);
    const destination = `${position.label} · ${fit}`;
    return [
      {
        change: `${incoming.name} → ${destination}`,
        feedback: {
          playerId: incoming.id,
          name: incoming.name,
          destination: position.label,
          preference: fit === "Outside preferences" ? "Not preferred" : fit,
          outsidePreferences: fit === "Outside preferences",
        },
      },
    ];
  });
  const changes = positionChanges.map((item) => item.change);
  const feedback = positionChanges.map((item) => item.feedback);
  const displaced = players.find((p) => p.id === assignments[targetPositionId]);
  if (displaced && !Object.values(next).includes(displaced.id)) {
    changes.push(`${displaced.name} → Starting bench`);
    feedback.push({
      playerId: displaced.id,
      name: displaced.name,
      destination: "Bench",
      preference: null,
      outsidePreferences: false,
    });
  }
  const advice = getStarterLineupAdvice(formation, next, players);
  return {
    assignments: next,
    changes,
    feedback,
    advice,
  };
};
