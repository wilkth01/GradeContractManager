import { pgTable, text, serial, integer, boolean, timestamp, json, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"),
  role: text("role", { enum: ["instructor", "student"] }).notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  isTemporary: boolean("is_temporary").default(false),
});

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  instructorId: integer("instructor_id").notNull(),
  isArchived: boolean("is_archived").default(false),
  description: text("description"),
  semesterStartDate: text("semester_start_date"),
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
  assignments: json("assignments").notNull().$type<{ id: number; comments?: string }[]>(),
  requiredEngagementIntentions: integer("required_engagement_intentions").default(0),
  maxAbsences: integer("max_absences").default(0),
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

export const engagementIntentions = pgTable("engagement_intentions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  intentionText: text("intention_text").notNull(),
  isFulfilled: boolean("is_fulfilled").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
});

export const insertGradeContractSchema = createInsertSchema(gradeContracts).extend({
  assignments: z.array(assignmentRequirementSchema),
  requiredEngagementIntentions: z.number().default(0),
  maxAbsences: z.number().default(0),
});

export const insertStudentInvitationSchema = createInsertSchema(studentInvitations).pick({
  email: true,
  fullName: true,
  classId: true,
});

export const setupPasswordSchema = z.object({
  token: z.string(),
  username: z.string().min(3),
  password: z.string().min(6),
});

export const passwordResetRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertEngagementIntentionSchema = createInsertSchema(engagementIntentions).pick({
  studentId: true,
  classId: true,
  weekNumber: true,
  intentionText: true,
  isFulfilled: true,
  notes: true,
});

export const updateEngagementIntentionSchema = z.object({
  intentionText: z.string().optional(),
  isFulfilled: z.boolean().optional(),
  notes: z.string().optional(),
});

// Attendance tracking table
export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => users.id).notNull(),
  classId: integer("class_id").references(() => classes.id).notNull(),
  date: timestamp("date").notNull(),
  isPresent: boolean("is_present").notNull().default(true),
  notes: text("notes"), // Optional notes for the absence
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords);
export const updateAttendanceRecordSchema = z.object({
  isPresent: z.boolean().optional(),
  notes: z.string().optional(),
});

// Audit logging table for tracking all changes
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action", {
    enum: ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "PASSWORD_RESET", "ENROLL", "ARCHIVE", "CONFIRM"]
  }).notNull(),
  entityType: text("entity_type", {
    enum: ["user", "class", "assignment", "grade_contract", "student_contract", "assignment_progress", "attendance", "engagement_intention"]
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
export type EngagementIntention = typeof engagementIntentions.$inferSelect;
export type InsertEngagementIntention = z.infer<typeof insertEngagementIntentionSchema>;
export type UpdateEngagementIntention = z.infer<typeof updateEngagementIntentionSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type UpdateAttendanceRecord = z.infer<typeof updateAttendanceRecordSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;