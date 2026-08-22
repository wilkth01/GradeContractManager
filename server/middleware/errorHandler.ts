import type { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../errors";

/**
 * Centralized error handler.
 *
 * Route handlers are wrapped in asyncHandler, so a thrown AppError -- or any
 * rejected promise -- lands here rather than hanging the request.
 */
export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Expected 4xx conditions are normal traffic, not incidents. Only log the
  // unexpected ones, so real failures stay visible in the output.
  const isExpected = err instanceof AppError && err.isOperational && err.statusCode < 500;
  if (!isExpected) {
    console.error("Error:", {
      name: err.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined,
      ...(err instanceof AppError && {
        statusCode: err.statusCode,
        isOperational: err.isOperational,
      }),
    });
  }

  if (err instanceof AppError) {
    const response: Record<string, unknown> = { message: err.message };

    if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
      response.errors = err.errors;
    }
    if (isDevelopment) {
      response.stack = err.stack;
    }

    return res.status(err.statusCode).json(response);
  }

  // Unknown errors are programming faults. Never leak internals in production.
  res.status(500).json({
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
    ...(isDevelopment && { stack: err.stack }),
  });
}
