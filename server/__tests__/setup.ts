/**
 * Test setup utilities for API integration tests.
 * Creates a minimal Express app with routes for testing.
 */

import express, { type Express } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";

// Mock user for testing
export interface MockUser {
  id: number;
  username: string;
  password: string;
  role: "instructor" | "student";
  fullName: string;
  email: string | null;
  isTemporary: boolean;
}

// In-memory storage for tests
export const testData = {
  users: [] as MockUser[],
  classes: [] as any[],
  assignments: [] as any[],
  contracts: [] as any[],
  studentContracts: [] as any[],
  progress: [] as any[],
  reset() {
    this.users = [];
    this.classes = [];
    this.assignments = [];
    this.contracts = [];
    this.studentContracts = [];
    this.progress = [];
  },
};

// Create test users
export function createTestInstructor(overrides: Partial<MockUser> = {}): MockUser {
  const user: MockUser = {
    id: testData.users.length + 1,
    username: `instructor${testData.users.length + 1}`,
    password: "password123",
    role: "instructor",
    fullName: "Test Instructor",
    email: "instructor@test.com",
    isTemporary: false,
    ...overrides,
  };
  testData.users.push(user);
  return user;
}

export function createTestStudent(overrides: Partial<MockUser> = {}): MockUser {
  const user: MockUser = {
    id: testData.users.length + 1,
    username: `student${testData.users.length + 1}`,
    password: "password123",
    role: "student",
    fullName: "Test Student",
    email: "student@test.com",
    isTemporary: false,
    ...overrides,
  };
  testData.users.push(user);
  return user;
}

// Create a test Express app with authentication
export function createTestApp(): Express {
  const app = express();
  app.use(express.json());

  // Session setup
  const SessionStore = MemoryStore(session);
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      store: new SessionStore({ checkPeriod: 86400000 }),
    })
  );

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy((username, password, done) => {
      const user = testData.users.find(
        (u) => u.username === username && u.password === password
      );
      if (!user) {
        return done(null, false, { message: "Invalid credentials" });
      }
      return done(null, user);
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: number, done) => {
    const user = testData.users.find((u) => u.id === id);
    done(null, user || null);
  });

  // Login endpoint for tests
  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  // Logout endpoint for tests
  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out" });
    });
  });

  // User info endpoint
  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  return app;
}

// Helper to login as a user using supertest agent
export async function loginAs(
  agent: any,
  user: MockUser
): Promise<void> {
  await agent
    .post("/api/login")
    .send({ username: user.username, password: user.password })
    .expect(200);
}
