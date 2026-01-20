import type { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../errors";

/**
 * Middleware factory to validate that route parameters are valid integers.
 * Parses the parameters and attaches them to req.validatedParams for type-safe access.
 *
 * @param paramNames - Array of parameter names to validate (e.g., ["classId", "studentId"])
 * @returns Express middleware that validates and parses the parameters
 *
 * @example
 * // Single parameter
 * app.get("/api/classes/:classId", validateIntParams(["classId"]), (req, res) => {
 *   const { classId } = req.validatedParams;
 *   // classId is guaranteed to be a valid number
 * });
 *
 * // Multiple parameters
 * app.get("/api/classes/:classId/students/:studentId",
 *   validateIntParams(["classId", "studentId"]),
 *   (req, res) => {
 *     const { classId, studentId } = req.validatedParams;
 *   }
 * );
 */
export function validateIntParams(paramNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const validatedParams: Record<string, number> = {};

    for (const paramName of paramNames) {
      const rawValue = req.params[paramName];

      if (rawValue === undefined) {
        return next(new BadRequestError(`Missing required parameter: ${paramName}`));
      }

      const parsed = parseInt(rawValue, 10);

      if (isNaN(parsed)) {
        return next(new BadRequestError(`Invalid ${paramName}: must be a valid integer`));
      }

      validatedParams[paramName] = parsed;
    }

    req.validatedParams = validatedParams;
    next();
  };
}

/**
 * Middleware factory to validate query parameters as integers.
 * Parsed values are attached to req.validatedQuery.
 *
 * @param queryParams - Object with query param names and whether they're required
 *
 * @example
 * app.get("/api/items", validateIntQuery({ page: false, limit: false }), (req, res) => {
 *   const { page = 1, limit = 10 } = req.validatedQuery;
 * });
 */
export function validateIntQuery(queryParams: Record<string, boolean>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const validatedQuery: Record<string, number | undefined> = {};

    for (const [paramName, required] of Object.entries(queryParams)) {
      const rawValue = req.query[paramName];

      if (rawValue === undefined || rawValue === "") {
        if (required) {
          return next(new BadRequestError(`Missing required query parameter: ${paramName}`));
        }
        continue;
      }

      if (typeof rawValue !== "string") {
        return next(new BadRequestError(`Invalid ${paramName}: expected single value`));
      }

      const parsed = parseInt(rawValue, 10);

      if (isNaN(parsed)) {
        return next(new BadRequestError(`Invalid ${paramName}: must be a valid integer`));
      }

      validatedQuery[paramName] = parsed;
    }

    req.validatedQuery = validatedQuery;
    next();
  };
}

/**
 * Helper function to parse an integer parameter with a default value.
 * Use this for inline parsing when middleware isn't practical.
 *
 * @param value - The string value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed integer or default value
 */
export function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Helper function to parse an integer and throw BadRequestError if invalid.
 * Use this for inline parsing when you want to fail on invalid input.
 *
 * @param value - The string value to parse
 * @param name - Parameter name for error message
 * @returns Parsed integer
 * @throws BadRequestError if parsing fails
 */
export function parseIntOrThrow(value: string | undefined, name: string): number {
  if (value === undefined) {
    throw new BadRequestError(`Missing required parameter: ${name}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new BadRequestError(`Invalid ${name}: must be a valid integer`);
  }
  return parsed;
}

// Extend Express Request to include validated parameters
declare global {
  namespace Express {
    interface Request {
      validatedParams: Record<string, number>;
      validatedQuery: Record<string, number | undefined>;
    }
  }
}
