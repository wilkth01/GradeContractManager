import { describe, it, expect } from "vitest";
import {
  insertClassSchema,
  updateClassSchema,
  insertAssignmentSchema,
  insertGradeContractSchema,
  insertStudentInvitationSchema,
  setupPasswordSchema,
  passwordResetRequestSchema,
  resetPasswordSchema,
} from "../schema";

describe("Schema Validation", () => {
  describe("insertClassSchema", () => {
    it("should accept valid class data", () => {
      const validClass = {
        name: "Introduction to Programming",
        description: "Learn the basics of programming",
        semesterStartDate: "2024-01-15",
      };

      const result = insertClassSchema.safeParse(validClass);
      expect(result.success).toBe(true);
    });

    it("should accept class without optional fields", () => {
      const minimalClass = {
        name: "Math 101",
      };

      const result = insertClassSchema.safeParse(minimalClass);
      expect(result.success).toBe(true);
    });

    it("should reject class without name", () => {
      const invalidClass = {
        description: "A class without a name",
      };

      const result = insertClassSchema.safeParse(invalidClass);
      expect(result.success).toBe(false);
    });
  });

  describe("updateClassSchema", () => {
    it("should accept partial updates", () => {
      const partialUpdate = {
        description: "Updated description",
      };

      const result = updateClassSchema.safeParse(partialUpdate);
      expect(result.success).toBe(true);
    });

    it("should accept empty object (no changes)", () => {
      const result = updateClassSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("insertAssignmentSchema", () => {
    it("should accept valid assignment with status scoring", () => {
      const validAssignment = {
        name: "Homework 1",
        classId: 1,
        moduleGroup: "Week 1",
        scoringType: "status",
      };

      const result = insertAssignmentSchema.safeParse(validAssignment);
      expect(result.success).toBe(true);
    });

    it("should accept valid assignment with numeric scoring", () => {
      const validAssignment = {
        name: "Final Exam",
        classId: 1,
        moduleGroup: null,
        scoringType: "numeric",
      };

      const result = insertAssignmentSchema.safeParse(validAssignment);
      expect(result.success).toBe(true);
    });

    it("should reject assignment with invalid scoring type", () => {
      const invalidAssignment = {
        name: "Quiz",
        classId: 1,
        moduleGroup: null,
        scoringType: "letter",
      };

      const result = insertAssignmentSchema.safeParse(invalidAssignment);
      expect(result.success).toBe(false);
    });

    it("should reject assignment without classId", () => {
      const invalidAssignment = {
        name: "Assignment",
        scoringType: "status",
      };

      const result = insertAssignmentSchema.safeParse(invalidAssignment);
      expect(result.success).toBe(false);
    });
  });

  describe("insertGradeContractSchema", () => {
    it("should accept valid grade contract for A grade", () => {
      const validContract = {
        classId: 1,
        grade: "A",
        version: 1,
        assignments: [
          { id: 1, comments: "Must complete with excellence" },
          { id: 2 },
        ],
        requiredEngagementIntentions: 10,
        maxAbsences: 2,
      };

      const result = insertGradeContractSchema.safeParse(validContract);
      expect(result.success).toBe(true);
    });

    it("should accept contract with default engagement/absence values", () => {
      const minimalContract = {
        classId: 1,
        grade: "B",
        version: 1,
        assignments: [{ id: 1 }],
      };

      const result = insertGradeContractSchema.safeParse(minimalContract);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requiredEngagementIntentions).toBe(0);
        expect(result.data.maxAbsences).toBe(0);
      }
    });

    it("should reject contract with invalid grade", () => {
      const invalidContract = {
        classId: 1,
        grade: "D",
        version: 1,
        assignments: [],
      };

      const result = insertGradeContractSchema.safeParse(invalidContract);
      expect(result.success).toBe(false);
    });
  });

  describe("insertStudentInvitationSchema", () => {
    it("should accept valid invitation", () => {
      const validInvitation = {
        email: "student@example.com",
        fullName: "John Doe",
        classId: 1,
      };

      const result = insertStudentInvitationSchema.safeParse(validInvitation);
      expect(result.success).toBe(true);
    });

    it("should reject invitation without email", () => {
      const invalidInvitation = {
        fullName: "John Doe",
        classId: 1,
      };

      const result = insertStudentInvitationSchema.safeParse(invalidInvitation);
      expect(result.success).toBe(false);
    });
  });

  describe("setupPasswordSchema", () => {
    it("should accept valid setup data", () => {
      const validSetup = {
        token: "abc123",
        username: "jdoe",
        password: "password123",
      };

      const result = setupPasswordSchema.safeParse(validSetup);
      expect(result.success).toBe(true);
    });

    it("should reject username shorter than 3 characters", () => {
      const invalidSetup = {
        token: "abc123",
        username: "jd",
        password: "password123",
      };

      const result = setupPasswordSchema.safeParse(invalidSetup);
      expect(result.success).toBe(false);
    });

    it("should reject password shorter than 6 characters", () => {
      const invalidSetup = {
        token: "abc123",
        username: "jdoe",
        password: "pass",
      };

      const result = setupPasswordSchema.safeParse(invalidSetup);
      expect(result.success).toBe(false);
    });
  });

  describe("passwordResetRequestSchema", () => {
    it("should accept valid username", () => {
      const validRequest = {
        username: "jdoe",
      };

      const result = passwordResetRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("should reject empty username", () => {
      const invalidRequest = {
        username: "",
      };

      const result = passwordResetRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("resetPasswordSchema", () => {
    it("should accept valid reset data", () => {
      const validReset = {
        token: "reset-token-123",
        password: "newpassword123",
      };

      const result = resetPasswordSchema.safeParse(validReset);
      expect(result.success).toBe(true);
    });

    it("should reject short password", () => {
      const invalidReset = {
        token: "reset-token-123",
        password: "short",
      };

      const result = resetPasswordSchema.safeParse(invalidReset);
      expect(result.success).toBe(false);
    });
  });
});
