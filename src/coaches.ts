import type { TeamId } from "./types";

export type CoachId = "brian" | "chris" | "scott" | "lindsey";

export type CoachAssignment = {
  teamId: TeamId;
  role: "Head coach" | "Assistant coach";
};

export type Coach = {
  id: CoachId;
  name: string;
  assignments: CoachAssignment[];
};

export const COACHES: Coach[] = [
  {
    id: "brian",
    name: "Brian",
    assignments: [
      { teamId: "u8", role: "Head coach" },
      { teamId: "u12", role: "Assistant coach" },
    ],
  },
  {
    id: "chris",
    name: "Chris",
    assignments: [{ teamId: "u12", role: "Head coach" }],
  },
  {
    id: "scott",
    name: "Scott",
    assignments: [{ teamId: "u12", role: "Assistant coach" }],
  },
  {
    id: "lindsey",
    name: "Lindsey",
    assignments: [{ teamId: "u8", role: "Assistant coach" }],
  },
];

export const COACH_ID_STORAGE_KEY = "sideline-coach-id";

export const getCoach = (coachId: string | null): Coach | null =>
  COACHES.find((coach) => coach.id === coachId) ?? null;

export const loadCoachId = (): CoachId | null => {
  try {
    return getCoach(localStorage.getItem(COACH_ID_STORAGE_KEY))?.id ?? null;
  } catch (error) {
    console.error("Sideline could not load the saved coach.", error);
    return null;
  }
};

export const saveCoachId = (coachId: CoachId | null) => {
  try {
    if (coachId) {
      localStorage.setItem(COACH_ID_STORAGE_KEY, coachId);
    } else {
      localStorage.removeItem(COACH_ID_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Sideline could not save the selected coach.", error);
  }
};
