import { Router } from "express";
import { storage } from "../storage";
import { toPublicUser } from "../auth";
import { insertClassSchema, updateClassSchema } from "@shared/schema";
import { requireAuth, requireInstructor, requireClassOwner, requireClassMember } from "../middleware";
import { asyncHandler, BadRequestError } from "../errors";

const router = Router();

// Create a new class
router.post(
  "/api/classes",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const parsed = insertClassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid class data");
    }

    const newClass = await storage.createClass({
      ...parsed.data,
      instructorId: req.user!.id,
      description: parsed.data.description || null,
      semesterStartDate: parsed.data.semesterStartDate || null,
      absencePenaltyThreshold: parsed.data.absencePenaltyThreshold ?? null,
      absenceFailureThreshold: parsed.data.absenceFailureThreshold ?? null,
      participationBar: parsed.data.participationBar ?? null,
      canvasCourseId: parsed.data.canvasCourseId ?? null,
      canvasAbsenceAssignmentId: null,
    });
    res.status(201).json(newClass);
  })
);

// All classes for the current user
router.get(
  "/api/classes",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role === "instructor") {
      const classes = await storage.getClassesByInstructor(req.user!.id);
      // The dashboard shows a roster total; without this it had a placeholder.
      const counts = await storage.getEnrollmentCounts(classes.map((c) => c.id));
      return res.json(
        classes.map((cls) => ({ ...cls, studentCount: counts.get(cls.id) ?? 0 }))
      );
    }

    const classes = await storage.getClassesByStudent(req.user!.id);
    const enrollments = await Promise.all(
      classes.map((cls) => storage.getStudentContract(req.user!.id, cls.id))
    );

    res.json(
      classes.map((cls, i) => ({
        ...cls,
        hasContract: enrollments[i]?.contractId != null,
        contractConfirmed: enrollments[i]?.isConfirmed ?? false,
      }))
    );
  })
);

// A single class. Enrolled students may read it; instructors must own it.
router.get(
  "/api/classes/:id",
  requireClassMember("id"),
  asyncHandler(async (req, res) => {
    res.json(req.cls);
  })
);

// Update a class
router.patch(
  "/api/classes/:id",
  requireClassOwner("id"),
  asyncHandler(async (req, res) => {
    const parsed = updateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid class data");
    }

    const updatedClass = await storage.updateClass(req.cls!.id, parsed.data);
    res.json(updatedClass);
  })
);

// Archive a class (hides it from students)
router.post(
  "/api/classes/:id/archive",
  requireClassOwner("id"),
  asyncHandler(async (req, res) => {
    await storage.archiveClass(req.cls!.id);
    res.json({ message: "Class archived successfully", isArchived: true });
  })
);

// Unarchive a class
router.post(
  "/api/classes/:id/unarchive",
  requireClassOwner("id"),
  asyncHandler(async (req, res) => {
    await storage.unarchiveClass(req.cls!.id);
    res.json({ message: "Class activated successfully", isArchived: false });
  })
);

// Delete a class and everything hanging off it
router.delete(
  "/api/classes/:id",
  requireClassOwner("id"),
  asyncHandler(async (req, res) => {
    await storage.deleteClass(req.cls!.id);
    res.json({ message: "Class deleted successfully" });
  })
);

// Clone a class structure without any student data
router.post(
  "/api/classes/:id/clone",
  requireClassOwner("id"),
  asyncHandler(async (req, res) => {
    const newClass = await storage.cloneClass(req.cls!.id, req.user!.id);
    res.status(201).json(newClass);
  })
);

// Enrolled students for a class
router.get(
  "/api/classes/:classId/enrolled-students",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const students = await storage.getEnrolledStudents(req.cls!.id);
    res.json(students.map(toPublicUser));
  })
);

export default router;
