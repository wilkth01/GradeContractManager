/**
 * API integration tests.
 *
 * These drive the real Express app and the real route modules with only the
 * storage layer faked, so an authorization mistake in a route fails a test
 * here. Most of what follows pins down access control, which is the class of
 * bug this suite exists to catch.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { AssignmentStatus, MAX_ASSIGNMENT_STATUS, ParticipationLevel } from "@shared/constants";

process.env.SESSION_SECRET = "test-secret";
process.env.NODE_ENV = "test";

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./helpers/fakeStorage");
  return { storage: fakeStorage };
});

vi.mock("../audit", () => ({
  auditService: {
    log: vi.fn(),
    logWithRequest: vi.fn(),
    getLogsForStudent: vi.fn(async () => []),
    getLogsForClass: vi.fn(async () => []),
  },
}));

vi.mock("../websocket", () => ({
  connectionManager: { broadcast: vi.fn() },
  createProgressUpdateEvent: vi.fn(() => ({})),
}));

const { resetDb, addUser, addClass, addAssignment, addContract, enroll } = await import(
  "./helpers/fakeStorage"
);
const { createTestApp, loginAs } = await import("./helpers/testApp");
const { hashPassword } = await import("../auth");

const PASSWORD = "password123";
let app: Express;
let hashed: string;

beforeEach(async () => {
  resetDb();
  app = await createTestApp();
  hashed = hashed || (await hashPassword(PASSWORD));
});

function instructor(username: string) {
  return addUser({ role: "instructor", username, password: hashed, fullName: "Instructor" });
}

function student(username: string) {
  return addUser({ role: "student", username, password: hashed, fullName: "Student" });
}

describe("Authentication", () => {
  it("logs in with valid credentials", async () => {
    const user = instructor("prof");
    const res = await request(app).post("/api/login").send({
      username: "prof",
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  it("rejects invalid credentials", async () => {
    instructor("prof");
    const res = await request(app).post("/api/login").send({
      username: "prof",
      password: "wrong",
    });

    expect(res.status).toBe(401);
  });

  it("never returns the password hash", async () => {
    instructor("prof");
    const agent = await loginAs(app, "prof", PASSWORD);

    const login = await agent.post("/api/login").send({ username: "prof", password: PASSWORD });
    expect(login.body).not.toHaveProperty("password");

    const me = await agent.get("/api/user");
    expect(me.status).toBe(200);
    expect(me.body).not.toHaveProperty("password");
  });

  it("never returns the stored Canvas token", async () => {
    const prof = instructor("prof");
    prof.canvasTokenEncrypted = "encrypted-blob";
    const agent = await loginAs(app, "prof", PASSWORD);

    const me = await agent.get("/api/user");
    expect(me.body).not.toHaveProperty("canvasTokenEncrypted");
    expect(JSON.stringify(me.body)).not.toContain("encrypted-blob");
  });

  it("returns 401 for an anonymous session lookup", async () => {
    const res = await request(app).get("/api/user");
    expect(res.status).toBe(401);
  });

  it("no longer exposes public self-registration", async () => {
    const res = await request(app).post("/api/register").send({
      username: "attacker",
      password: PASSWORD,
      role: "instructor",
      fullName: "Attacker",
    });

    expect(res.status).toBe(404);
  });
});

describe("Password reset", () => {
  it("never returns a reset token to an anonymous caller", async () => {
    student("sam");

    const res = await request(app).post("/api/auth/forgot-password").send({
      username: "sam",
    });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("resetToken");
    expect(res.body).not.toHaveProperty("token");
  });

  it("answers identically for an unknown username", async () => {
    student("sam");

    const known = await request(app).post("/api/auth/forgot-password").send({ username: "sam" });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ username: "nobody" });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });
});

describe("Classes", () => {
  it("creates a class as an instructor", async () => {
    instructor("prof");
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post("/api/classes").send({ name: "Rhetoric 101" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Rhetoric 101");
  });

  it("refuses class creation by a student", async () => {
    student("sam");
    const agent = await loginAs(app, "sam", PASSWORD);

    const res = await agent.post("/api/classes").send({ name: "Rhetoric 101" });

    expect(res.status).toBe(403);
  });

  it("lets an enrolled student read the class", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cls.id);
  });

  it("blocks a student from reading a class they are not enrolled in", async () => {
    const prof = instructor("prof");
    student("outsider");
    const cls = addClass(prof.id);

    const agent = await loginAs(app, "outsider", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}`);

    expect(res.status).toBe(403);
  });

  it("blocks an instructor from reading a class they do not own", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);

    const agent = await loginAs(app, "other", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}`);

    expect(res.status).toBe(403);
  });

  it("blocks a non-owner from archiving a class", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);

    const agent = await loginAs(app, "other", PASSWORD);
    const res = await agent.post(`/api/classes/${cls.id}/archive`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for a class that does not exist", async () => {
    instructor("prof");
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.get("/api/classes/9999");

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric class id", async () => {
    instructor("prof");
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.get("/api/classes/not-a-number");

    expect(res.status).toBe(400);
  });
});

describe("Assignments", () => {
  it("creates an assignment as the class owner", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/assignments`).send({
      name: "Essay 1",
      scoringType: "status",
      moduleGroup: null,
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Essay 1");
  });

  it("blocks assignment creation by a non-owner instructor", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/assignments`).send({
      name: "Essay 1",
      scoringType: "status",
      moduleGroup: null,
    });

    expect(res.status).toBe(403);
  });

  it("lets an enrolled student list assignments", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    addAssignment(cls.id, { name: "Essay 1" });

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/assignments`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("blocks an unenrolled student from listing assignments", async () => {
    const prof = instructor("prof");
    student("outsider");
    const cls = addClass(prof.id);
    addAssignment(cls.id);

    const agent = await loginAs(app, "outsider", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/assignments`);

    expect(res.status).toBe(403);
  });

  it("returns assignments in displayOrder", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    addAssignment(cls.id, { name: "First", displayOrder: 1 });
    addAssignment(cls.id, { name: "Second", displayOrder: 0 });

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/assignments`);

    expect(res.body.map((a: { name: string }) => a.name)).toEqual(["Second", "First"]);
  });

  it("refuses to edit an assignment belonging to another class", async () => {
    const prof = instructor("prof");
    const mine = addClass(prof.id);
    const theirs = addClass(instructor("other").id);
    const foreign = addAssignment(theirs.id, { name: "Not yours" });

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .patch(`/api/classes/${mine.id}/assignments/${foreign.id}`)
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
    expect(foreign.name).toBe("Not yours");
  });

  it("rejects an assignment without required fields", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/assignments`).send({ name: "" });

    expect(res.status).toBe(400);
  });
});

describe("Student privacy", () => {
  it("blocks a student from reading a classmate progress", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const alex = student("alex");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    enroll(cls.id, alex.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/students/${alex.id}/progress`);

    expect(res.status).toBe(403);
  });

  it("lets a student read their own progress", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/students/${sam.id}/progress`);

    expect(res.status).toBe(200);
  });

  it("blocks a student from reading the whole-class gradebook", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/students/progress`);

    expect(res.status).toBe(403);
  });

  it("blocks a student from reading the class roster", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/students`);

    expect(res.status).toBe(403);
  });

  it("blocks a student from reading who contracted for which grade", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/student-contracts`);

    expect(res.status).toBe(403);
  });

  it("omits password hashes from the roster", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent.get(`/api/classes/${cls.id}/students`);

    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("password");
  });
});

describe("Contract selection", () => {
  it("refuses to enroll a student who selects a contract in a class they are not in", async () => {
    const prof = instructor("prof");
    student("outsider");
    const cls = addClass(prof.id);
    const contract = addContract(cls.id);

    const agent = await loginAs(app, "outsider", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/student-contract`)
      .send({ contractId: contract.id });

    expect(res.status).toBe(403);

    // The selection must not have created an enrollment as a side effect.
    const { db } = await import("./helpers/fakeStorage");
    expect(db.studentContracts).toHaveLength(0);
  });

  it("lets an enrolled student choose a contract", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const contract = addContract(cls.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/student-contract`)
      .send({ contractId: contract.id });

    expect(res.status).toBe(201);
    expect(res.body.contractId).toBe(contract.id);
  });

  it("rejects a contract belonging to a different class", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    const otherClass = addClass(prof.id);
    enroll(cls.id, sam.id);
    const foreignContract = addContract(otherClass.id);

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/student-contract`)
      .send({ contractId: foreignContract.id });

    expect(res.status).toBe(400);
  });

  it("refuses to change a contract that is already confirmed", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    const contract = addContract(cls.id);
    const other = addContract(cls.id, { grade: "B" });
    const enrollment = enroll(cls.id, sam.id, contract.id);
    enrollment.isConfirmed = true;

    const agent = await loginAs(app, "sam", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/student-contract`)
      .send({ contractId: other.id });

    expect(res.status).toBe(409);
    expect(enrollment.contractId).toBe(contract.id);
  });
});

describe("Grading", () => {
  it("records a status grade for an enrolled student", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const assignment = addAssignment(cls.id, { scoringType: "status" });

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${sam.id}/assignments/${assignment.id}/progress`)
      .send({ status: AssignmentStatus.COMPLETE });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AssignmentStatus.COMPLETE);
  });

  it("blocks an instructor from grading in a class they do not own", async () => {
    const owner = instructor("owner");
    instructor("other");
    const sam = student("sam");
    const cls = addClass(owner.id);
    enroll(cls.id, sam.id);
    const assignment = addAssignment(cls.id);

    const agent = await loginAs(app, "other", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${sam.id}/assignments/${assignment.id}/progress`)
      .send({ status: AssignmentStatus.COMPLETE });

    expect(res.status).toBe(403);
  });

  it("refuses to grade an assignment from another class", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    const otherClass = addClass(prof.id);
    enroll(cls.id, sam.id);
    const foreign = addAssignment(otherClass.id);

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${sam.id}/assignments/${foreign.id}/progress`)
      .send({ status: AssignmentStatus.COMPLETE });

    expect(res.status).toBe(404);
  });

  it("refuses to grade a student who is not enrolled", async () => {
    const prof = instructor("prof");
    const outsider = student("outsider");
    const cls = addClass(prof.id);
    const assignment = addAssignment(cls.id);

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${outsider.id}/assignments/${assignment.id}/progress`)
      .send({ status: AssignmentStatus.COMPLETE });

    expect(res.status).toBe(403);
  });

  it("rejects a status above the highest defined one", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const assignment = addAssignment(cls.id, { scoringType: "status" });

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${sam.id}/assignments/${assignment.id}/progress`)
      .send({ status: MAX_ASSIGNMENT_STATUS + 1 });

    expect(res.status).toBe(400);
  });

  it("rejects a numeric score above the scale maximum", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const assignment = addAssignment(cls.id, { scoringType: "numeric" });

    const agent = await loginAs(app, "prof", PASSWORD);
    const res = await agent
      .post(`/api/classes/${cls.id}/students/${sam.id}/assignments/${assignment.id}/progress`)
      .send({ numericGrade: 7 });

    expect(res.status).toBe(400);
  });
});

describe("Error handling", () => {
  it("answers with JSON instead of hanging when storage throws", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const { fakeStorage } = await import("./helpers/fakeStorage");
    const original = fakeStorage.getAssignmentsByClass;
    fakeStorage.getAssignmentsByClass = (async () => {
      throw new Error("database is down");
    }) as typeof original;

    try {
      const res = await agent.get(`/api/classes/${cls.id}/assignments`);
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("message");
    } finally {
      fakeStorage.getAssignmentsByClass = original;
    }
  });
});

describe("Health check", () => {
  // Render gates the deploy on this endpoint and rolls a release back when it
  // fails. An unconditional OK would promote a release that cannot reach the
  // database and then decline to roll it back, so the unreachable branch is
  // the one worth pinning down.
  it("reports OK when the database answers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "OK", database: "OK" });
  });

  it("answers 503 when the database is unreachable", async () => {
    const { db } = await import("./helpers/fakeStorage");
    db.pingFails = true;
    try {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(503);
      expect(res.body.database).toBe("unreachable");
    } finally {
      db.pingFails = false;
    }
  });

  it("needs no authentication", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).not.toBe(401);
  });
});

describe("Class sessions and participation", () => {
  it("creates a session as the class owner", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .post(`/api/classes/${cls.id}/sessions`)
      .send({ date: "2026-03-10", topic: "Peer review" });

    expect(res.status).toBe(201);
    expect(res.body.topic).toBe("Peer review");
  });

  it("blocks a non-owner from creating a session", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });

    expect(res.status).toBe(403);
  });

  it("refuses a second session on the same date", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });
    const res = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });

    expect(res.status).toBe(400);
  });

  it("records participation for a session", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const session = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });
    const res = await agent
      .put(`/api/classes/${cls.id}/sessions/${session.body.id}/participation`)
      .send({ entries: [{ studentId: sam.id, participation: ParticipationLevel.ACTIVE }] });

    expect(res.status).toBe(200);
    expect(res.body[0].participation).toBe(ParticipationLevel.ACTIVE);
  });

  it("is an upsert, so recording twice does not duplicate a student", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const session = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });
    const url = `/api/classes/${cls.id}/sessions/${session.body.id}/participation`;

    await agent.put(url).send({ entries: [{ studentId: sam.id, participation: 1 }] });
    const res = await agent.put(url).send({ entries: [{ studentId: sam.id, participation: 3 }] });

    expect(res.body).toHaveLength(1);
    expect(res.body[0].participation).toBe(3);
  });

  it("refuses to record participation for a student outside the class", async () => {
    const prof = instructor("prof");
    const outsider = student("outsider");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const session = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });
    const res = await agent
      .put(`/api/classes/${cls.id}/sessions/${session.body.id}/participation`)
      .send({ entries: [{ studentId: outsider.id, participation: 2 }] });

    expect(res.status).toBe(403);
  });

  it("refuses to use a session from another class", async () => {
    const prof = instructor("prof");
    const mine = addClass(prof.id);
    const theirs = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const session = await agent.post(`/api/classes/${theirs.id}/sessions`).send({ date: "2026-03-10" });
    const res = await agent
      .put(`/api/classes/${mine.id}/sessions/${session.body.id}/participation`)
      .send({ entries: [] });

    expect(res.status).toBe(404);
  });

  it("rejects a participation value outside the scale", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const session = await agent.post(`/api/classes/${cls.id}/sessions`).send({ date: "2026-03-10" });
    const res = await agent
      .put(`/api/classes/${cls.id}/sessions/${session.body.id}/participation`)
      .send({ entries: [{ studentId: sam.id, participation: 9 }] });

    expect(res.status).toBe(400);
  });

  it("lets a student read their own participation but not a classmate's", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const alex = student("alex");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    enroll(cls.id, alex.id);

    const agent = await loginAs(app, "sam", PASSWORD);

    expect((await agent.get(`/api/classes/${cls.id}/students/${sam.id}/participation`)).status).toBe(200);
    expect((await agent.get(`/api/classes/${cls.id}/students/${alex.id}/participation`)).status).toBe(403);
  });
});

describe("Absence totals", () => {
  it("stores the fractional totals Qwickly produces", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/students/${sam.id}/absences`)
      .send({ absences: 7.5 });

    expect(res.status).toBe(200);
    expect(Number(res.body.absences)).toBe(7.5);
  });

  it("blocks a non-owner from setting absences", async () => {
    const owner = instructor("owner");
    instructor("other");
    const sam = student("sam");
    const cls = addClass(owner.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/students/${sam.id}/absences`)
      .send({ absences: 0 });

    expect(res.status).toBe(403);
  });

  it("rejects a negative total", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/students/${sam.id}/absences`)
      .send({ absences: -1 });

    expect(res.status).toBe(400);
  });

  it("lets a student read their own total but not a classmate's", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const alex = student("alex");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id);
    enroll(cls.id, alex.id);

    const agent = await loginAs(app, "sam", PASSWORD);

    expect((await agent.get(`/api/classes/${cls.id}/students/${sam.id}/absences`)).status).toBe(200);
    expect((await agent.get(`/api/classes/${cls.id}/students/${alex.id}/absences`)).status).toBe(403);
  });
});

describe("Contract update messages", () => {
  it("previews a message per student without sending", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id, { name: "PHIL 352" });
    enroll(cls.id, sam.id, addContract(cls.id, { grade: "A", maxAbsences: 2 }).id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/messages/preview`).send({});

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toContain("Hi ");
    expect(res.body.messages[0].subject).toContain("PHIL 352");
  });

  it("flags students with no linked Canvas account before sending", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id, addContract(cls.id).id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/messages/preview`).send({});

    expect(res.body.unlinked).toHaveLength(1);
    expect(res.body.unlinked[0].fullName).toBe("Student");
  });

  it("blocks a non-owner from previewing another class's messages", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/messages/preview`).send({});

    expect(res.status).toBe(403);
  });

  it("refuses to send without an explicit list of students", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/messages/send`).send({});

    expect(res.status).toBe(400);
  });

  it("refuses to send to a student outside the class", async () => {
    const prof = instructor("prof");
    const outsider = student("outsider");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .post(`/api/classes/${cls.id}/messages/send`)
      .send({ studentIds: [outsider.id] });

    expect(res.status).toBe(400);
  });

  it("reports a missing Canvas token rather than half-sending", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    enroll(cls.id, sam.id, addContract(cls.id).id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .post(`/api/classes/${cls.id}/messages/send`)
      .send({ studentIds: [sam.id] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Canvas access token");
  });
});

describe("Canvas roster import", () => {
  it("refuses to import before a Canvas course is linked", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/canvas/import-roster`).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Canvas course");
  });

  it("blocks a non-owner from importing into a class", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/canvas/import-roster`).send({});

    expect(res.status).toBe(403);
  });

  it("reports a missing token rather than failing obscurely", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/canvas/import-roster`).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Canvas access token");
  });

  it("only offers setup links to students who cannot log in yet", async () => {
    const prof = instructor("prof");
    const withPassword = student("hasaccount");
    const cls = addClass(prof.id);
    enroll(cls.id, withPassword.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    // Everyone enrolled already has a password, so there is nothing to send
    // and the endpoint must not demand a Canvas token to say so.
    const res = await agent.post(`/api/classes/${cls.id}/invitations/send-setup-links`);

    expect(res.status).toBe(200);
    expect(res.body.sent).toEqual([]);
  });
});

describe("Contract edits apply to everyone on that contract", () => {
  async function editContract(agent: any, classId: number, contractId: number, required: number) {
    return agent.patch(`/api/classes/${classId}/contracts/${contractId}`).send({
      grade: "A",
      version: 1,
      assignments: [],
      maxAbsences: 2,
      categoryRequirements: [{ category: "Discussion Logs", required }],
    });
  }

  it("publishes an edit as a new version, keeping the old terms on record", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const original = addContract(cls.id, { grade: "A", version: 1 });
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await editContract(agent, cls.id, original.id, 3);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);

    const { db } = await import("./helpers/fakeStorage");
    const kept = db.gradeContracts.find((c) => c.id === original.id)!;
    expect(kept.categoryRequirements).toEqual(original.categoryRequirements);
  });

  it("moves a confirmed student onto the new terms without asking them", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    const original = addContract(cls.id, { grade: "A", version: 1 });
    const enrollment = enroll(cls.id, sam.id, original.id);
    enrollment.isConfirmed = true;
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await editContract(agent, cls.id, original.id, 3);

    expect(enrollment.contractId).toBe(res.body.id);
    expect(res.body.movedStudents).toBe(1);
  });

  it("leaves a moved student still confirmed", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const cls = addClass(prof.id);
    const original = addContract(cls.id, { grade: "A", version: 1 });
    const enrollment = enroll(cls.id, sam.id, original.id);
    enrollment.isConfirmed = true;
    const agent = await loginAs(app, "prof", PASSWORD);

    await editContract(agent, cls.id, original.id, 3);

    // Re-confirming would be an action on the student's part, which is exactly
    // what this must not require.
    expect(enrollment.isConfirmed).toBe(true);
  });

  it("moves unconfirmed students too", async () => {
    const prof = instructor("prof");
    const sam = student("sam");
    const alex = student("alex");
    const cls = addClass(prof.id);
    const original = addContract(cls.id, { grade: "A", version: 1 });
    const first = enroll(cls.id, sam.id, original.id);
    const second = enroll(cls.id, alex.id, original.id);
    second.isConfirmed = true;
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await editContract(agent, cls.id, original.id, 3);

    expect(res.body.movedStudents).toBe(2);
    expect(first.contractId).toBe(res.body.id);
    expect(second.contractId).toBe(res.body.id);
  });
});

describe("Canvas grade pull", () => {
  it("refuses to pull before a Canvas course is linked", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/canvas/pull-preview`).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Canvas course");
  });

  it("blocks a non-owner from pulling into a class", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent.post(`/api/classes/${cls.id}/canvas/pull-preview`).send({});

    expect(res.status).toBe(403);
  });

  it("refuses to map an assignment belonging to another class", async () => {
    const prof = instructor("prof");
    const mine = addClass(prof.id);
    const theirs = addClass(prof.id);
    const foreign = addAssignment(theirs.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .put(`/api/classes/${mine.id}/canvas/assignment-map`)
      .send({ mappings: [{ assignmentId: foreign.id, canvasAssignmentId: 500 }] });

    expect(res.status).toBe(400);
    expect(foreign.canvasAssignmentId).toBeNull();
  });

  it("stores a mapping for its own assignments", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const mine = addAssignment(cls.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/canvas/assignment-map`)
      .send({ mappings: [{ assignmentId: mine.id, canvasAssignmentId: 500 }] });

    expect(res.status).toBe(200);
    expect(mine.canvasAssignmentId).toBe(500);
  });

  it("requires at least one mapped assignment before pulling", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id, { canvasCourseId: 52959 });
    addAssignment(cls.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    // No token either, but the mapping check should not be what fails last.
    const res = await agent.post(`/api/classes/${cls.id}/canvas/pull-preview`).send({});

    expect(res.status).toBe(400);
  });
});

describe("Canvas course link", () => {
  it("sets the absence source without disturbing the course link", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/canvas/link`)
      .send({ canvasAbsenceAssignmentId: 777 });

    expect(res.status).toBe(200);
    expect(cls.canvasAbsenceAssignmentId).toBe(777);
    // Omitting the course id must not unlink the course.
    expect(cls.canvasCourseId).toBe(52959);
  });

  it("clears the absence source when explicitly set to null", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id, { canvasCourseId: 52959, canvasAbsenceAssignmentId: 777 });
    const agent = await loginAs(app, "prof", PASSWORD);

    await agent
      .put(`/api/classes/${cls.id}/canvas/link`)
      .send({ canvasAbsenceAssignmentId: null });

    expect(cls.canvasAbsenceAssignmentId).toBeNull();
    expect(cls.canvasCourseId).toBe(52959);
  });

  it("rejects a request that would change nothing", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.put(`/api/classes/${cls.id}/canvas/link`).send({});

    expect(res.status).toBe(400);
  });

  it("blocks a non-owner from relinking a class", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id);
    const agent = await loginAs(app, "other", PASSWORD);

    const res = await agent
      .put(`/api/classes/${cls.id}/canvas/link`)
      .send({ canvasCourseId: 1 });

    expect(res.status).toBe(403);
  });
});

describe("Canvas assignment import", () => {
  it("refuses to list importable assignments before a course is linked", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent.get(`/api/classes/${cls.id}/canvas/importable-assignments`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Canvas course");
  });

  it("blocks a non-owner from importing assignments into a class", async () => {
    const owner = instructor("owner");
    instructor("other");
    const cls = addClass(owner.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "other", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const res = await agent
      .post(`/api/classes/${cls.id}/canvas/import-assignments`)
      .send({
        assignments: [
          {
            canvasAssignmentId: 900,
            name: "Reading 1",
            moduleGroup: "Hypothesis",
            scoringType: "numeric",
          },
        ],
      });

    expect(res.status).toBe(403);
    expect(db.assignments).toHaveLength(0);
  });

  it("rejects an empty selection before reaching Canvas", async () => {
    const prof = instructor("prof");
    const cls = addClass(prof.id, { canvasCourseId: 52959 });
    const agent = await loginAs(app, "prof", PASSWORD);

    const res = await agent
      .post(`/api/classes/${cls.id}/canvas/import-assignments`)
      .send({ assignments: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("at least one");
  });
});

describe("Contract import from a summary table", () => {
  /** A class whose shape matches the table the drafts below describe. */
  function classWithWork(instructorId: number) {
    const cls = addClass(instructorId);
    const logs = [1, 2, 3].map((n) =>
      addAssignment(cls.id, { name: `Discussion Log ${n}`, moduleGroup: "Discussion Logs" })
    );
    const essay = addAssignment(cls.id, {
      name: "Writing Assignment 1",
      moduleGroup: "Writing",
    });
    return { cls, logs, essay };
  }

  it("creates one contract per grade with the terms it was given", async () => {
    const prof = instructor("prof");
    const { cls, logs, essay } = classWithWork(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const res = await agent.post(`/api/classes/${cls.id}/contracts/import`).send({
      contracts: [
        {
          grade: "A",
          assignments: [...logs.map((l) => ({ id: l.id })), { id: essay.id }],
          maxAbsences: 2,
          requiredParticipationSessions: 0,
          categoryRequirements: [{ category: "Discussion Logs", required: 3 }],
        },
        {
          grade: "B",
          assignments: logs.map((l) => ({ id: l.id })),
          maxAbsences: 3,
          requiredParticipationSessions: 0,
          categoryRequirements: [{ category: "Discussion Logs", required: 2 }],
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toEqual(["A", "B"]);

    const a = db.gradeContracts.find((c) => c.grade === "A")!;
    expect(a.maxAbsences).toBe(2);
    expect(a.version).toBe(1);
    expect(a.categoryRequirements).toEqual([{ category: "Discussion Logs", required: 3 }]);
    expect(a.assignments.map((x) => x.id).sort()).toEqual(
      [...logs.map((l) => l.id), essay.id].sort()
    );
  });

  it("publishes a new version when the grade already has a contract", async () => {
    const prof = instructor("prof");
    const { cls, logs } = classWithWork(prof.id);
    const existing = addContract(cls.id, { grade: "A", version: 1, maxAbsences: 9 });
    const sam = student("sam");
    enroll(cls.id, sam.id, existing.id);
    const agent = await loginAs(app, "prof", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const res = await agent.post(`/api/classes/${cls.id}/contracts/import`).send({
      contracts: [
        {
          grade: "A",
          assignments: logs.map((l) => ({ id: l.id })),
          maxAbsences: 2,
          requiredParticipationSessions: 0,
          categoryRequirements: [],
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toEqual([]);
    expect(res.body.updated[0].grade).toBe("A");

    // The old terms stay on record, and the student moves to the new version
    // without having to re-confirm -- the same guarantee an edit gives.
    const versions = db.gradeContracts.filter((c) => c.grade === "A");
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
    const current = versions.find((v) => v.version === 2)!;
    expect(current.maxAbsences).toBe(2);
    expect(db.studentContracts[0].contractId).toBe(current.id);
  });

  it("refuses an assignment from another class", async () => {
    const prof = instructor("prof");
    const { cls } = classWithWork(prof.id);
    const other = addClass(prof.id);
    const foreign = addAssignment(other.id, { name: "Someone else's essay" });
    const agent = await loginAs(app, "prof", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const res = await agent.post(`/api/classes/${cls.id}/contracts/import`).send({
      contracts: [
        {
          grade: "A",
          assignments: [{ id: foreign.id }],
          maxAbsences: 0,
          requiredParticipationSessions: 0,
          categoryRequirements: [],
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("does not belong to this class");
    expect(db.gradeContracts).toHaveLength(0);
  });

  it("refuses a category that is not a module group in this class", async () => {
    const prof = instructor("prof");
    const { cls, logs } = classWithWork(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    // A category naming a group that does not exist matches no assignment, so
    // it would silently require nothing of anybody.
    const res = await agent.post(`/api/classes/${cls.id}/contracts/import`).send({
      contracts: [
        {
          grade: "A",
          assignments: logs.map((l) => ({ id: l.id })),
          maxAbsences: 0,
          requiredParticipationSessions: 0,
          categoryRequirements: [{ category: "Perusall", required: 2 }],
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Perusall");
    expect(db.gradeContracts).toHaveLength(0);
  });

  it("blocks a non-owner from importing contracts", async () => {
    const owner = instructor("owner");
    instructor("other");
    const { cls, logs } = classWithWork(owner.id);
    const agent = await loginAs(app, "other", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const res = await agent.post(`/api/classes/${cls.id}/contracts/import`).send({
      contracts: [
        {
          grade: "A",
          assignments: logs.map((l) => ({ id: l.id })),
          maxAbsences: 0,
          requiredParticipationSessions: 0,
          categoryRequirements: [],
        },
      ],
    });

    expect(res.status).toBe(403);
    expect(db.gradeContracts).toHaveLength(0);
  });

  it("rejects the same grade twice in one import", async () => {
    const prof = instructor("prof");
    const { cls, logs } = classWithWork(prof.id);
    const agent = await loginAs(app, "prof", PASSWORD);
    const { db } = await import("./helpers/fakeStorage");

    const draft = {
      grade: "A",
      assignments: logs.map((l) => ({ id: l.id })),
      maxAbsences: 0,
      requiredParticipationSessions: 0,
      categoryRequirements: [],
    };
    const res = await agent
      .post(`/api/classes/${cls.id}/contracts/import`)
      .send({ contracts: [draft, { ...draft, maxAbsences: 5 }] });

    expect(res.status).toBe(400);
    expect(db.gradeContracts).toHaveLength(0);
  });
});
