import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { Class } from "@shared/schema";
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from "../errors";

// Extend Express Request to include attached class data
declare global {
  namespace Express {
    interface Request {
      cls?: Class;
    }
  }
}

/**
 * Middleware to require authentication.
 * Throws UnauthorizedError if not authenticated.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return next(new UnauthorizedError());
  }
  next();
}

/**
 * Middleware to require instructor role.
 * Throws UnauthorizedError if not authenticated, ForbiddenError if not instructor.
 */
export function requireInstructor(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return next(new UnauthorizedError());
  }
  if (req.user.role !== "instructor") {
    return next(new ForbiddenError("Instructor access required"));
  }
  next();
}

/**
 * Middleware to require student role.
 * Throws UnauthorizedError if not authenticated, ForbiddenError if not student.
 */
export function requireStudent(req: Request, _res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return next(new UnauthorizedError());
  }
  if (req.user.role !== "student") {
    return next(new ForbiddenError("Student access required"));
  }
  next();
}

/**
 * Middleware factory to verify class ownership (instructor owns the class).
 * Attaches class to req.cls for use in route handlers.
 * Expects classId to be in req.params as :classId or :id
 */
export function requireClassOwner(paramName: string = "classId") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.isAuthenticated()) {
        return next(new UnauthorizedError());
      }
      if (req.user.role !== "instructor") {
        return next(new ForbiddenError("Instructor access required"));
      }

      const classId = parseInt(req.params[paramName]);
      if (isNaN(classId)) {
        return next(new BadRequestError("Invalid class ID"));
      }

      const cls = await storage.getClass(classId);
      if (!cls) {
        return next(new NotFoundError("Class not found"));
      }

      if (cls.instructorId !== req.user.id) {
        return next(new ForbiddenError("You do not own this class"));
      }

      // Attach class to request for use in route handlers
      req.cls = cls;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory to verify class membership (instructor or enrolled student).
 * Attaches class to req.cls for use in route handlers.
 */
export function requireClassMember(paramName: string = "classId") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.isAuthenticated()) {
        return next(new UnauthorizedError());
      }

      const classId = parseInt(req.params[paramName]);
      if (isNaN(classId)) {
        return next(new BadRequestError("Invalid class ID"));
      }

      const cls = await storage.getClass(classId);
      if (!cls) {
        return next(new NotFoundError("Class not found"));
      }

      if (req.user.role === "instructor") {
        if (cls.instructorId !== req.user.id) {
          return next(new ForbiddenError("You do not own this class"));
        }
      } else {
        // Check if student is enrolled in the class (via studentContracts table)
        const studentContract = await storage.getStudentContract(req.user.id, classId);
        if (!studentContract) {
          return next(new ForbiddenError("You are not enrolled in this class"));
        }
      }

      // Attach class to request for use in route handlers
      req.cls = cls;
      next();
    } catch (error) {
      next(error);
    }
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

/**
 * Middleware factory for routes scoped to one student inside one class.
 *
 * Grants access to the instructor who owns the class, or to that student
 * themselves (provided they are enrolled). Any other authenticated user is
 * rejected -- this is what stops a student reading a classmate's record by
 * changing the id in the URL.
 *
 * Attaches the class to req.cls for use in route handlers.
 */
export function requireStudentAccess(
  classIdParam: string = "classId",
  studentIdParam: string = "studentId"
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.isAuthenticated()) {
        return next(new UnauthorizedError());
      }

      const classId = parseInt(req.params[classIdParam]);
      if (isNaN(classId)) {
        return next(new BadRequestError("Invalid class ID"));
      }

      const studentId = parseInt(req.params[studentIdParam]);
      if (isNaN(studentId)) {
        return next(new BadRequestError("Invalid student ID"));
      }

      const cls = await storage.getClass(classId);
      if (!cls) {
        return next(new NotFoundError("Class not found"));
      }

      if (req.user.role === "instructor") {
        if (cls.instructorId !== req.user.id) {
          return next(new ForbiddenError("You do not own this class"));
        }
      } else {
        if (req.user.id !== studentId) {
          return next(new ForbiddenError("You may only access your own record"));
        }
        const enrollment = await storage.getStudentContract(req.user.id, classId);
        if (!enrollment) {
          return next(new ForbiddenError("You are not enrolled in this class"));
        }
      }

      req.cls = cls;
      next();
    } catch (error) {
      next(error);
    }
  };
}
