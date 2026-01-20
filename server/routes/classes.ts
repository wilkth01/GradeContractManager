import { Router } from "express";
import { storage } from "../storage";
import { insertClassSchema, updateClassSchema } from "@shared/schema";
import { requireAuth, requireInstructor } from "../middleware";

const router = Router();

// Create a new class
router.post("/api/classes", requireInstructor, async (req, res) => {
  const parsed = insertClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error);
  }

  const newClass = await storage.createClass({
    ...parsed.data,
    instructorId: req.user!.id,
    description: parsed.data.description || null,
    semesterStartDate: parsed.data.semesterStartDate || null,
  });
  res.status(201).json(newClass);
});

// Get a single class by ID
router.get("/api/classes/:id", requireAuth, async (req, res) => {
  const classId = parseInt(req.params.id);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls) {
    return res.status(404).json({ message: "Class not found" });
  }

  if (req.user!.role === "instructor" && cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  res.json(cls);
});

// Get all classes for the current user
router.get("/api/classes", requireAuth, async (req, res) => {
  try {
    const classes = req.user!.role === "instructor"
      ? await storage.getClassesByInstructor(req.user!.id)
      : await storage.getClassesByStudent(req.user!.id);

    res.json(classes);
  } catch (error) {
    console.error("Error fetching classes:", error);
    res.status(500).json({ message: "Failed to fetch classes" });
  }
});

// Archive a class (make inactive)
router.post("/api/classes/:id/archive", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.id);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  await storage.archiveClass(classId);
  res.json({ message: "Class archived successfully", isArchived: true });
});

// Unarchive a class (make active)
router.post("/api/classes/:id/unarchive", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.id);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  await storage.unarchiveClass(classId);
  res.json({ message: "Class activated successfully", isArchived: false });
});

// Delete a class permanently
router.delete("/api/classes/:id", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.id);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  try {
    await storage.deleteClass(classId);
    res.json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("Error deleting class:", error);
    res.status(500).json({ message: "Failed to delete class. It may have associated data." });
  }
});

// Update a class
router.patch("/api/classes/:id", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.id);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  const parsed = updateClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error);
  }

  const updatedClass = await storage.updateClass(classId, parsed.data);
  res.json(updatedClass);
});

// Get enrolled students for a class
router.get("/api/classes/:classId/enrolled-students", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  try {
    const students = await storage.getEnrolledStudents(classId);
    res.json(students);
  } catch (error) {
    console.error("Error fetching enrolled students:", error);
    res.status(500).json({ message: "Failed to fetch enrolled students" });
  }
});

export default router;
