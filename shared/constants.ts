/**
 * Assignment status values.
 *
 * These are the three states an instructor can actually record. The stored
 * numbers used to run 0-3 with names that did not match their labels: value 2
 * was called COMPLETED but displayed as "Work-in-Progress", 3 was EXCELLENT but
 * displayed as "Successfully Completed", and 1 was unreachable from the UI.
 * The names below say what the values mean.
 *
 * Existing rows are migrated 0,1 -> 0, 2 -> 1, 3 -> 2.
 */
export const AssignmentStatus = {
  MISSING: 0,
  WORK_IN_PROGRESS: 1,
  COMPLETE: 2,
} as const;

export type AssignmentStatusValue = typeof AssignmentStatus[keyof typeof AssignmentStatus];

/** The highest status value, for validating input. */
export const MAX_ASSIGNMENT_STATUS = AssignmentStatus.COMPLETE;

/** Highest score on the numeric grading scale. */
export const MAX_NUMERIC_GRADE = 4;

/**
 * Whether a status counts as done for contract purposes.
 * Work-in-progress does not satisfy a requirement; only completion does.
 */
export function isAssignmentDone(status: number | null | undefined): boolean {
  return (status ?? 0) >= AssignmentStatus.COMPLETE;
}

/** Human-readable label for a stored status value. */
export function getAssignmentStatusLabel(status: number | null | undefined): string {
  switch (status ?? 0) {
    case AssignmentStatus.COMPLETE:
      return "Successfully Completed";
    case AssignmentStatus.WORK_IN_PROGRESS:
      return "Work-in-Progress";
    case AssignmentStatus.MISSING:
    default:
      return "Not Submitted";
  }
}

/**
 * How an assignment should be presented to a reader.
 *
 * Numeric assignments have no status column, so "has a score" stands in for
 * completion. Both the student view and the instructor roster derive this the
 * same way; it used to be copy-pasted into each of them.
 */
export type AssignmentDisplayState = "not-submitted" | "in-progress" | "completed";

export function getAssignmentDisplayState(
  scoringType: "status" | "numeric",
  progress?: { status?: number | null; numericGrade?: string | number | null } | null
): AssignmentDisplayState {
  if (!progress) return "not-submitted";

  if (scoringType === "status") {
    switch (progress.status) {
      case AssignmentStatus.COMPLETE:
        return "completed";
      case AssignmentStatus.WORK_IN_PROGRESS:
        return "in-progress";
      default:
        return "not-submitted";
    }
  }

  return progress.numericGrade ? "completed" : "not-submitted";
}

export function getDisplayStateLabel(state: AssignmentDisplayState): string {
  switch (state) {
    case "completed":
      return "Successfully Completed";
    case "in-progress":
      return "Work-in-Progress";
    case "not-submitted":
    default:
      return "Not Submitted";
  }
}

/**
 * In-class participation recorded by the instructor for one session.
 *
 * Null in the database means "not recorded", which is different from NONE --
 * an instructor who has not assessed a session yet has not given anyone a zero.
 */
export const ParticipationLevel = {
  NONE: 0,
  MINIMAL: 1,
  ACTIVE: 2,
  EXEMPLARY: 3,
} as const;

export type ParticipationLevelValue =
  typeof ParticipationLevel[keyof typeof ParticipationLevel];

export const MAX_PARTICIPATION = ParticipationLevel.EXEMPLARY;

/**
 * Default bar a session must clear to count toward a contract's required
 * participation. Each class may override it.
 */
export const DEFAULT_PARTICIPATION_BAR: number = ParticipationLevel.ACTIVE;

export function meetsParticipationBar(
  level: number | null | undefined,
  bar: number | null | undefined = DEFAULT_PARTICIPATION_BAR
): boolean {
  return level != null && level >= (bar ?? DEFAULT_PARTICIPATION_BAR);
}

export function getParticipationLabel(level: number | null | undefined): string {
  switch (level) {
    case ParticipationLevel.EXEMPLARY:
      return "Exemplary";
    case ParticipationLevel.ACTIVE:
      return "Active";
    case ParticipationLevel.MINIMAL:
      return "Minimal";
    case ParticipationLevel.NONE:
      return "None";
    default:
      return "Not recorded";
  }
}

/**
 * Whether an imported absence total puts a student over their contract limit.
 *
 * Absences arrive from Qwickly as a decimal, because Qwickly counts a Partial
 * (Late/Left Early) day as half. The limit itself stays a whole number of
 * classes, so a contract allowing 3 tolerates six late arrivals.
 */
export function isOverAbsenceLimit(
  absences: number | string | null | undefined,
  maxAbsences: number | null | undefined
): boolean {
  return Number(absences ?? 0) > (maxAbsences ?? 0);
}

/**
 * User roles
 */
export const UserRole = {
  INSTRUCTOR: "instructor",
  STUDENT: "student",
} as const;

export type UserRoleValue = typeof UserRole[keyof typeof UserRole];

/**
 * Grade contract levels
 */
export const GradeLevel = {
  A: "A",
  B: "B",
  C: "C",
} as const;

export type GradeLevelValue = typeof GradeLevel[keyof typeof GradeLevel];
