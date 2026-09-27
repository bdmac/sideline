import type {
  Player,
  Position,
  PositionPreference,
  PositionRole,
} from "./types";

export const U12_PREFERENCE_GROUPS = [
  "goalkeeper",
  "center-back",
  "outside-back",
  "central-midfield",
  "wide-midfield",
  "forward",
] as const satisfies readonly PositionPreference[];

export const getPositionPreferenceIndex = (
  player: Pick<Player, "preferredRoles">,
  position: Pick<Position, "role" | "preferenceGroup"> | PositionRole,
) => {
  const role = typeof position === "string" ? position : position.role;
  const group =
    typeof position === "string"
      ? position
      : (position.preferenceGroup ?? role);
  // Broad saved preferences cover both subgroups at the same original rank.
  return player.preferredRoles.findIndex(
    (preference) => preference === group || preference === role,
  );
};

export const preferenceRankLabel = (index: number) =>
  `${index + 1}${["st", "nd", "rd"][index] ?? "th"} preference`;
