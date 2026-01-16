export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "PASSWORD_RESET"
  | "ENROLL"
  | "ARCHIVE"
  | "CONFIRM";

export type EntityType =
  | "user"
  | "class"
  | "assignment"
  | "grade_contract"
  | "student_contract"
  | "assignment_progress"
  | "attendance"
  | "engagement_intention";

export interface AuditLogParams {
  userId: number | null;
  action: AuditAction;
  entityType: EntityType;
  entityId?: number;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}
