import { describe, it, expect } from "vitest";
import {
  AssignmentStatus,
  isAssignmentDone,
  getAssignmentStatusLabel,
  getAssignmentDisplayState,
  getDisplayStateLabel,
  ParticipationLevel,
  meetsParticipationBar,
  getParticipationLabel,
  isOverAbsenceLimit,
} from "../constants";

describe("AssignmentStatus", () => {
  it("has exactly the three states an instructor can record", () => {
    expect(Object.values(AssignmentStatus)).toEqual([0, 1, 2]);
  });

  it("counts only completion as done", () => {
    expect(isAssignmentDone(AssignmentStatus.MISSING)).toBe(false);
    expect(isAssignmentDone(AssignmentStatus.WORK_IN_PROGRESS)).toBe(false);
    expect(isAssignmentDone(AssignmentStatus.COMPLETE)).toBe(true);
  });

  it("treats a missing status as not done", () => {
    expect(isAssignmentDone(null)).toBe(false);
    expect(isAssignmentDone(undefined)).toBe(false);
  });

  it("labels each state", () => {
    expect(getAssignmentStatusLabel(AssignmentStatus.MISSING)).toBe("Not Submitted");
    expect(getAssignmentStatusLabel(AssignmentStatus.WORK_IN_PROGRESS)).toBe("Work-in-Progress");
    expect(getAssignmentStatusLabel(AssignmentStatus.COMPLETE)).toBe("Successfully Completed");
  });
});

describe("getAssignmentDisplayState", () => {
  it("returns not-submitted when there is no progress row", () => {
    expect(getAssignmentDisplayState("status", null)).toBe("not-submitted");
    expect(getAssignmentDisplayState("numeric", undefined)).toBe("not-submitted");
  });

  it("maps status assignments onto their state", () => {
    expect(getAssignmentDisplayState("status", { status: AssignmentStatus.COMPLETE })).toBe(
      "completed"
    );
    expect(
      getAssignmentDisplayState("status", { status: AssignmentStatus.WORK_IN_PROGRESS })
    ).toBe("in-progress");
    expect(getAssignmentDisplayState("status", { status: AssignmentStatus.MISSING })).toBe(
      "not-submitted"
    );
  });

  it("treats a numeric assignment as complete once it has any score", () => {
    expect(getAssignmentDisplayState("numeric", { numericGrade: "3.5" })).toBe("completed");
    expect(getAssignmentDisplayState("numeric", { numericGrade: null })).toBe("not-submitted");
  });

  it("agrees with the status labels", () => {
    expect(getDisplayStateLabel("completed")).toBe(
      getAssignmentStatusLabel(AssignmentStatus.COMPLETE)
    );
    expect(getDisplayStateLabel("in-progress")).toBe(
      getAssignmentStatusLabel(AssignmentStatus.WORK_IN_PROGRESS)
    );
    expect(getDisplayStateLabel("not-submitted")).toBe(
      getAssignmentStatusLabel(AssignmentStatus.MISSING)
    );
  });
});

describe("participation and absences", () => {
  it("counts a session only at or above the bar", () => {
    expect(meetsParticipationBar(ParticipationLevel.EXEMPLARY)).toBe(true);
    expect(meetsParticipationBar(ParticipationLevel.ACTIVE)).toBe(true);
    expect(meetsParticipationBar(ParticipationLevel.MINIMAL)).toBe(false);
    expect(meetsParticipationBar(ParticipationLevel.NONE)).toBe(false);
  });

  it("treats an unrecorded participation as not meeting the bar", () => {
    // Null means the instructor never assessed the session, which is not the
    // same as recording a zero -- but it cannot count toward a contract either.
    expect(meetsParticipationBar(null)).toBe(false);
    expect(meetsParticipationBar(undefined)).toBe(false);
  });

  it("labels an unrecorded participation distinctly from none", () => {
    expect(getParticipationLabel(null)).toBe("Not recorded");
    expect(getParticipationLabel(ParticipationLevel.NONE)).toBe("None");
  });

  it("compares an imported absence total against the contract limit", () => {
    expect(isOverAbsenceLimit(4, 3)).toBe(true);
    expect(isOverAbsenceLimit(3, 3)).toBe(false);
    expect(isOverAbsenceLimit(0, 3)).toBe(false);
  });

  it("handles the fractional totals Qwickly produces", () => {
    // Qwickly counts a Partial (Late/Left Early) day as half an absence, so
    // real totals look like 7.50. Six late arrivals do not exceed a limit of 3.
    expect(isOverAbsenceLimit(3.5, 3)).toBe(true);
    expect(isOverAbsenceLimit(3.0, 3)).toBe(false);
    expect(isOverAbsenceLimit(2.5, 3)).toBe(false);
  });

  it("accepts the decimal string the database returns", () => {
    expect(isOverAbsenceLimit("7.50", 3)).toBe(true);
    expect(isOverAbsenceLimit("2.50", 3)).toBe(false);
  });

  it("treats a missing total as no absences", () => {
    expect(isOverAbsenceLimit(null, 0)).toBe(false);
    expect(isOverAbsenceLimit(undefined, 3)).toBe(false);
  });
});
