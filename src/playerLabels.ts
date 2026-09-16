import type { PositionRole } from "./types";

export const preferredRoleLabel = (role: PositionRole) =>
  role === "goalkeeper"
    ? "Goalkeeper"
    : role === "defender"
      ? "Defense"
      : role === "midfielder"
        ? "Midfield"
        : "Forward";
