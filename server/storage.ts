import { User, InsertUser, Class, Assignment, GradeContract, StudentContract, AssignmentProgress, StudentInvitation, InsertStudentInvitation, PasswordResetRequest, ClassSession, SessionParticipation, ParticipationEntry, StudentAbsences } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, inArray, sql, lt, max } from "drizzle-orm";
import { users, classes, assignments, gradeContracts, studentContracts, assignmentProgress, studentInvitations, passwordResetRequests, sessionParticipation, studentAbsences, classSessions } from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import crypto from "crypto";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  setCanvasToken(userId: number, encrypted: string | null): Promise<void>;
  setCanvasUserId(userId: number, canvasUserId: number | null): Promise<void>;
  linkCanvasCourse(classId: number, updates: { canvasCourseId?: number | null; canvasAbsenceAssignmentId?: number | null }): Promise<Class>;
  setCanvasAssignmentIds(classId: number, mappings: { assignmentId: number; canvasAssignmentId: number | null }[]): Promise<void>;

  createClass(classData: Omit<Class, "id" | "isArchived">): Promise<Class>;
  getClass(id: number): Promise<Class | undefined>;
  getClassesByInstructor(instructorId: number): Promise<Class[]>;
  archiveClass(id: number): Promise<void>;
  unarchiveClass(id: number): Promise<void>;
  deleteClass(id: number): Promise<void>;

  createAssignment(assignment: Omit<Assignment, "id" | "displayOrder">): Promise<Assignment>;
  getAssignmentsByClass(classId: number): Promise<Assignment[]>;
  updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment | undefined>;
  deleteAssignment(id: number): Promise<void>;
  reorderAssignments(classId: number, assignmentIds: number[]): Promise<void>;

  createGradeContract(contract: Omit<GradeContract, "id">): Promise<GradeContract>;
  getContractsByClass(classId: number): Promise<GradeContract[]>;
  publishContractVersion(
    previous: GradeContract,
    changes: Omit<GradeContract, "id" | "version">
  ): Promise<{ contract: GradeContract; movedStudents: number }>;

  setStudentContract(contract: Omit<StudentContract, "id">): Promise<StudentContract>;
  getStudentContract(studentId: number, classId: number): Promise<StudentContract | undefined>;
  getStudentContractsByClass(classId: number): Promise<StudentContract[]>;
  getEnrollmentCounts(classIds: number[]): Promise<Map<number, number>>;

  updateProgress(progress: Omit<AssignmentProgress, "id">): Promise<AssignmentProgress>;
  getStudentProgress(studentId: number, classId: number): Promise<AssignmentProgress[]>;
  getStudentProgressForClass(classId: number): Promise<AssignmentProgress[]>;

  sessionStore: session.Store;

  enrollStudent(classId: number, studentId: number): Promise<void>;
  getEnrolledStudents(classId: number): Promise<User[]>;
  getClassesByStudent(studentId: number): Promise<Class[]>;
  updateClass(id: number, updates: Partial<Omit<Class, "id" | "instructorId">>): Promise<Class>;
  confirmStudentContract(studentId: number, classId: number): Promise<StudentContract>;
  resetStudentContract(studentId: number, classId: number): Promise<StudentContract>;

  // Student invitation methods
  createStudentInvitation(invitation: InsertStudentInvitation & { userId?: number | null }): Promise<StudentInvitation>;
  getUserByCanvasId(canvasUserId: number): Promise<User | undefined>;
  createCanvasStudent(input: { username: string; fullName: string; email: string | null; canvasUserId: number }): Promise<User>;
  getStudentInvitationByToken(token: string): Promise<StudentInvitation | undefined>;
  markInvitationAsUsed(token: string): Promise<void>;
  getInvitationsByClass(classId: number): Promise<StudentInvitation[]>;
  deleteExpiredInvitations(): Promise<void>;
  createTemporaryStudent(email: string, fullName: string): Promise<User>;
  setupStudentPassword(token: string, username: string, password: string): Promise<User>;

  // Password reset methods
  createPasswordResetRequest(userId: number): Promise<PasswordResetRequest>;
  getPasswordResetByToken(token: string): Promise<PasswordResetRequest | undefined>;
  markPasswordResetAsUsed(token: string): Promise<void>;
  resetUserPassword(userId: number, newPassword: string): Promise<User>;
  getUnnotifiedPasswordResets(): Promise<PasswordResetRequest[]>;
  markPasswordResetAsNotified(id: number): Promise<void>;
  deleteExpiredPasswordResets(): Promise<void>;

  // Class sessions and attendance
  createClassSession(session: { classId: number; date: Date; topic?: string | null; notes?: string | null }): Promise<ClassSession>;
  getClassSessions(classId: number): Promise<ClassSession[]>;
  getClassSession(sessionId: number): Promise<ClassSession | undefined>;
  updateClassSession(sessionId: number, updates: { date?: Date; topic?: string | null; notes?: string | null }): Promise<ClassSession>;
  deleteClassSession(sessionId: number): Promise<void>;
  getSessionParticipation(sessionId: number): Promise<SessionParticipation[]>;
  recordSessionParticipation(sessionId: number, entries: ParticipationEntry[]): Promise<void>;
  getClassParticipation(classId: number): Promise<SessionParticipation[]>;
  getStudentParticipation(studentId: number, classId: number): Promise<SessionParticipation[]>;
  getClassAbsences(classId: number): Promise<StudentAbsences[]>;
  getStudentAbsences(studentId: number, classId: number): Promise<StudentAbsences | undefined>;
  setStudentAbsences(studentId: number, classId: number, absences: number, source?: string): Promise<StudentAbsences>;

  // Clone class methods
  cloneClass(classId: number, instructorId: number): Promise<Class>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async setCanvasToken(userId: number, encrypted: string | null): Promise<void> {
    await db.update(users).set({ canvasTokenEncrypted: encrypted }).where(eq(users.id, userId));
  }

  async setCanvasUserId(userId: number, canvasUserId: number | null): Promise<void> {
    await db.update(users).set({ canvasUserId }).where(eq(users.id, userId));
  }

  async linkCanvasCourse(
    classId: number,
    updates: { canvasCourseId?: number | null; canvasAbsenceAssignmentId?: number | null }
  ): Promise<Class> {
    const [updated] = await db
      .update(classes)
      .set({
        ...(updates.canvasCourseId !== undefined
          ? { canvasCourseId: updates.canvasCourseId }
          : {}),
        ...(updates.canvasAbsenceAssignmentId !== undefined
          ? { canvasAbsenceAssignmentId: updates.canvasAbsenceAssignmentId }
          : {}),
      })
      .where(eq(classes.id, classId))
      .returning();
    return updated;
  }

  /** Scoped to the class, so a mapping cannot reach another class's assignment. */
  async setCanvasAssignmentIds(
    classId: number,
    mappings: { assignmentId: number; canvasAssignmentId: number | null }[]
  ): Promise<void> {
    if (mappings.length === 0) return;

    await db.transaction(async (tx) => {
      for (const mapping of mappings) {
        await tx
          .update(assignments)
          .set({ canvasAssignmentId: mapping.canvasAssignmentId })
          .where(
            and(eq(assignments.id, mapping.assignmentId), eq(assignments.classId, classId))
          );
      }
    });
  }

  async createClass(classData: Omit<Class, "id" | "isArchived">): Promise<Class> {
    const [newClass] = await db
      .insert(classes)
      .values({ ...classData, isArchived: false })
      .returning();
    return newClass;
  }

  async getClass(id: number): Promise<Class | undefined> {
    const [cls] = await db.select().from(classes).where(eq(classes.id, id));
    return cls;
  }

  async getClassesByInstructor(instructorId: number): Promise<Class[]> {
    return db.select().from(classes).where(eq(classes.instructorId, instructorId));
  }

  async archiveClass(id: number): Promise<void> {
    await db.update(classes).set({ isArchived: true }).where(eq(classes.id, id));
  }

  async unarchiveClass(id: number): Promise<void> {
    await db.update(classes).set({ isArchived: false }).where(eq(classes.id, id));
  }

  async deleteClass(id: number): Promise<void> {
    // Delete in order to respect foreign key constraints
    // First delete all related data

    // Get all assignments for this class
    const classAssignments = await this.getAssignmentsByClass(id);
    const assignmentIds = classAssignments.map(a => a.id);

    // Delete assignment progress for all assignments in this class
    if (assignmentIds.length > 0) {
      await db.delete(assignmentProgress).where(inArray(assignmentProgress.assignmentId, assignmentIds));
    }

    // Delete all assignments for this class
    await db.delete(assignments).where(eq(assignments.classId, id));

    // Delete all grade contracts for this class
    await db.delete(gradeContracts).where(eq(gradeContracts.classId, id));

    // Delete all student contracts for this class
    await db.delete(studentContracts).where(eq(studentContracts.classId, id));

    // Delete all student invitations for this class
    await db.delete(studentInvitations).where(eq(studentInvitations.classId, id));

    // Delete attendance, then the sessions it hangs off
    const sessions = await db
      .select({ id: classSessions.id })
      .from(classSessions)
      .where(eq(classSessions.classId, id));
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      await db.delete(sessionParticipation).where(inArray(sessionParticipation.sessionId, sessionIds));
    }
    await db.delete(classSessions).where(eq(classSessions.classId, id));
    await db.delete(studentAbsences).where(eq(studentAbsences.classId, id));

    // Finally delete the class itself
    await db.delete(classes).where(eq(classes.id, id));
  }

  async createAssignment(assignment: Omit<Assignment, "id" | "displayOrder">): Promise<Assignment> {
    // Get the max displayOrder for this class and add 1
    const result = await db
      .select({ maxOrder: max(assignments.displayOrder) })
      .from(assignments)
      .where(eq(assignments.classId, assignment.classId));

    const nextOrder = (result[0]?.maxOrder ?? -1) + 1;

    const [newAssignment] = await db
      .insert(assignments)
      .values({ ...assignment, displayOrder: nextOrder })
      .returning();
    return newAssignment;
  }

  async getAssignmentsByClass(classId: number): Promise<Assignment[]> {
    return db
      .select()
      .from(assignments)
      .where(eq(assignments.classId, classId))
      .orderBy(asc(assignments.displayOrder));
  }

  async reorderAssignments(classId: number, assignmentIds: number[]): Promise<void> {
    // Update each assignment's displayOrder based on its position in the array
    await Promise.all(
      assignmentIds.map((id, index) =>
        db
          .update(assignments)
          .set({ displayOrder: index })
          .where(and(eq(assignments.id, id), eq(assignments.classId, classId)))
      )
    );
  }

  async updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment | undefined> {
    const [updatedAssignment] = await db
      .update(assignments)
      .set(data)
      .where(eq(assignments.id, id))
      .returning();
    return updatedAssignment;
  }

  async deleteAssignment(id: number): Promise<void> {
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  async createGradeContract(contract: Omit<GradeContract, "id">): Promise<GradeContract> {
    const [newContract] = await db.insert(gradeContracts).values(contract).returning();
    return newContract;
  }

  async getContractsByClass(classId: number): Promise<GradeContract[]> {
    return db.select().from(gradeContracts).where(eq(gradeContracts.classId, classId));
  }

  /**
   * Publish an edited contract as a new version.
   *
   * Every student on the previous version moves to the new one, whether or not
   * they had confirmed, and keeps their confirmation. The syllabus reserves the
   * right to change a contract mid-semester and it is only ever exercised to
   * reduce requirements, so applying the change to everyone is both what was
   * agreed and what benefits students -- holding someone to superseded, stricter
   * terms would be the harm here.
   *
   * The previous row is kept rather than overwritten, so there is a record of
   * what the contract used to require if a student ever asks.
   */
  async publishContractVersion(
    previous: GradeContract,
    changes: Omit<GradeContract, "id" | "version">
  ): Promise<{ contract: GradeContract; movedStudents: number }> {
    return db.transaction(async (tx) => {
      const [published] = await tx
        .insert(gradeContracts)
        .values({ ...changes, version: previous.version + 1 })
        .returning();

      // Only contractId changes; isConfirmed is left alone so nobody has to
      // re-confirm a contract they already accepted.
      const moved = await tx
        .update(studentContracts)
        .set({ contractId: published.id })
        .where(eq(studentContracts.contractId, previous.id))
        .returning();

      return { contract: published, movedStudents: moved.length };
    });
  }

  async setStudentContract(contract: Omit<StudentContract, "id">): Promise<StudentContract> {
    const existing = await this.getStudentContract(contract.studentId, contract.classId);

    if (existing) {
      const [updated] = await db
        .update(studentContracts)
        .set({ contractId: contract.contractId })
        .where(
          and(
            eq(studentContracts.studentId, contract.studentId),
            eq(studentContracts.classId, contract.classId)
          )
        )
        .returning();
      return updated;
    }

    const [newContract] = await db.insert(studentContracts).values(contract).returning();
    return newContract;
  }

  async getStudentContract(studentId: number, classId: number): Promise<StudentContract | undefined> {
    const [contract] = await db
      .select()
      .from(studentContracts)
      .where(
        and(
          eq(studentContracts.studentId, studentId),
          eq(studentContracts.classId, classId)
        )
      );
    return contract;
  }

  /**
   * Enrolled student count per class, in one query rather than one per class.
   */
  async getEnrollmentCounts(classIds: number[]): Promise<Map<number, number>> {
    if (classIds.length === 0) return new Map();

    const rows = await db
      .select({
        classId: studentContracts.classId,
        count: sql<number>`count(*)::int`,
      })
      .from(studentContracts)
      .innerJoin(users, eq(users.id, studentContracts.studentId))
      .where(and(inArray(studentContracts.classId, classIds), eq(users.role, "student")))
      .groupBy(studentContracts.classId);

    return new Map(rows.map((row) => [row.classId, row.count]));
  }

  async getStudentContractsByClass(classId: number): Promise<StudentContract[]> {
    return db
      .select()
      .from(studentContracts)
      .where(eq(studentContracts.classId, classId));
  }

  async updateProgress(progress: Omit<AssignmentProgress, "id">): Promise<AssignmentProgress> {
    const existing = await db
      .select()
      .from(assignmentProgress)
      .where(
        and(
          eq(assignmentProgress.studentId, progress.studentId),
          eq(assignmentProgress.assignmentId, progress.assignmentId)
        )
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(assignmentProgress)
        .set(progress)
        .where(eq(assignmentProgress.id, existing[0].id))
        .returning();
      return updated;
    }

    const [newProgress] = await db.insert(assignmentProgress).values(progress).returning();
    return newProgress;
  }

  async getStudentProgress(studentId: number, classId: number): Promise<AssignmentProgress[]> {
    const classAssignments = await this.getAssignmentsByClass(classId);
    const assignmentIds = classAssignments.map(a => a.id);

    return db
      .select()
      .from(assignmentProgress)
      .where(
        and(
          eq(assignmentProgress.studentId, studentId),
          inArray(assignmentProgress.assignmentId, assignmentIds)
        )
      );
  }

  async getStudentProgressForClass(classId: number): Promise<AssignmentProgress[]> {
    const classAssignments = await this.getAssignmentsByClass(classId);
    const assignmentIds = classAssignments.map(a => a.id);

    return db
      .select()
      .from(assignmentProgress)
      .where(inArray(assignmentProgress.assignmentId, assignmentIds));
  }

  async getStudentContractsForClass(classId: number): Promise<(StudentContract & { contract?: GradeContract })[]> {
    const result = await db
      .select({
        id: studentContracts.id,
        studentId: studentContracts.studentId,
        classId: studentContracts.classId,
        contractId: studentContracts.contractId,
        isConfirmed: studentContracts.isConfirmed,
        contract: gradeContracts,
      })
      .from(studentContracts)
      .leftJoin(gradeContracts, eq(studentContracts.contractId, gradeContracts.id))
      .where(eq(studentContracts.classId, classId));

    return result.map(row => ({
      id: row.id,
      studentId: row.studentId,
      classId: row.classId,
      contractId: row.contractId,
      isConfirmed: row.isConfirmed,
      contract: row.contract || undefined,
    }));
  }

  async enrollStudent(classId: number, studentId: number): Promise<void> {
    const existingContract = await this.getStudentContract(studentId, classId);
    if (!existingContract) {
      console.log(`Enrolling student ${studentId} in class ${classId}`);
      try {
        await db.insert(studentContracts).values({
          studentId,
          classId,
          contractId: null,
        });
        console.log(`Successfully enrolled student ${studentId} in class ${classId}`);
      } catch (error) {
        console.error(`Error enrolling student ${studentId} in class ${classId}:`, error);
        throw error;
      }
    }
  }

  async getEnrolledStudents(classId: number): Promise<User[]> {
    try {
      const enrolledStudents = await db
        .select()
        .from(users)
        .innerJoin(studentContracts, eq(users.id, studentContracts.studentId))
        .where(
          and(
            eq(studentContracts.classId, classId),
            eq(users.role, "student")
          )
        );
      return enrolledStudents.map(row => row.users);
    } catch (error) {
      console.error(`Error getting enrolled students for class ${classId}:`, error);
      throw error;
    }
  }
  async getClassesByStudent(studentId: number): Promise<Class[]> {
    try {
      const studentClasses = await db
        .select()
        .from(classes)
        .innerJoin(
          studentContracts,
          and(
            eq(studentContracts.classId, classes.id),
            eq(studentContracts.studentId, studentId)
          )
        )
        .where(eq(classes.isArchived, false));

      return studentClasses.map(row => row.classes);
    } catch (error) {
      console.error(`Error getting classes for student ${studentId}:`, error);
      throw error;
    }
  }
  async updateClass(
    id: number,
    updates: Partial<Omit<Class, "id" | "instructorId">>
  ): Promise<Class> {
    const [updatedClass] = await db
      .update(classes)
      .set(updates)
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  async confirmStudentContract(
    studentId: number,
    classId: number
  ): Promise<StudentContract> {
    const [contract] = await db
      .update(studentContracts)
      .set({ isConfirmed: true })
      .where(
        and(
          eq(studentContracts.studentId, studentId),
          eq(studentContracts.classId, classId)
        )
      )
      .returning();
    return contract;
  }

  async resetStudentContract(
    studentId: number,
    classId: number
  ): Promise<StudentContract> {
    const [contract] = await db
      .update(studentContracts)
      .set({ isConfirmed: false })
      .where(
        and(
          eq(studentContracts.studentId, studentId),
          eq(studentContracts.classId, classId)
        )
      )
      .returning();
    return contract;
  }

  // Student invitation methods
  async getUserByCanvasId(canvasUserId: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.canvasUserId, canvasUserId));
    return user;
  }

  /**
   * Create a student account from a Canvas roster entry.
   *
   * No password: the account is unusable until the student redeems an
   * invitation, which is what isTemporary marks.
   */
  async createCanvasStudent(input: {
    username: string;
    fullName: string;
    email: string | null;
    canvasUserId: number;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        username: input.username,
        password: null,
        fullName: input.fullName,
        email: input.email,
        role: "student",
        isTemporary: true,
        canvasUserId: input.canvasUserId,
      })
      .returning();
    return user;
  }

  async createStudentInvitation(
    invitation: InsertStudentInvitation & { userId?: number | null }
  ): Promise<StudentInvitation> {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const [newInvitation] = await db
      .insert(studentInvitations)
      .values({
        ...invitation,
        token,
        expiresAt,
      })
      .returning();

    return newInvitation;
  }

  async getStudentInvitationByToken(token: string): Promise<StudentInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(studentInvitations)
      .where(eq(studentInvitations.token, token));

    return invitation;
  }

  async markInvitationAsUsed(token: string): Promise<void> {
    await db
      .update(studentInvitations)
      .set({ isUsed: true })
      .where(eq(studentInvitations.token, token));
  }

  async getInvitationsByClass(classId: number): Promise<StudentInvitation[]> {
    return db
      .select()
      .from(studentInvitations)
      .where(eq(studentInvitations.classId, classId));
  }

  async deleteExpiredInvitations(): Promise<void> {
    await db
      .delete(studentInvitations)
      .where(lt(studentInvitations.expiresAt, new Date()));
  }

  async createTemporaryStudent(email: string, fullName: string): Promise<User> {
    const username = email.split('@')[0] + '_temp_' + Date.now();

    const [newUser] = await db
      .insert(users)
      .values({
        username,
        password: null,
        email,
        fullName,
        role: 'student',
        isTemporary: true,
      })
      .returning();

    return newUser;
  }

  /**
   * Redeem an invitation by setting a password.
   *
   * An invitation that names a userId belongs to an account that already
   * exists -- imported from a Canvas roster -- so this only sets the password.
   * Letting that student invent a second username would orphan the account the
   * class is enrolled against.
   */
  async setupStudentPassword(
    token: string,
    username: string | undefined,
    password: string
  ): Promise<User> {
    const invitation = await this.getStudentInvitationByToken(token);
    if (!invitation || invitation.isUsed || invitation.expiresAt < new Date()) {
      throw new Error("Invalid or expired invitation token");
    }

    let user: User;

    if (invitation.userId) {
      const [updated] = await db
        .update(users)
        .set({ password, isTemporary: false })
        .where(eq(users.id, invitation.userId))
        .returning();
      if (!updated) {
        throw new Error("The account for this invitation no longer exists");
      }
      user = updated;
    } else {
      if (!username) {
        throw new Error("A username is required");
      }

      const existingUser = await this.getUserByUsername(username);

      if (existingUser && existingUser.isTemporary) {
        const [updatedUser] = await db
          .update(users)
          .set({ username, password, isTemporary: false })
          .where(eq(users.id, existingUser.id))
          .returning();
        user = updatedUser;
      } else if (!existingUser) {
        const [newUser] = await db
          .insert(users)
          .values({
            username,
            password,
            email: invitation.email,
            fullName: invitation.fullName,
            role: "student",
            isTemporary: false,
          })
          .returning();
        user = newUser;
      } else {
        throw new Error("Username already exists");
      }
    }

    await this.enrollStudent(invitation.classId, user.id);
    await this.markInvitationAsUsed(token);

    return user;
  }

  // Password reset methods
  async createPasswordResetRequest(userId: number): Promise<PasswordResetRequest> {
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiration

    const [resetRequest] = await db
      .insert(passwordResetRequests)
      .values({
        userId,
        token,
        expiresAt,
      })
      .returning();

    return resetRequest;
  }

  async getPasswordResetByToken(token: string): Promise<PasswordResetRequest | undefined> {
    const [resetRequest] = await db
      .select()
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.token, token));

    return resetRequest;
  }

  async markPasswordResetAsUsed(token: string): Promise<void> {
    await db
      .update(passwordResetRequests)
      .set({ isUsed: true })
      .where(eq(passwordResetRequests.token, token));
  }

  async resetUserPassword(userId: number, newPassword: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ password: newPassword })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async getUnnotifiedPasswordResets(): Promise<PasswordResetRequest[]> {
    return db
      .select()
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.adminNotified, false),
          eq(passwordResetRequests.isUsed, false),
          // Only get recent requests (not expired)
          // gt(passwordResetRequests.expiresAt, new Date())
        )
      );
  }

  async markPasswordResetAsNotified(id: number): Promise<void> {
    await db
      .update(passwordResetRequests)
      .set({ adminNotified: true })
      .where(eq(passwordResetRequests.id, id));
  }

  async deleteExpiredPasswordResets(): Promise<void> {
    await db
      .delete(passwordResetRequests)
      .where(lt(passwordResetRequests.expiresAt, new Date()));
  }

  // ==========================================================================
  // Class sessions and attendance
  // ==========================================================================

  async createClassSession(session: {
    classId: number;
    date: Date;
    topic?: string | null;
    notes?: string | null;
  }): Promise<ClassSession> {
    const [created] = await db
      .insert(classSessions)
      .values({
        classId: session.classId,
        date: session.date,
        topic: session.topic ?? null,
        notes: session.notes ?? null,
      })
      .returning();
    return created;
  }

  async getClassSessions(classId: number): Promise<ClassSession[]> {
    return db
      .select()
      .from(classSessions)
      .where(eq(classSessions.classId, classId))
      .orderBy(desc(classSessions.date));
  }

  async getClassSession(sessionId: number): Promise<ClassSession | undefined> {
    const [session] = await db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, sessionId));
    return session;
  }

  async updateClassSession(
    sessionId: number,
    updates: { date?: Date; topic?: string | null; notes?: string | null }
  ): Promise<ClassSession> {
    const [updated] = await db
      .update(classSessions)
      .set(updates)
      .where(eq(classSessions.id, sessionId))
      .returning();
    return updated;
  }

  async deleteClassSession(sessionId: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(sessionParticipation).where(eq(sessionParticipation.sessionId, sessionId));
      await tx.delete(classSessions).where(eq(classSessions.id, sessionId));
    });
  }

  async getSessionParticipation(sessionId: number): Promise<SessionParticipation[]> {
    return db
      .select()
      .from(sessionParticipation)
      .where(eq(sessionParticipation.sessionId, sessionId));
  }

  /**
   * Record participation for a whole session in one statement.
   *
   * The unique constraint on (session_id, student_id) makes this a real upsert
   * rather than a query-per-student loop.
   */
  async recordSessionParticipation(
    sessionId: number,
    entries: ParticipationEntry[]
  ): Promise<void> {
    if (entries.length === 0) return;

    await db
      .insert(sessionParticipation)
      .values(
        entries.map((entry) => ({
          sessionId,
          studentId: entry.studentId,
          participation: entry.participation ?? null,
          notes: entry.notes ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [sessionParticipation.sessionId, sessionParticipation.studentId],
        set: {
          participation: sql`excluded.participation`,
          notes: sql`excluded.notes`,
        },
      });
  }

  async getClassParticipation(classId: number): Promise<SessionParticipation[]> {
    const rows = await db
      .select({ record: sessionParticipation })
      .from(sessionParticipation)
      .innerJoin(classSessions, eq(sessionParticipation.sessionId, classSessions.id))
      .where(eq(classSessions.classId, classId))
      .orderBy(desc(classSessions.date));
    return rows.map((row) => row.record);
  }

  async getStudentParticipation(
    studentId: number,
    classId: number
  ): Promise<SessionParticipation[]> {
    const rows = await db
      .select({ record: sessionParticipation })
      .from(sessionParticipation)
      .innerJoin(classSessions, eq(sessionParticipation.sessionId, classSessions.id))
      .where(
        and(
          eq(sessionParticipation.studentId, studentId),
          eq(classSessions.classId, classId)
        )
      )
      .orderBy(desc(classSessions.date));
    return rows.map((row) => row.record);
  }

  // ==========================================================================
  // Absence totals imported from Qwickly by way of Canvas
  // ==========================================================================

  async getClassAbsences(classId: number): Promise<StudentAbsences[]> {
    return db.select().from(studentAbsences).where(eq(studentAbsences.classId, classId));
  }

  async getStudentAbsences(
    studentId: number,
    classId: number
  ): Promise<StudentAbsences | undefined> {
    const [row] = await db
      .select()
      .from(studentAbsences)
      .where(
        and(
          eq(studentAbsences.studentId, studentId),
          eq(studentAbsences.classId, classId)
        )
      );
    return row;
  }

  async setStudentAbsences(
    studentId: number,
    classId: number,
    absences: number,
    source: string = "canvas"
  ): Promise<StudentAbsences> {
    const [row] = await db
      .insert(studentAbsences)
      .values({ studentId, classId, absences: absences.toString(), source })
      .onConflictDoUpdate({
        target: [studentAbsences.studentId, studentAbsences.classId],
        set: {
          absences: sql`excluded.absences`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async cloneClass(classId: number, instructorId: number): Promise<Class> {
    // Fetch source class
    const sourceClass = await this.getClass(classId);
    if (!sourceClass) {
      throw new Error("Source class not found");
    }

    // Create new class with " (Copy)" suffix
    const [newClass] = await db
      .insert(classes)
      .values({
        name: sourceClass.name + " (Copy)",
        instructorId,
        isArchived: false,
        description: sourceClass.description,
        semesterStartDate: sourceClass.semesterStartDate,
      })
      .returning();

    // Clone assignments and build old-to-new ID map
    const sourceAssignments = await this.getAssignmentsByClass(classId);
    const assignmentIdMap = new Map<number, number>();

    for (const assignment of sourceAssignments) {
      const [newAssignment] = await db
        .insert(assignments)
        .values({
          name: assignment.name,
          classId: newClass.id,
          moduleGroup: assignment.moduleGroup,
          scoringType: assignment.scoringType,
          displayOrder: assignment.displayOrder,
          dueDate: assignment.dueDate,
        })
        .returning();
      assignmentIdMap.set(assignment.id, newAssignment.id);
    }

    // Clone grade contracts with remapped assignment IDs
    const sourceContracts = await this.getContractsByClass(classId);
    for (const contract of sourceContracts) {
      const remappedAssignments = (contract.assignments as { id: number; comments?: string; minPoints?: number }[]).map(
        (a) => ({
          ...a,
          id: assignmentIdMap.get(a.id) ?? a.id,
        })
      );

      await db.insert(gradeContracts).values({
        classId: newClass.id,
        grade: contract.grade,
        version: contract.version,
        assignments: remappedAssignments,
        requiredParticipationSessions: contract.requiredParticipationSessions,
        maxAbsences: contract.maxAbsences,
        categoryRequirements: contract.categoryRequirements,
      });
    }

    return newClass;
  }
}

export const storage = new DatabaseStorage();