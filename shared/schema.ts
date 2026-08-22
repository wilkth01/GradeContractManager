import { pgTable, text, serial, integer, boolean, timestamp, json, decimal, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { MAX_NUMERIC_GRADE, MAX_PARTICIPATION } from "./constants";

/**
 * One category (module group) requirement inside a grade contract: complete a
 * number of them, hold an average across them, or both.
 */
export type CategoryRequirement = {
  category: string;
  required?: number;
  minAverage?: number;
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  role: text("role", { enum: ["instructor", "student"] }).notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  isTemporary: boolean("is_temporary").default(false),
  // Canvas identity, populated by a roster sync. Matching on this is exact,
  // which demotes name fuzzing to a fallback for unlinked students.
  canvasUserId: integer("canvas_user_id"),
  // An instructor's Canvas personal access token, encrypted at rest and never
  // returned to the client. See server/crypto.ts.
  canvasTokenEncrypted: text("canvas_token_encrypted"),
});

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  instructorId: integer("instructor_id").notNull(),
  isArchived: boolean("is_archived").default(false),
  description: text("description"),
  semesterStartDate: text("semester_start_date"),
  canvasCourseId: integer("canvas_course_id"),
  // Absence penalties that sit above the contract tiers: at or beyond the first
  // threshold the earned grade drops one letter, at or beyond the second the
  // course is failed outright, whatever the contract says. Null disables.
  absencePenaltyThreshold: integer("absence_penalty_threshold"),
  absenceFailureThreshold: integer("absence_failure_threshold"),
  // The participation level a session must reach to count toward a contract.
  // Null falls back to the shared default.
  participationBar: integer("participation_bar"),
});

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  classId: integer("class_id").notNull(),
  moduleGroup: text("module_group"),
  scoringType: text("scoring_type", { enum: ["status", "numeric"] }).notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  dueDate: timestamp("due_date"),
});

export const gradeContracts = pgTable("grade_contracts", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  grade: text("grade", { enum: ["A", "B", "C"] }).notNull(),
  version: integer("version").notNull(),
  assignments: json("assignments").notNull().$type<{ id: number; comments?: string; minPoints?: number }[]>(),
  // Number of sessions in which the student must have participated at or above
  // PARTICIPATION_BAR. Replaces the weekly-intentions count.
  requiredParticipationSessions: integer("required_participation_sessions").default(0),
  maxAbsences: integer("max_absences").default(0),
  categoryRequirements: json("category_requirements").$type<CategoryRequirement[]>(),
});

export const studentContracts = pgTable("student_contracts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id").notNull(),
  contractId: integer("contract_id"),
  isConfirmed: boolean("is_confirmed").default(false),
});

export const assignmentProgress = pgTable("assignment_progress", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  assignmentId: integer("assignment_id").notNull(),
  status: integer("status"),
  numericGrade: decimal("numeric_grade", { precision: 4, scale: 2 }),
  attempts: integer("attempts").default(0),
  lastUpdated: timestamp("last_updated").notNull(),
});

export const studentInvitations = pgTable("student_invitations", {
  id: serial("id").primaryKey(),
  // Set when the account already exists -- a roster imported from Canvas
  // creates the accounts up front, so setup only has to set a password rather
  // than let the student invent a second username for themselves.
  userId: integer("user_id").references(() => users.id),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  classId: integer("class_id").notNull(),
  token: text("token").notNull().unique(),
  isUsed: boolean("is_used").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  isUsed: boolean("is_used").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  adminNotified: boolean("admin_notified").default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  fullName: true,
});

export const insertClassSchema = createInsertSchema(classes).pick({
  name: true,
  description: true,
  semesterStartDate: true,
}).extend({
  semesterStartDate: z.string().optional(),
  absencePenaltyThreshold: z.number().int().min(1).nullable().optional(),
  absenceFailureThreshold: z.number().int().min(1).nullable().optional(),
  participationBar: z.number().int().min(0).max(MAX_PARTICIPATION).nullable().optional(),
  canvasCourseId: z.number().int().positive().nullable().optional(),
});

export const updateClassSchema = insertClassSchema.partial();

export const insertAssignmentSchema = createInsertSchema(assignments).pick({
  name: true,
  classId: true,
  moduleGroup: true,
  scoringType: true,
  dueDate: true,
}).extend({
  moduleGroup: z.string().nullable(),
  dueDate: z.string().nullable().optional(),
});

const assignmentRequirementSchema = z.object({
  id: z.number(),
  comments: z.string().optional(),
  minPoints: z.number().min(0).optional(),
});

// A category requirement can be a count ("complete 6 of these"), an average
// ("hold a 3.5 across these"), or both. Requiring a count unconditionally made
// average-only categories impossible to express.
const categoryRequirementSchema = z
  .object({
    category: z.string(),
    required: z.number().min(0).optional(),
    minAverage: z.number().min(0).max(MAX_NUMERIC_GRADE).optional(),
  })
  .refine((req) => (req.required ?? 0) > 0 || req.minAverage != null, {
    message: "A category requirement needs either a required count or a minimum average",
  });

export const insertGradeContractSchema = createInsertSchema(gradeContracts).extend({
  assignments: z.array(assignmentRequirementSchema),
  requiredParticipationSessions: z.number().default(0),
  maxAbsences: z.number().default(0),
  categoryRequirements: z.array(categoryRequirementSchema).optional(),
});

export const insertStudentInvitationSchema = createInsertSchema(studentInvitations).pick({
  email: true,
  fullName: true,
  classId: true,
});

export const setupPasswordSchema = z.object({
  token: z.string(),
  // Omitted when the invitation already names an account, which is the case
  // for students imported from a Canvas roster.
  username: z.string().min(3).optional(),
  password: z.string().min(6),
});

export const passwordResetRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// A single class meeting. Attendance and participation are both recorded
// against one of these, so a roll call is one row per student per session
// rather than a bare count with fabricated dates.
export const classSessions = pgTable(
  "class_sessions",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").references(() => classes.id).notNull(),
    date: timestamp("date").notNull(),
    topic: text("topic"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // One session per class per day.
    classDateUnique: unique("class_sessions_class_date_unique").on(
      table.classId,
      table.date
    ),
  })
);

// In-class participation for one student in one session.
//
// Attendance itself is not recorded here. Widener requires Qwickly, which owns
// attendance and computes its own absence total (counting a Partial day as
// half). That total is imported into student_absences rather than re-derived,
// so the two systems can never disagree. Qwickly does not track participation,
// which is why this table exists.
export const sessionParticipation = pgTable(
  "session_participation",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => classSessions.id).notNull(),
    studentId: integer("student_id").references(() => users.id).notNull(),
    // 0-3. Null means the instructor has not assessed this student for this
    // session, which is different from recording a zero.
    participation: integer("participation"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionStudentUnique: unique("participation_session_student_unique").on(
      table.sessionId,
      table.studentId
    ),
  })
);

// The absence total imported from Qwickly by way of a Canvas gradebook column.
//
// Decimal because Qwickly counts a Partial (Late/Left Early) day as half an
// absence, so real totals look like 7.50.
export const studentAbsences = pgTable(
  "student_absences",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").references(() => users.id).notNull(),
    classId: integer("class_id").references(() => classes.id).notNull(),
    absences: decimal("absences", { precision: 5, scale: 2 }).notNull(),
    source: text("source").notNull().default("canvas"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    studentClassUnique: unique("absences_student_class_unique").on(
      table.studentId,
      table.classId
    ),
  })
);

export const insertClassSessionSchema = createInsertSchema(classSessions)
  .pick({ classId: true, topic: true, notes: true })
  .extend({
    date: z.string(),
    topic: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

export const updateClassSessionSchema = z.object({
  date: z.string().optional(),
  topic: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const participationEntrySchema = z.object({
  studentId: z.number().int(),
  participation: z
    .number()
    .int()
    .min(0)
    .max(MAX_PARTICIPATION)
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

export const recordParticipationSchema = z.object({
  entries: z.array(participationEntrySchema),
});

export const canvasTokenSchema = z.object({
  token: z.string().min(20, "That does not look like a Canvas access token"),
});

export const importRosterSchema = z.object({
  /** Create app accounts for Canvas students who do not have one yet. */
  createMissing: z.boolean().default(true),
});

export const linkCanvasCourseSchema = z.object({
  canvasCourseId: z.number().int().positive().nullable(),
});

export const sendMessagesSchema = z.object({
  studentIds: z.array(z.number().int()).min(1),
  intro: z.string().max(2000).optional(),
  signature: z.string().max(500).optional(),
});

export const setAbsencesSchema = z.object({
  studentId: z.number().int(),
  absences: z.number().min(0),
});

// Audit logging table for tracking all changes
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action", {
    enum: ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "PASSWORD_RESET", "ENROLL", "ARCHIVE", "CONFIRM"]
  }).notNull(),
  entityType: text("entity_type", {
    enum: ["user", "class", "assignment", "grade_contract", "student_contract", "assignment_progress", "attendance", "class_session"]
  }).notNull(),
  entityId: integer("entity_id"),
  oldValues: json("old_values").$type<Record<string, unknown> | null>(),
  newValues: json("new_values").$type<Record<string, unknown> | null>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type GradeContract = typeof gradeContracts.$inferSelect;
export type StudentContract = typeof studentContracts.$inferSelect;
export type AssignmentProgress = typeof assignmentProgress.$inferSelect;
export type StudentInvitation = typeof studentInvitations.$inferSelect;
export type InsertStudentInvitation = z.infer<typeof insertStudentInvitationSchema>;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type InsertClassSession = z.infer<typeof insertClassSessionSchema>;
export type UpdateClassSession = z.infer<typeof updateClassSessionSchema>;
export type SessionParticipation = typeof sessionParticipation.$inferSelect;
export type ParticipationEntry = z.infer<typeof participationEntrySchema>;
export type StudentAbsences = typeof studentAbsences.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;