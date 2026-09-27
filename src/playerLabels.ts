import type { Player, PositionPreference } from "./types";

export const formatPlayerLabel = (player: Pick<Player, "name" | "number">) =>
  player.number === undefined
    ? player.name
    : `${player.name} #${player.number}`;

const preferenceLabels: Record<PositionPreference, string> = {
  goalkeeper: "Goalkeeper",
  defender: "Defense",
  midfielder: "Midfield",
  forward: "Forward",
  "center-back": "Center back",
  "outside-back": "Outside back",
  "central-midfield": "Central midfield",
  "wide-midfield": "Wide midfield",
};

export const preferredRoleLabel = (role: PositionPreference) =>
  preferenceLabels[role];

export const preferredRoleAbbreviation = (role: PositionPreference) =>
  ({
    goalkeeper: "GK",
    defender: "DEF",
    midfielder: "MID",
    forward: "FWD",
    "center-back": "CB",
    "outside-back": "OB",
    "central-midfield": "CM",
    "wide-midfield": "WM",
  })[role];
