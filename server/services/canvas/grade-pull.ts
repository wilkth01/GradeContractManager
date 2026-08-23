/**
 * Pulls grades from Canvas for assignments that have been mapped.
 *
 * Mapping is per assignment rather than per assignment group. The instructor's
 * own tracker documents why: the Canvas "Perusall Annotations" group does not
 * contain every Perusall reading -- some are filed under "Assignments" -- so
 * anything that pulls by group silently misses work.
 */
import type { Assignment, User } from "@shared/schema";
import { AssignmentStatus, MAX_NUMERIC_GRADE, getAssignmentStatusLabel } from "@shared/constants";
import type { CanvasSubmission } from "./client";

export interface PulledChange {
  studentId: number;
  studentName: string;
  assignmentId: number;
  assignmentName: string;
  currentValue: string | null;
  newValue: string;
  convertedStatus: number | null;
  convertedNumeric: number | null;
  warning?: string;
}

export interface PulledAbsence {
  studentId: number;
  studentName: string;
  currentAbsences: number;
  newAbsences: number;
}

export interface PullSummary {
  mappedAssignments: number;
  studentsMatched: number;
  gradeChanges: number;
  absenceChanges: number;
  unmatchedCanvasUsers: number;
  ungraded: number;
}

export interface ExistingProgress {
  studentId: number;
  assignmentId: number;
  status: number | null;
  numericGrade: string | null;
}

/**
 * Convert a Canvas score to a portal value for one assignment.
 *
 * Canvas scores are on the assignment's own points scale, so they are read as a
 * proportion of points_possible rather than assumed to be out of 100. An
 * assignment worth 4 points reporting 3.5 is a 3.5, not a 0.1 -- which is what
 * treating it as a percentage produced.
 */
export function convertScore(
  score: number,
  pointsPossible: number | null,
  scoringType: "status" | "numeric"
): { status: number | null; numeric: number | null; warning?: string } {
  const max = pointsPossible && pointsPossible > 0 ? pointsPossible : MAX_NUMERIC_GRADE;
  const proportion = Math.max(0, Math.min(1, score / max));

  if (scoringType === "numeric") {
    const value = Math.round(proportion * MAX_NUMERIC_GRADE * 100) / 100;
    return {
      status: null,
      numeric: value,
      warning:
        score > max
          ? `Canvas score ${score} exceeds the assignment maximum of ${max}; clamped`
          : undefined,
    };
  }

  // Status assignments: anything at or above 70% counts as complete, any credit
  // at all as work in progress. Mirrors the CSV importer's thresholds.
  const status =
    proportion >= 0.7
      ? AssignmentStatus.COMPLETE
      : proportion > 0
        ? AssignmentStatus.WORK_IN_PROGRESS
        : AssignmentStatus.MISSING;

  return { status, numeric: null };
}

export interface BuildPullInput {
  students: User[];
  assignments: Assignment[];
  submissions: CanvasSubmission[];
  existingProgress: ExistingProgress[];
  canvasPointsById: Map<number, number | null>;
  /** The Canvas assignment Qwickly writes absence totals into, if any. */
  absenceCanvasAssignmentId?: number | null;
  currentAbsences: Map<number, number>;
}

export interface PullResult {
  gradeChanges: PulledChange[];
  absenceChanges: PulledAbsence[];
  summary: PullSummary;
}

/**
 * Turn Canvas submissions into the changes an import would apply.
 *
 * Only differences are reported: a submission that already matches what the
 * portal holds is not a change, so the preview shows what an import would
 * actually do rather than restating the whole gradebook.
 */
export function buildPull(input: BuildPullInput): PullResult {
  const studentByCanvasId = new Map<number, User>();
  for (const student of input.students) {
    if (student.canvasUserId) studentByCanvasId.set(student.canvasUserId, student);
  }

  const mapped = input.assignments.filter((a) => a.canvasAssignmentId != null);
  const assignmentByCanvasId = new Map(mapped.map((a) => [a.canvasAssignmentId!, a]));

  const progressKey = (studentId: number, assignmentId: number) => `${studentId}:${assignmentId}`;
  const progressLookup = new Map(
    input.existingProgress.map((p) => [progressKey(p.studentId, p.assignmentId), p])
  );

  const gradeChanges: PulledChange[] = [];
  const absenceChanges: PulledAbsence[] = [];
  const unmatchedCanvasUsers = new Set<number>();
  let ungraded = 0;

  for (const submission of input.submissions) {
    const student = studentByCanvasId.get(submission.user_id);
    if (!student) {
      unmatchedCanvasUsers.add(submission.user_id);
      continue;
    }

    // Absences arrive as a score on their own Canvas assignment.
    if (
      input.absenceCanvasAssignmentId &&
      submission.assignment_id === input.absenceCanvasAssignmentId
    ) {
      if (submission.score == null) continue;
      const current = input.currentAbsences.get(student.id) ?? 0;
      if (current !== submission.score) {
        absenceChanges.push({
          studentId: student.id,
          studentName: student.fullName,
          currentAbsences: current,
          newAbsences: submission.score,
        });
      }
      continue;
    }

    const assignment = assignmentByCanvasId.get(submission.assignment_id);
    if (!assignment) continue;

    // An excused submission is not a zero, and neither is one nobody has
    // graded yet. Importing either as 0 would invent a grade.
    if (submission.excused || submission.score == null) {
      ungraded++;
      continue;
    }

    const converted = convertScore(
      submission.score,
      input.canvasPointsById.get(submission.assignment_id) ?? null,
      assignment.scoringType
    );

    const existing = progressLookup.get(progressKey(student.id, assignment.id));
    const unchanged =
      assignment.scoringType === "numeric"
        ? existing?.numericGrade != null &&
          Number(existing.numericGrade) === converted.numeric
        : existing?.status != null && existing.status === converted.status;

    if (unchanged) continue;

    gradeChanges.push({
      studentId: student.id,
      studentName: student.fullName,
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      currentValue:
        assignment.scoringType === "numeric"
          ? (existing?.numericGrade ?? null)
          : existing?.status != null
            ? getAssignmentStatusLabel(existing.status)
            : null,
      newValue: String(submission.score),
      convertedStatus: converted.status,
      convertedNumeric: converted.numeric,
      warning: converted.warning,
    });
  }

  return {
    gradeChanges,
    absenceChanges,
    summary: {
      mappedAssignments: mapped.length,
      studentsMatched: studentByCanvasId.size,
      gradeChanges: gradeChanges.length,
      absenceChanges: absenceChanges.length,
      unmatchedCanvasUsers: unmatchedCanvasUsers.size,
      ungraded,
    },
  };
}
