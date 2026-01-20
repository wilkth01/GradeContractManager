/**
 * Tests for validation middleware.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  validateIntParams,
  validateIntQuery,
  parseIntOrDefault,
  parseIntOrThrow,
} from "../middleware/validate";
import { BadRequestError } from "../errors";

describe("Validation Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      params: {},
      query: {},
      validatedParams: {},
      validatedQuery: {},
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  describe("validateIntParams", () => {
    it("should parse valid integer parameters", () => {
      mockReq.params = { classId: "123", studentId: "456" };

      const middleware = validateIntParams(["classId", "studentId"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedParams).toEqual({ classId: 123, studentId: 456 });
    });

    it("should call next with error for non-integer values", () => {
      mockReq.params = { classId: "abc" };

      const middleware = validateIntParams(["classId"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      const error = (mockNext as any).mock.calls[0][0];
      expect(error.message).toContain("Invalid classId");
    });

    it("should call next with error for missing required parameters", () => {
      mockReq.params = {};

      const middleware = validateIntParams(["classId"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      const error = (mockNext as any).mock.calls[0][0];
      expect(error.message).toContain("Missing required parameter");
    });

    it("should handle decimal strings by parsing to integer", () => {
      mockReq.params = { id: "123.45" };

      const middleware = validateIntParams(["id"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedParams).toEqual({ id: 123 });
    });

    it("should handle negative zero edge case", () => {
      mockReq.params = { id: "-0" };

      const middleware = validateIntParams(["id"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      // JavaScript parseInt("-0") returns -0, which equals 0 arithmetically
      expect(mockReq.validatedParams!.id == 0).toBe(true);
    });

    it("should accept negative integers", () => {
      mockReq.params = { offset: "-10" };

      const middleware = validateIntParams(["offset"]);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedParams).toEqual({ offset: -10 });
    });
  });

  describe("validateIntQuery", () => {
    it("should parse optional query parameters when present", () => {
      mockReq.query = { page: "2", limit: "20" };

      const middleware = validateIntQuery({ page: false, limit: false });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedQuery).toEqual({ page: 2, limit: 20 });
    });

    it("should skip optional query parameters when absent", () => {
      mockReq.query = {};

      const middleware = validateIntQuery({ page: false, limit: false });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedQuery).toEqual({});
    });

    it("should call next with error for missing required query parameters", () => {
      mockReq.query = {};

      const middleware = validateIntQuery({ classId: true });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      const error = (mockNext as any).mock.calls[0][0];
      expect(error.message).toContain("Missing required query parameter");
    });

    it("should call next with error for invalid query parameter values", () => {
      mockReq.query = { page: "not-a-number" };

      const middleware = validateIntQuery({ page: false });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(BadRequestError));
      const error = (mockNext as any).mock.calls[0][0];
      expect(error.message).toContain("Invalid page");
    });

    it("should skip empty string values for optional parameters", () => {
      mockReq.query = { page: "" };

      const middleware = validateIntQuery({ page: false });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.validatedQuery).toEqual({});
    });
  });

  describe("parseIntOrDefault", () => {
    it("should return parsed integer for valid input", () => {
      expect(parseIntOrDefault("42", 0)).toBe(42);
    });

    it("should return default for undefined input", () => {
      expect(parseIntOrDefault(undefined, 10)).toBe(10);
    });

    it("should return default for non-numeric input", () => {
      expect(parseIntOrDefault("abc", 5)).toBe(5);
    });

    it("should return default for empty string", () => {
      expect(parseIntOrDefault("", 3)).toBe(3);
    });

    it("should parse negative integers", () => {
      expect(parseIntOrDefault("-15", 0)).toBe(-15);
    });
  });

  describe("parseIntOrThrow", () => {
    it("should return parsed integer for valid input", () => {
      expect(parseIntOrThrow("42", "id")).toBe(42);
    });

    it("should throw BadRequestError for undefined input", () => {
      expect(() => parseIntOrThrow(undefined, "id")).toThrow(BadRequestError);
      expect(() => parseIntOrThrow(undefined, "id")).toThrow("Missing required parameter");
    });

    it("should throw BadRequestError for non-numeric input", () => {
      expect(() => parseIntOrThrow("abc", "id")).toThrow(BadRequestError);
      expect(() => parseIntOrThrow("abc", "id")).toThrow("must be a valid integer");
    });

    it("should parse negative integers", () => {
      expect(parseIntOrThrow("-20", "offset")).toBe(-20);
    });
  });
});
