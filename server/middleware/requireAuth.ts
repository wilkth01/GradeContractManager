import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { Class } from "@shared/schema";

// Extend Express Request to include attached class data
declare global {
  namespace Express {
    interface Request {
      cls?: Class;
    }
  }
}

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.sendStatus(401);
  }
  next();
}

/**
 * Middleware to require instructor role
 */
export function requireInstructor(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.sendStatus(401);
  }
  if (req.user.role !== "instructor") {
    return res.sendStatus(403);
  }
  next();
}

/**
 * Middleware to require student role
 */
export function requireStudent(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.sendStatus(401);
  }
  if (req.user.role !== "student") {
    return res.sendStatus(403);
  }
  next();
}

/**
 * Middleware factory to verify class ownership (instructor owns the class)
 * Expects classId to be in req.params as :classId or :id
 */
export function requireClassOwner(paramName: string = "classId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    if (req.user.role !== "instructor") {
      return res.sendStatus(403);
    }

    const classId = parseInt(req.params[paramName]);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (cls.instructorId !== req.user.id) {
      return res.sendStatus(403);
    }

    // Attach class to request for use in route handlers
    req.cls = cls;
    next();
  };
}

/**
 * Middleware factory to verify class membership (instructor or enrolled student)
 */
export function requireClassMember(paramName: string = "classId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    const classId = parseInt(req.params[paramName]);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cls = await storage.getClass(classId);
    if (!cls) {
      return res.status(404).json({ message: "Class not found" });
    }

    if (req.user.role === "instructor") {
      if (cls.instructorId !== req.user.id) {
        return res.sendStatus(403);
      }
    } else {
      // Check if student is enrolled in the class (via studentContracts table)
      const studentContract = await storage.getStudentContract(req.user.id, classId);
      if (!studentContract) {
        return res.sendStatus(403);
      }
    }

    // Attach class to request for use in route handlers
    req.cls = cls;
    next();
  };
}

/**
 * Helper to parse and validate integer parameters
 */
export function parseIntParam(value: string, name: string): number | null {
  const parsed = parseInt(value);
  if (isNaN(parsed)) {
    return null;
  }
  return parsed;
}
