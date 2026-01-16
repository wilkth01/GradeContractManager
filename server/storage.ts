import { User, InsertUser, Class, Assignment, GradeContract, StudentContract, AssignmentProgress, StudentInvitation, InsertStudentInvitation, PasswordResetRequest, EngagementIntention, InsertEngagementIntention, UpdateEngagementIntention, AttendanceRecord, InsertAttendanceRecord, UpdateAttendanceRecord } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, inArray, sql, lt, max } from "drizzle-orm";
import { users, classes, assignments, gradeContracts, studentContracts, assignmentProgress, studentInvitations, passwordResetRequests, engagementIntentions, attendanceRecords } from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import crypto from "crypto";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createClass(classData: Omit<Class, "id" | "isArchived">): Promise<Class>;
  getClass(id: number): Promise<Class | undefined>;
  getClassesByInstructor(instructorId: number): Promise<Class[]>;
  archiveClass(id: number): Promise<void>;

  createAssignment(assignment: Omit<Assignment, "id" | "displayOrder">): Promise<Assignment>;
  getAssignmentsByClass(classId: number): Promise<Assignment[]>;
  updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment | undefined>;
  deleteAssignment(id: number): Promise<void>;
  reorderAssignments(classId: number, assignmentIds: number[]): Promise<void>;

  createGradeContract(contract: Omit<GradeContract, "id">): Promise<GradeContract>;
  getContractsByClass(classId: number): Promise<GradeContract[]>;
  updateGradeContract(contract: GradeContract): Promise<GradeContract>;

  setStudentContract(contract: Omit<StudentContract, "id">): Promise<StudentContract>;
  getStudentContract(studentId: number, classId: number): Promise<StudentContract | undefined>;
  getStudentContractsByClass(classId: number): Promise<StudentContract[]>;

  updateProgress(progress: Omit<AssignmentProgress, "id">): Promise<AssignmentProgress>;
  getStudentProgress(studentId: number, classId: number): Promise<AssignmentProgress[]>;

  sessionStore: session.Store;

  enrollStudent(classId: number, studentId: number): Promise<void>;
  getEnrolledStudents(classId: number): Promise<User[]>;
  getClassesByStudent(studentId: number): Promise<Class[]>;
  updateClass(id: number, updates: Partial<Omit<Class, "id" | "instructorId">>): Promise<Class>;
  confirmStudentContract(studentId: number, classId: number): Promise<StudentContract>;
  resetStudentContract(studentId: number, classId: number): Promise<StudentContract>;

  // Student invitation methods
  createStudentInvitation(invitation: InsertStudentInvitation): Promise<StudentInvitation>;
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

  // Engagement intention methods
  createEngagementIntention(intention: InsertEngagementIntention): Promise<EngagementIntention>;
  getEngagementIntention(studentId: number, classId: number, weekNumber: number): Promise<EngagementIntention | undefined>;
  getEngagementIntentionById(id: number): Promise<EngagementIntention | undefined>;
  updateEngagementIntention(id: number, updates: UpdateEngagementIntention): Promise<EngagementIntention>;
  getStudentEngagementIntentions(studentId: number, classId: number): Promise<EngagementIntention[]>;
  getClassEngagementIntentions(classId: number): Promise<EngagementIntention[]>;
  getCurrentWeekEngagementIntentions(classId: number, weekNumber: number): Promise<EngagementIntention[]>;

  // Attendance tracking methods
  getStudentAttendance(studentId: number, classId: number): Promise<AttendanceRecord[]>;
  getAttendanceRecord(attendanceId: number): Promise<AttendanceRecord | undefined>;
  createAttendanceRecord(attendance: InsertAttendanceRecord): Promise<AttendanceRecord>;
  updateAttendanceRecord(attendanceId: number, updates: UpdateAttendanceRecord): Promise<AttendanceRecord>;
  // Instructor dashboard attendance methods
  getAttendanceForClass(classId: number): Promise<AttendanceRecord[]>;
  getAttendanceForStudentInClass(studentId: number, classId: number): Promise<AttendanceRecord[]>;
  updateStudentAttendance(studentId: number, classId: number, date: Date, status: 'present' | 'absent' | 'tardy' | 'excused'): Promise<AttendanceRecord>;
  createStudentAttendance(studentId: number, classId: number, date: Date, status: 'present' | 'absent' | 'tardy' | 'excused'): Promise<AttendanceRecord>;
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

  async updateGradeContract(contract: GradeContract): Promise<GradeContract> {
    const [updatedContract] = await db
      .update(gradeContracts)
      .set(contract)
      .where(eq(gradeContracts.id, contract.id))
      .returning();
    return updatedContract;
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

  async getClassStudents(classId: number): Promise<User[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        role: users.role,
        fullName: users.fullName,
        email: users.email,
        isTemporary: users.isTemporary,
      })
      .from(users)
      .innerJoin(studentContracts, eq(users.id, studentContracts.studentId))
      .where(eq(studentContracts.classId, classId));

    return result;
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
      console.log(`Fetching enrolled students for class ${classId}`);
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
      console.log(`Found ${enrolledStudents.length} enrolled students for class ${classId}`);

      return enrolledStudents.map(row => ({
        id: row.users.id,
        username: row.users.username,
        password: row.users.password,
        role: row.users.role,
        fullName: row.users.fullName,
        email: row.users.email,
        isTemporary: row.users.isTemporary,
      }));
    } catch (error) {
      console.error(`Error getting enrolled students for class ${classId}:`, error);
      throw error;
    }
  }
  async getClassesByStudent(studentId: number): Promise<Class[]> {
    try {
      console.log(`Fetching classes for student ${studentId}`);
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

      console.log(`Found ${studentClasses.length} classes for student ${studentId}`);

      return studentClasses.map(row => ({
        id: row.classes.id,
        name: row.classes.name,
        instructorId: row.classes.instructorId,
        isArchived: row.classes.isArchived ?? false,
        description: row.classes.description ?? null,
        semesterStartDate: row.classes.semesterStartDate ?? null,
      }));
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
  async createStudentInvitation(invitation: InsertStudentInvitation): Promise<StudentInvitation> {
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

  async setupStudentPassword(token: string, username: string, password: string): Promise<User> {
    const invitation = await this.getStudentInvitationByToken(token);
    if (!invitation || invitation.isUsed || invitation.expiresAt < new Date()) {
      throw new Error('Invalid or expired invitation token');
    }

    // Create or update the student user
    const existingUser = await this.getUserByUsername(username);
    let user: User;

    if (existingUser && existingUser.isTemporary) {
      // Update temporary user
      const [updatedUser] = await db
        .update(users)
        .set({
          username,
          password,
          isTemporary: false,
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      user = updatedUser;
    } else if (!existingUser) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password,
          email: invitation.email,
          fullName: invitation.fullName,
          role: 'student',
          isTemporary: false,
        })
        .returning();
      user = newUser;
    } else {
      throw new Error('Username already exists');
    }

    // Enroll the student in the class
    await this.enrollStudent(invitation.classId, user.id);

    // Mark invitation as used
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

  // Engagement intention methods
  async createEngagementIntention(intention: InsertEngagementIntention): Promise<EngagementIntention> {
    const [newIntention] = await db
      .insert(engagementIntentions)
      .values({
        ...intention,
        updatedAt: new Date(),
      })
      .returning();
    return newIntention;
  }

  async getEngagementIntention(
    studentId: number,
    classId: number,
    weekNumber: number
  ): Promise<EngagementIntention | undefined> {
    const [intention] = await db
      .select()
      .from(engagementIntentions)
      .where(
        and(
          eq(engagementIntentions.studentId, studentId),
          eq(engagementIntentions.classId, classId),
          eq(engagementIntentions.weekNumber, weekNumber)
        )
      );
    return intention;
  }

  async getEngagementIntentionById(id: number): Promise<EngagementIntention | undefined> {
    const [intention] = await db
      .select()
      .from(engagementIntentions)
      .where(eq(engagementIntentions.id, id));
    return intention;
  }

  async updateEngagementIntention(
    id: number,
    updates: UpdateEngagementIntention
  ): Promise<EngagementIntention> {
    const [updatedIntention] = await db
      .update(engagementIntentions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(engagementIntentions.id, id))
      .returning();
    return updatedIntention;
  }

  async getStudentEngagementIntentions(
    studentId: number,
    classId: number
  ): Promise<EngagementIntention[]> {
    return db
      .select()
      .from(engagementIntentions)
      .where(
        and(
          eq(engagementIntentions.studentId, studentId),
          eq(engagementIntentions.classId, classId)
        )
      )
      .orderBy(engagementIntentions.weekNumber);
  }

  async getClassEngagementIntentions(classId: number): Promise<EngagementIntention[]> {
    return db
      .select()
      .from(engagementIntentions)
      .where(eq(engagementIntentions.classId, classId))
      .orderBy(engagementIntentions.weekNumber, engagementIntentions.studentId);
  }

  async getCurrentWeekEngagementIntentions(
    classId: number,
    weekNumber: number
  ): Promise<EngagementIntention[]> {
    return db
      .select()
      .from(engagementIntentions)
      .where(
        and(
          eq(engagementIntentions.classId, classId),
          eq(engagementIntentions.weekNumber, weekNumber)
        )
      );
  }

  // Attendance tracking methods
  async getStudentAttendance(studentId: number, classId: number): Promise<AttendanceRecord[]> {
    return db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.classId, classId)
        )
      )
      .orderBy(attendanceRecords.date);
  }

  async getAllClassAttendance(classId: number): Promise<AttendanceRecord[]> {
    return db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.classId, classId))
      .orderBy(attendanceRecords.date);
  }

  async setStudentAbsences(studentId: number, classId: number, absences: number): Promise<void> {
    // Delete all existing attendance records for this student in this class
    await db
      .delete(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.classId, classId)
        )
      );

    // Create absence records (one per absence)
    if (absences > 0) {
      const records = [];
      for (let i = 0; i < absences; i++) {
        records.push({
          studentId,
          classId,
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Stagger dates backwards
          isPresent: false,
          notes: "Manual absence count",
        });
      }
      await db.insert(attendanceRecords).values(records);
    }
  }

  async getAttendanceRecord(attendanceId: number): Promise<AttendanceRecord | undefined> {
    const result = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.id, attendanceId))
      .limit(1);
    return result[0];
  }

  async createAttendanceRecord(attendance: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [created] = await db
      .insert(attendanceRecords)
      .values(attendance)
      .returning();
    return created;
  }

  async updateAttendanceRecord(attendanceId: number, updates: UpdateAttendanceRecord): Promise<AttendanceRecord> {
    const [updated] = await db
      .update(attendanceRecords)
      .set(updates)
      .where(eq(attendanceRecords.id, attendanceId))
      .returning();
    return updated;
  }

  // Instructor dashboard attendance methods
  async getAttendanceForClass(classId: number): Promise<AttendanceRecord[]> {
    return db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.classId, classId))
      .orderBy(attendanceRecords.date);
  }

  async getAttendanceForStudentInClass(studentId: number, classId: number): Promise<AttendanceRecord[]> {
    return db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.classId, classId)
        )
      )
      .orderBy(attendanceRecords.date);
  }

  async updateStudentAttendance(studentId: number, classId: number, date: Date, status: 'present' | 'absent' | 'tardy' | 'excused'): Promise<AttendanceRecord> {
    const [updated] = await db
      .update(attendanceRecords)
      .set({ status })
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.classId, classId),
          // Use sql function for date comparison to ignore time component
          sql`${attendanceRecords.date}::date = ${date}::date`
        )
      )
      .returning();
    return updated;
  }

  async createStudentAttendance(studentId: number, classId: number, date: Date, status: 'present' | 'absent' | 'tardy' | 'excused'): Promise<AttendanceRecord> {
    const [created] = await db
      .insert(attendanceRecords)
      .values({
        studentId,
        classId,
        date,
        status,
      })
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();