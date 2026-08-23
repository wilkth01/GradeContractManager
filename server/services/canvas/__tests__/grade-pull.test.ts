import { describe, it, expect } from "vitest";
import { convertScore, buildPull } from "../grade-pull";
import { AssignmentStatus } from "@shared/constants";

describe("convertScore", () => {
  it("reads a score against the assignment's own maximum", () => {
    // The bug this exists to prevent: a 4-point Perusall reading scored 3.5 is
    // a 3.5, not 0.14 from treating it as a percentage.
    expect(convertScore(3.5, 4, "numeric").numeric).toBe(3.5);
    expect(convertScore(2.5, 4, "numeric").numeric).toBe(2.5);
  });

  it("rescales an assignment marked out of something else", () => {
    expect(convertScore(50, 100, "numeric").numeric).toBe(2);
    expect(convertScore(100, 100, "numeric").numeric).toBe(4);
  });

  it("clamps and reports a score above the maximum", () => {
    const result = convertScore(5, 4, "numeric");
    expect(result.numeric).toBe(4);
    expect(result.warning).toContain("exceeds");
  });

  it("falls back to the portal scale when Canvas has no points possible", () => {
    expect(convertScore(3, null, "numeric").numeric).toBe(3);
  });

  it("maps status assignments by proportion", () => {
    expect(convertScore(10, 10, "status").status).toBe(AssignmentStatus.COMPLETE);
    expect(convertScore(7, 10, "status").status).toBe(AssignmentStatus.COMPLETE);
    expect(convertScore(3, 10, "status").status).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(convertScore(0, 10, "status").status).toBe(AssignmentStatus.MISSING);
  });
});

const student = (id: number, canvasUserId: number) =>
  ({ id, canvasUserId, fullName: `Student ${id}`, username: `s${id}` }) as any;

const assignment = (id: number, canvasAssignmentId: number | null, scoringType = "numeric") =>
  ({ id, canvasAssignmentId, scoringType, name: `Assignment ${id}` }) as any;

const submission = (user_id: number, assignment_id: number, score: number | null, extra = {}) =>
  ({
    user_id,
    assignment_id,
    score,
    workflow_state: "graded",
    grade: null,
    submitted_at: null,
    ...extra,
  }) as any;

describe("buildPull", () => {
  const base = {
    students: [student(1, 900)],
    assignments: [assignment(10, 500)],
    existingProgress: [],
    canvasPointsById: new Map([[500, 4]]),
    currentAbsences: new Map<number, number>(),
  };

  it("reports a change for a newly graded assignment", () => {
    const result = buildPull({ ...base, submissions: [submission(900, 500, 4)] });

    expect(result.gradeChanges).toHaveLength(1);
    expect(result.gradeChanges[0].convertedNumeric).toBe(4);
    expect(result.gradeChanges[0].currentValue).toBeNull();
  });

  it("does not report a grade that already matches", () => {
    const result = buildPull({
      ...base,
      submissions: [submission(900, 500, 4)],
      existingProgress: [{ studentId: 1, assignmentId: 10, status: null, numericGrade: "4" }],
    });

    expect(result.gradeChanges).toHaveLength(0);
  });

  it("never invents a grade for ungraded or excused work", () => {
    const result = buildPull({
      ...base,
      submissions: [submission(900, 500, null), submission(900, 500, 3, { excused: true })],
    });

    expect(result.gradeChanges).toHaveLength(0);
    expect(result.summary.ungraded).toBe(2);
  });

  it("ignores assignments that have not been mapped", () => {
    const result = buildPull({
      ...base,
      assignments: [assignment(10, null)],
      submissions: [submission(900, 500, 4)],
    });

    expect(result.gradeChanges).toHaveLength(0);
  });

  it("counts Canvas students with no linked account rather than guessing", () => {
    const result = buildPull({ ...base, submissions: [submission(999, 500, 4)] });

    expect(result.gradeChanges).toHaveLength(0);
    expect(result.summary.unmatchedCanvasUsers).toBe(1);
  });

  it("reads absences from their own Canvas assignment", () => {
    const result = buildPull({
      ...base,
      submissions: [submission(900, 777, 7.5)],
      absenceCanvasAssignmentId: 777,
    });

    expect(result.absenceChanges).toEqual([
      { studentId: 1, studentName: "Student 1", currentAbsences: 0, newAbsences: 7.5 },
    ]);
  });

  it("does not report an absence total that already matches", () => {
    const result = buildPull({
      ...base,
      submissions: [submission(900, 777, 3)],
      absenceCanvasAssignmentId: 777,
      currentAbsences: new Map([[1, 3]]),
    });

    expect(result.absenceChanges).toHaveLength(0);
  });

  it("takes an absence total at face value across the whole term", () => {
    // Qwickly writes a running count, not a score. Rescaling it against the
    // column's points_possible -- which every graded assignment goes through --
    // would turn 45 absences into 4. The absence branch must not do that.
    for (const total of [0, 1, 7, 23, 44, 45]) {
      const result = buildPull({
        ...base,
        submissions: [submission(900, 777, total)],
        absenceCanvasAssignmentId: 777,
        canvasPointsById: new Map([
          [500, 4],
          [777, 45],
        ]),
        currentAbsences: new Map([[1, -1]]),
      });

      expect(result.absenceChanges[0].newAbsences).toBe(total);
    }
  });

  it("keeps the half day Qwickly counts for a late arrival", () => {
    const result = buildPull({
      ...base,
      submissions: [submission(900, 777, 12.5)],
      absenceCanvasAssignmentId: 777,
      canvasPointsById: new Map([[777, 100]]),
    });

    expect(result.absenceChanges[0].newAbsences).toBe(12.5);
  });

  it("never files the absence column as a grade", () => {
    // If the same Canvas column were also mapped to an assignment, importing it
    // as a grade would put an absence count in the gradebook.
    const result = buildPull({
      ...base,
      assignments: [assignment(10, 500), assignment(11, 777)],
      submissions: [submission(900, 777, 45)],
      absenceCanvasAssignmentId: 777,
    });

    expect(result.gradeChanges).toHaveLength(0);
    expect(result.absenceChanges[0].newAbsences).toBe(45);
  });
});
