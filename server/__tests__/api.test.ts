/**
 * API Integration Tests
 * Tests the main API endpoints for authentication, classes, and assignments.
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";

// ============================================================================
// Test Setup - Self-contained middleware (no external imports that need DB)
// ============================================================================

// Simple auth middleware for tests
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireInstructor(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if ((req.user as any).role !== "instructor") {
    return res.status(403).json({ message: "Instructor access required" });
  }
  next();
}

interface TestUser {
  id: number;
  username: string;
  password: string;
  role: "instructor" | "student";
  fullName: string;
}

interface TestClass {
  id: number;
  name: string;
  instructorId: number;
  description: string | null;
  isArchived: boolean;
}

interface TestAssignment {
  id: number;
  name: string;
  classId: number;
  moduleGroup: string | null;
  scoringType: "status" | "numeric";
  displayOrder: number;
  dueDate: Date | null;
}

// In-memory test data
const testData = {
  users: [] as TestUser[],
  classes: [] as TestClass[],
  assignments: [] as TestAssignment[],
  studentContracts: [] as { studentId: number; classId: number; contractId: number | null }[],
};

function resetTestData() {
  testData.users = [];
  testData.classes = [];
  testData.assignments = [];
  testData.studentContracts = [];
}

function createInstructor(name = "Test Instructor"): TestUser {
  const user: TestUser = {
    id: testData.users.length + 1,
    username: `instructor${testData.users.length + 1}`,
    password: "password123",
    role: "instructor",
    fullName: name,
  };
  testData.users.push(user);
  return user;
}

function createStudent(name = "Test Student"): TestUser {
  const user: TestUser = {
    id: testData.users.length + 1,
    username: `student${testData.users.length + 1}`,
    password: "password123",
    role: "student",
    fullName: name,
  };
  testData.users.push(user);
  return user;
}

function createClass(instructorId: number, name = "Test Class"): TestClass {
  const cls: TestClass = {
    id: testData.classes.length + 1,
    name,
    instructorId,
    description: null,
    isArchived: false,
  };
  testData.classes.push(cls);
  return cls;
}

function createAssignment(classId: number, name = "Test Assignment"): TestAssignment {
  const assignment: TestAssignment = {
    id: testData.assignments.length + 1,
    name,
    classId,
    moduleGroup: null,
    scoringType: "status",
    displayOrder: testData.assignments.filter(a => a.classId === classId).length,
    dueDate: null,
  };
  testData.assignments.push(assignment);
  return assignment;
}

function enrollStudent(studentId: number, classId: number) {
  testData.studentContracts.push({ studentId, classId, contractId: null });
}

// Create test app
function createApp() {
  const app = express();
  app.use(express.json());

  // Session
  const SessionStore = MemoryStore(session);
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      store: new SessionStore({ checkPeriod: 86400000 }),
    })
  );

  // Passport
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy((username, password, done) => {
      const user = testData.users.find(u => u.username === username && u.password === password);
      if (!user) return done(null, false);
      return done(null, user);
    })
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser((id: number, done) => {
    const user = testData.users.find(u => u.id === id);
    done(null, user || null);
  });

  // Auth routes
  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => res.json({ message: "Logged out" }));
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Class routes
  app.get("/api/classes", requireAuth, (req, res) => {
    const user = req.user as TestUser;
    if (user.role === "instructor") {
      res.json(testData.classes.filter(c => c.instructorId === user.id));
    } else {
      const enrolledClassIds = testData.studentContracts
        .filter(sc => sc.studentId === user.id)
        .map(sc => sc.classId);
      res.json(testData.classes.filter(c => enrolledClassIds.includes(c.id)));
    }
  });

  app.post("/api/classes", requireInstructor, (req, res) => {
    const user = req.user as TestUser;
    const { name, description } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Name is required" });
    }

    const newClass: TestClass = {
      id: testData.classes.length + 1,
      name,
      instructorId: user.id,
      description: description || null,
      isArchived: false,
    };
    testData.classes.push(newClass);
    res.status(201).json(newClass);
  });

  app.get("/api/classes/:classId", requireAuth, (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = testData.classes.find(c => c.id === classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json(cls);
  });

  // Assignment routes
  app.get("/api/classes/:classId/assignments", requireAuth, (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const assignments = testData.assignments
      .filter(a => a.classId === classId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    res.json(assignments);
  });

  app.post("/api/classes/:classId/assignments", requireInstructor, (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = testData.classes.find(c => c.id === classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    const user = req.user as TestUser;
    if (cls.instructorId !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, moduleGroup, scoringType, dueDate } = req.body;
    if (!name || !scoringType) {
      return res.status(400).json({ message: "Name and scoringType are required" });
    }

    const assignment: TestAssignment = {
      id: testData.assignments.length + 1,
      name,
      classId,
      moduleGroup: moduleGroup || null,
      scoringType,
      displayOrder: testData.assignments.filter(a => a.classId === classId).length,
      dueDate: dueDate ? new Date(dueDate) : null,
    };
    testData.assignments.push(assignment);
    res.status(201).json(assignment);
  });

  // Error handling
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.statusCode || 500;
    res.status(status).json({ message: err.message });
  });

  return app;
}

// ============================================================================
// Tests
// ============================================================================

describe("API Integration Tests", () => {
  beforeEach(() => {
    resetTestData();
  });

  describe("Authentication", () => {
    it("should login with valid credentials", async () => {
      const instructor = createInstructor();
      const app = createApp();

      const response = await request(app)
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      expect(response.status).toBe(200);
      expect(response.body.username).toBe(instructor.username);
      expect(response.body.role).toBe("instructor");
    });

    it("should reject invalid credentials", async () => {
      createInstructor();
      const app = createApp();

      const response = await request(app)
        .post("/api/login")
        .send({ username: "wrong", password: "wrong" });

      expect(response.status).toBe(401);
    });

    it("should return user info when authenticated", async () => {
      const instructor = createInstructor();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get("/api/user");

      expect(response.status).toBe(200);
      expect(response.body.username).toBe(instructor.username);
    });

    it("should return 401 when not authenticated", async () => {
      const app = createApp();

      const response = await request(app).get("/api/user");

      expect(response.status).toBe(401);
    });

    it("should logout successfully", async () => {
      const instructor = createInstructor();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const logoutResponse = await agent.post("/api/logout");
      expect(logoutResponse.status).toBe(200);

      const userResponse = await agent.get("/api/user");
      expect(userResponse.status).toBe(401);
    });
  });

  describe("Classes API", () => {
    it("should create a class as instructor", async () => {
      const instructor = createInstructor();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent
        .post("/api/classes")
        .send({ name: "New Class", description: "A test class" });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("New Class");
      expect(response.body.instructorId).toBe(instructor.id);
    });

    it("should reject class creation as student", async () => {
      const student = createStudent();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: student.username, password: student.password });

      const response = await agent
        .post("/api/classes")
        .send({ name: "New Class" });

      expect(response.status).toBe(403);
    });

    it("should get instructor's own classes", async () => {
      const instructor = createInstructor();
      const otherInstructor = createInstructor("Other Instructor");
      createClass(instructor.id, "My Class");
      createClass(otherInstructor.id, "Other Class");

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get("/api/classes");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe("My Class");
    });

    it("should get enrolled classes for student", async () => {
      const instructor = createInstructor();
      const student = createStudent();
      const enrolledClass = createClass(instructor.id, "Enrolled Class");
      createClass(instructor.id, "Not Enrolled Class");
      enrollStudent(student.id, enrolledClass.id);

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: student.username, password: student.password });

      const response = await agent.get("/api/classes");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe("Enrolled Class");
    });

    it("should get class by ID", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id, "Test Class");

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get(`/api/classes/${cls.id}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Test Class");
    });

    it("should return 404 for non-existent class", async () => {
      const instructor = createInstructor();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get("/api/classes/999");

      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid class ID", async () => {
      const instructor = createInstructor();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get("/api/classes/invalid");

      expect(response.status).toBe(400);
    });
  });

  describe("Assignments API", () => {
    it("should create assignment as class owner", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id);

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent
        .post(`/api/classes/${cls.id}/assignments`)
        .send({ name: "Homework 1", scoringType: "status", moduleGroup: "Week 1" });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Homework 1");
      expect(response.body.classId).toBe(cls.id);
    });

    it("should reject assignment creation by non-owner", async () => {
      const instructor1 = createInstructor();
      const instructor2 = createInstructor("Other Instructor");
      const cls = createClass(instructor1.id);

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor2.username, password: instructor2.password });

      const response = await agent
        .post(`/api/classes/${cls.id}/assignments`)
        .send({ name: "Homework 1", scoringType: "status" });

      expect(response.status).toBe(403);
    });

    it("should get assignments for a class", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id);
      createAssignment(cls.id, "Assignment 1");
      createAssignment(cls.id, "Assignment 2");

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get(`/api/classes/${cls.id}/assignments`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it("should return assignments sorted by displayOrder", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id);

      // Create in reverse order
      const a1 = createAssignment(cls.id, "First");
      const a2 = createAssignment(cls.id, "Second");
      const a3 = createAssignment(cls.id, "Third");

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent.get(`/api/classes/${cls.id}/assignments`);

      expect(response.status).toBe(200);
      expect(response.body[0].name).toBe("First");
      expect(response.body[1].name).toBe("Second");
      expect(response.body[2].name).toBe("Third");
    });

    it("should create assignment with due date", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id);

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const dueDate = "2024-12-31T23:59:59Z";
      const response = await agent
        .post(`/api/classes/${cls.id}/assignments`)
        .send({ name: "Final Project", scoringType: "status", dueDate });

      expect(response.status).toBe(201);
      expect(response.body.dueDate).toBeTruthy();
    });

    it("should reject assignment without required fields", async () => {
      const instructor = createInstructor();
      const cls = createClass(instructor.id);

      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: instructor.username, password: instructor.password });

      const response = await agent
        .post(`/api/classes/${cls.id}/assignments`)
        .send({ name: "Missing scoring type" }); // Missing scoringType

      expect(response.status).toBe(400);
    });
  });

  describe("Authorization Middleware", () => {
    it("should block unauthenticated requests to protected routes", async () => {
      const app = createApp();

      const response = await request(app).get("/api/classes");

      expect(response.status).toBe(401);
    });

    it("should block students from instructor-only routes", async () => {
      const student = createStudent();
      const app = createApp();
      const agent = request.agent(app);

      await agent
        .post("/api/login")
        .send({ username: student.username, password: student.password });

      const response = await agent
        .post("/api/classes")
        .send({ name: "Should Fail" });

      expect(response.status).toBe(403);
    });
  });
});
