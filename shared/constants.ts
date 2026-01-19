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
 * Helper to check if an assignment is considered "done" (completed or excellent)
 */
export function isAssignmentDone(status: number | null | undefined): boolean {
  return (status ?? 0) >= AssignmentStatus.COMPLETED;
}

/**
 * Get human-readable label for assignment status
 */
export function getAssignmentStatusLabel(status: number | null | undefined): string {
  switch (status ?? 0) {
    case AssignmentStatus.NOT_STARTED:
      return "Not Started";
    case AssignmentStatus.IN_PROGRESS:
      return "In Progress";
    case AssignmentStatus.COMPLETED:
      return "Completed";
    case AssignmentStatus.EXCELLENT:
      return "Excellent";
    default:
      return "Not Started";
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
