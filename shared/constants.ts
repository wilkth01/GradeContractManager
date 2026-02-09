/**
 * Assignment status values used throughout the application.
 * These represent the progress state of a student's work on an assignment.
 */
export const AssignmentStatus = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
  EXCELLENT: 3,
} as const;

export type AssignmentStatusValue = typeof AssignmentStatus[keyof typeof AssignmentStatus];

/**
 * Helper to check if an assignment is considered "done" (successfully completed)
 */
export function isAssignmentDone(status: number | null | undefined): boolean {
  return (status ?? 0) >= AssignmentStatus.EXCELLENT;
}

/**
 * Get human-readable label for assignment status
 */
export function getAssignmentStatusLabel(status: number | null | undefined): string {
  switch (status ?? 0) {
    case AssignmentStatus.EXCELLENT:
      return "Successfully Completed";
    case AssignmentStatus.COMPLETED:
      return "Work-in-Progress";
    case AssignmentStatus.NOT_STARTED:
    case AssignmentStatus.IN_PROGRESS:
    default:
      return "Not Submitted";
  }
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
