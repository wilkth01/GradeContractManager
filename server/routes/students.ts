import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { hashPassword, toPublicUser } from "../auth";
import { requireClassOwner } from "../middleware";
import { asyncHandler, BadRequestError } from "../errors";

const router = Router();

// The class roster. Instructor only -- it carries usernames and emails.
router.get(
  "/api/classes/:classId/students",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const students = await storage.getEnrolledStudents(req.cls!.id);
    res.json(students.map(toPublicUser));
  })
);

const importStudentSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  fullName: z.string().min(1),
  email: z.string().optional(),
});

// Bulk-create student accounts and enroll them
router.post(
  "/api/classes/:classId/students/import",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = z.array(importStudentSchema).safeParse(req.body.students);
    if (!parsed.success) {
      throw new BadRequestError("Invalid students data");
    }

    const classId = req.cls!.id;
    const enrolledStudents = [];

    // Sequential rather than Promise.all: two rows in the same upload can name
    // the same user, and concurrent create/enroll would race on that.
    for (const student of parsed.data) {
      let user = await storage.getUserByUsername(student.username);

      if (!user) {
        user = await storage.createUser({
          username: student.username,
          password: await hashPassword(student.password),
          fullName: student.fullName,
          role: "student",
        });
      }

      await storage.enrollStudent(classId, user.id);

      enrolledStudents.push({
        id: user.id,
        username: user.username,
        fullName: student.fullName,
        email: student.email,
      });
    }

    res.status(201).json(enrolledStudents);
  })
);

export default router;
