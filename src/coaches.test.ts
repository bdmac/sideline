import { beforeEach, describe, expect, it } from "vitest";
import {
  COACHES,
  COACH_ID_STORAGE_KEY,
  getCoach,
  loadCoachId,
  saveCoachId,
} from "./coaches";

describe("coach personas", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defines the initial coach and team assignments", () => {
    expect(
      COACHES.map((coach) => ({
        name: coach.name,
        teams: coach.assignments.map((assignment) => assignment.teamId),
      })),
    ).toEqual([
      { name: "Brian", teams: ["u8", "u12"] },
      { name: "Chris", teams: ["u12"] },
      { name: "Scott", teams: ["u12"] },
      { name: "Lindsey", teams: ["u8"] },
    ]);
  });

  it("persists and clears the selected coach", () => {
    saveCoachId("chris");
    expect(loadCoachId()).toBe("chris");

    saveCoachId(null);
    expect(localStorage.getItem(COACH_ID_STORAGE_KEY)).toBeNull();
    expect(loadCoachId()).toBeNull();
  });

  it("rejects an unknown stored coach", () => {
    localStorage.setItem(COACH_ID_STORAGE_KEY, "unknown");

    expect(loadCoachId()).toBeNull();
    expect(getCoach("unknown")).toBeNull();
  });
});
