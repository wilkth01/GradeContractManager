/**
 * In-memory stand-in for DatabaseStorage.
 *
 * Tests drive the real Express app and the real route modules; only the
 * persistence layer is replaced. That way an authorization mistake in a route
 * shows up as a failing test, which the previous mock-app suite could not do.
 */
import session from "express-session";
import createMemoryStore from "memorystore";
import type {
  User,
  Class,
  Assignment,
  GradeContract,
  StudentContract,
  AssignmentProgress,
  ClassSession,
  SessionParticipation,
  ParticipationEntry,
  StudentAbsences,
} from "@shared/schema";

const MemoryStore = createMemoryStore(session);

type Tables = {
  users: User[];
  classes: Class[];
  assignments: Assignment[];
  gradeContracts: GradeContract[];
  studentContracts: StudentContract[];
  progress: AssignmentProgress[];
  sessions: ClassSession[];
  participation: SessionParticipation[];
  absences: StudentAbsences[];
};

export const db: Tables = {
  users: [],
  classes: [],
  assignments: [],
  gradeContracts: [],
  studentContracts: [],
  progress: [],
  sessions: [],
  participation: [],
  absences: [],
};

let nextId = 1;
const id = () => nextId++;

export function resetDb() {
  db.users = [];
  db.classes = [];
  db.assignments = [];
  db.gradeContracts = [];
  db.studentContracts = [];
  db.progress = [];
  db.sessions = [];
  db.participation = [];
  db.absences = [];
  nextId = 1;
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

export function addUser(overrides: Partial<User> & { role: "instructor" | "student" }): User {
  const user: User = {
    id: id(),
    username: `user${nextId}`,
    password: "hashed",
    fullName: "Test User",
    email: null,
    isTemporary: false,
    canvasUserId: null,
    canvasTokenEncrypted: null,
    ...overrides,
  };
  db.users.push(user);
  return user;
}

export function addClass(instructorId: number, overrides: Partial<Class> = {}): Class {
  const cls: Class = {
    id: id(),
    name: "Test Class",
    instructorId,
    isArchived: false,
    description: null,
    semesterStartDate: null,
    absencePenaltyThreshold: null,
    absenceFailureThreshold: null,
    participationBar: null,
    canvasCourseId: null,
    canvasAbsenceAssignmentId: null,
    ...overrides,
  };
  db.classes.push(cls);
  return cls;
}

export function addAssignment(classId: number, overrides: Partial<Assignment> = {}): Assignment {
  const assignment: Assignment = {
    id: id(),
    name: "Test Assignment",
    classId,
    moduleGroup: null,
    scoringType: "status",
    displayOrder: db.assignments.filter((a) => a.classId === classId).length,
    dueDate: null,
    canvasAssignmentId: null,
    ...overrides,
  };
  db.assignments.push(assignment);
  return assignment;
}

export function addContract(classId: number, overrides: Partial<GradeContract> = {}): GradeContract {
  const contract: GradeContract = {
    id: id(),
    classId,
    grade: "A",
    version: 1,
    assignments: [],
    requiredParticipationSessions: 0,
    maxAbsences: 0,
    categoryRequirements: null,
    ...overrides,
  };
  db.gradeContracts.push(contract);
  return contract;
}

/** Enrolling is what creates the student_contracts row. */
export function enroll(classId: number, studentId: number, contractId: number | null = null): StudentContract {
  const enrollment: StudentContract = {
    id: id(),
    studentId,
    classId,
    contractId,
    isConfirmed: false,
  };
  db.studentContracts.push(enrollment);
  return enrollment;
}

// ---------------------------------------------------------------------------
// The storage surface the route modules actually use
// ---------------------------------------------------------------------------

const classStorage = {
  sessionStore: new MemoryStore({ checkPeriod: 86400000 }) as session.Store,

  async getUser(userId: number) {
    return db.users.find((u) => u.id === userId);
  },
  async getUserByUsername(username: string) {
    return db.users.find((u) => u.username === username);
  },
  async createUser(user: { username: string; password: string; fullName: string; role: string }) {
    return addUser({ ...user, role: user.role as "instructor" | "student" });
  },

  async setCanvasToken(userId: number, encrypted: string | null) {
    const user = db.users.find((u) => u.id === userId);
    if (user) user.canvasTokenEncrypted = encrypted;
  },
  async setCanvasUserId(userId: number, canvasUserId: number | null) {
    const user = db.users.find((u) => u.id === userId);
    if (user) user.canvasUserId = canvasUserId;
  },
  async linkCanvasCourse(
    classId: number,
    updates: { canvasCourseId?: number | null; canvasAbsenceAssignmentId?: number | null }
  ) {
    const cls = db.classes.find((c) => c.id === classId)!;
    if (updates.canvasCourseId !== undefined) cls.canvasCourseId = updates.canvasCourseId;
    if (updates.canvasAbsenceAssignmentId !== undefined) {
      cls.canvasAbsenceAssignmentId = updates.canvasAbsenceAssignmentId;
    }
    return cls;
  },
  async setCanvasAssignmentIds(
    classId: number,
    mappings: { assignmentId: number; canvasAssignmentId: number | null }[]
  ) {
    for (const mapping of mappings) {
      const assignment = db.assignments.find(
        (a) => a.id === mapping.assignmentId && a.classId === classId
      );
      if (assignment) assignment.canvasAssignmentId = mapping.canvasAssignmentId;
    }
  },
  async getClass(classId: number) {
    return db.classes.find((c) => c.id === classId);
  },
  async getClassesByInstructor(instructorId: number) {
    return db.classes.filter((c) => c.instructorId === instructorId);
  },
  async getClassesByStudent(studentId: number) {
    const classIds = db.studentContracts
      .filter((sc) => sc.studentId === studentId)
      .map((sc) => sc.classId);
    return db.classes.filter((c) => classIds.includes(c.id) && !c.isArchived);
  },
  async createClass(data: Omit<Class, "id" | "isArchived">) {
    return addClass(data.instructorId, data);
  },
  async updateClass(classId: number, updates: Partial<Class>) {
    const cls = db.classes.find((c) => c.id === classId)!;
    Object.assign(cls, updates);
    return cls;
  },
  async archiveClass(classId: number) {
    const cls = db.classes.find((c) => c.id === classId);
    if (cls) cls.isArchived = true;
  },
  async unarchiveClass(classId: number) {
    const cls = db.classes.find((c) => c.id === classId);
    if (cls) cls.isArchived = false;
  },
  async deleteClass(classId: number) {
    db.classes = db.classes.filter((c) => c.id !== classId);
  },
  async cloneClass(classId: number, instructorId: number) {
    const source = db.classes.find((c) => c.id === classId)!;
    return addClass(instructorId, { name: `${source.name} (Copy)` });
  },

  async getAssignmentsByClass(classId: number) {
    return db.assignments
      .filter((a) => a.classId === classId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  },
  async createAssignment(data: Omit<Assignment, "id" | "displayOrder">) {
    return addAssignment(data.classId, data);
  },
  async updateAssignment(assignmentId: number, updates: Partial<Assignment>) {
    const assignment = db.assignments.find((a) => a.id === assignmentId)!;
    Object.assign(assignment, updates);
    return assignment;
  },
  async deleteAssignment(assignmentId: number) {
    db.assignments = db.assignments.filter((a) => a.id !== assignmentId);
  },
  async reorderAssignments(classId: number, assignmentIds: number[]) {
    assignmentIds.forEach((assignmentId, index) => {
      const assignment = db.assignments.find(
        (a) => a.id === assignmentId && a.classId === classId
      );
      if (assignment) assignment.displayOrder = index;
    });
  },
};

const contractStorage = {
  async getContractsByClass(classId: number) {
    return db.gradeContracts.filter((c) => c.classId === classId);
  },
  async createGradeContract(contract: Omit<GradeContract, "id">) {
    return addContract(contract.classId, contract);
  },
  async publishContractVersion(
    previous: GradeContract,
    changes: Omit<GradeContract, "id" | "version">
  ) {
    const published = addContract(changes.classId, {
      ...changes,
      version: previous.version + 1,
    });

    const onPrevious = db.studentContracts.filter((sc) => sc.contractId === previous.id);
    for (const enrollment of onPrevious) {
      enrollment.contractId = published.id;
    }

    return { contract: published, movedStudents: onPrevious.length };
  },

  async getStudentContract(studentId: number, classId: number) {
    return db.studentContracts.find(
      (sc) => sc.studentId === studentId && sc.classId === classId
    );
  },
  async getStudentContractsByClass(classId: number) {
    return db.studentContracts.filter((sc) => sc.classId === classId);
  },
  async setStudentContract(data: Omit<StudentContract, "id">) {
    const existing = db.studentContracts.find(
      (sc) => sc.studentId === data.studentId && sc.classId === data.classId
    );
    if (existing) {
      existing.contractId = data.contractId;
      return existing;
    }
    return enroll(data.classId, data.studentId, data.contractId);
  },
  async confirmStudentContract(studentId: number, classId: number) {
    const existing = db.studentContracts.find(
      (sc) => sc.studentId === studentId && sc.classId === classId
    )!;
    existing.isConfirmed = true;
    return existing;
  },
  async resetStudentContract(studentId: number, classId: number) {
    const existing = db.studentContracts.find(
      (sc) => sc.studentId === studentId && sc.classId === classId
    )!;
    existing.isConfirmed = false;
    return existing;
  },

  async enrollStudent(classId: number, studentId: number) {
    const existing = db.studentContracts.find(
      (sc) => sc.studentId === studentId && sc.classId === classId
    );
    if (!existing) enroll(classId, studentId);
  },
  async getEnrolledStudents(classId: number) {
    const studentIds = db.studentContracts
      .filter((sc) => sc.classId === classId)
      .map((sc) => sc.studentId);
    return db.users.filter((u) => studentIds.includes(u.id) && u.role === "student");
  },
};

const progressStorage = {
  async getStudentProgress(studentId: number, classId: number) {
    const assignmentIds = db.assignments
      .filter((a) => a.classId === classId)
      .map((a) => a.id);
    return db.progress.filter(
      (p) => p.studentId === studentId && assignmentIds.includes(p.assignmentId)
    );
  },
  async getStudentProgressForClass(classId: number) {
    const assignmentIds = db.assignments
      .filter((a) => a.classId === classId)
      .map((a) => a.id);
    return db.progress.filter((p) => assignmentIds.includes(p.assignmentId));
  },
  async updateProgress(data: Omit<AssignmentProgress, "id">) {
    const existing = db.progress.find(
      (p) => p.studentId === data.studentId && p.assignmentId === data.assignmentId
    );
    if (existing) {
      Object.assign(existing, data);
      return existing;
    }
    const created: AssignmentProgress = { id: id(), ...data };
    db.progress.push(created);
    return created;
  },
};

/**
 * Attendance, invitations and password resets are not exercised by the current
 * suite, but the routes import them, so they need to exist.
 */
const stubStorage = {
  async createClassSession(session: { classId: number; date: Date; topic?: string | null; notes?: string | null }) {
    const created: ClassSession = {
      id: id(),
      classId: session.classId,
      date: session.date,
      topic: session.topic ?? null,
      notes: session.notes ?? null,
      createdAt: new Date(),
    };
    db.sessions.push(created);
    return created;
  },
  async getClassSessions(classId: number) {
    return db.sessions.filter((s) => s.classId === classId);
  },
  async getClassSession(sessionId: number) {
    return db.sessions.find((s) => s.id === sessionId);
  },
  async updateClassSession(sessionId: number, updates: Partial<ClassSession>) {
    const session = db.sessions.find((s) => s.id === sessionId)!;
    Object.assign(session, updates);
    return session;
  },
  async deleteClassSession(sessionId: number) {
    db.participation = db.participation.filter((r) => r.sessionId !== sessionId);
    db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  },
  async getSessionParticipation(sessionId: number) {
    return db.participation.filter((r) => r.sessionId === sessionId);
  },
  async recordSessionParticipation(sessionId: number, entries: ParticipationEntry[]) {
    for (const entry of entries) {
      const existing = db.participation.find(
        (r) => r.sessionId === sessionId && r.studentId === entry.studentId
      );
      if (existing) {
        existing.participation = entry.participation ?? null;
        existing.notes = entry.notes ?? null;
      } else {
        db.participation.push({
          id: id(),
          sessionId,
          studentId: entry.studentId,
          participation: entry.participation ?? null,
          notes: entry.notes ?? null,
          createdAt: new Date(),
        });
      }
    }
  },
  async getClassParticipation(classId: number) {
    const sessionIds = db.sessions.filter((s) => s.classId === classId).map((s) => s.id);
    return db.participation.filter((r) => sessionIds.includes(r.sessionId));
  },
  async getStudentParticipation(studentId: number, classId: number) {
    const sessionIds = db.sessions.filter((s) => s.classId === classId).map((s) => s.id);
    return db.participation.filter(
      (r) => r.studentId === studentId && sessionIds.includes(r.sessionId)
    );
  },
  async getClassAbsences(classId: number) {
    return db.absences.filter((a) => a.classId === classId);
  },
  async getStudentAbsences(studentId: number, classId: number) {
    return db.absences.find((a) => a.studentId === studentId && a.classId === classId);
  },
  async setStudentAbsences(studentId: number, classId: number, absences: number, source = "canvas") {
    const existing = db.absences.find((a) => a.studentId === studentId && a.classId === classId);
    if (existing) {
      existing.absences = absences.toString();
      existing.source = source;
      return existing;
    }
    const created: StudentAbsences = {
      id: id(),
      studentId,
      classId,
      absences: absences.toString(),
      source,
      updatedAt: new Date(),
    };
    db.absences.push(created);
    return created;
  },
  async getInvitationsByClass() {
    return [];
  },
  async createStudentInvitation() {
    return {};
  },
  async getStudentInvitationByToken() {
    return undefined;
  },
  async setupStudentPassword() {
    return undefined;
  },
  async createPasswordResetRequest() {
    return { token: "test-token" };
  },
  async getPasswordResetByToken() {
    return undefined;
  },
  async markPasswordResetAsUsed() {},
  async markPasswordResetAsNotified() {},
  async resetUserPassword() {
    return undefined;
  },
  async getUnnotifiedPasswordResets() {
    return [];
  },
};

export const fakeStorage = {
  ...classStorage,
  ...contractStorage,
  ...progressStorage,
  ...stubStorage,
};
