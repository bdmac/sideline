import type { Player, PositionRole } from "./types";

export const formatPlayerLabel = (player: Pick<Player, "name" | "number">) =>
  player.number === undefined
    ? player.name
    : `${player.name} #${player.number}`;

export const preferredRoleLabel = (role: PositionRole) =>
  role === "goalkeeper"
    ? "Goalkeeper"
    : role === "defender"
      ? "Defense"
      : role === "midfielder"
        ? "Midfield"
        : "Forward";
