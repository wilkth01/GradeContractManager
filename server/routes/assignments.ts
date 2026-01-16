import { Router } from "express";
import { storage } from "../storage";
import { insertAssignmentSchema } from "@shared/schema";
import { requireAuth, requireInstructor } from "../middleware";

const router = Router();

// Create a new assignment
router.post("/api/classes/:classId/assignments", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  const parsedData = {
    ...req.body,
    classId,
    moduleGroup: req.body.moduleGroup || null,
    attemptLimit: req.body.attemptLimit ? parseInt(req.body.attemptLimit) : null,
  };

  const parsed = insertAssignmentSchema.safeParse(parsedData);
  if (!parsed.success) {
    return res.status(400).json(parsed.error);
  }

  // Convert dueDate string to Date object if provided
  const assignmentData = {
    ...parsed.data,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
  };

  const assignment = await storage.createAssignment(assignmentData);
  res.status(201).json(assignment);
});

// Get all assignments for a class
router.get("/api/classes/:classId/assignments", requireAuth, async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  try {
    const assignments = await storage.getAssignmentsByClass(classId);
    res.json(assignments);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({ message: "Failed to fetch assignments" });
  }
});

// Update an assignment
router.patch("/api/classes/:classId/assignments/:assignmentId", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);
  const assignmentId = parseInt(req.params.assignmentId);

  if (isNaN(classId) || isNaN(assignmentId)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  try {
    const assignment = await storage.updateAssignment(assignmentId, req.body);
    res.json(assignment);
  } catch (error) {
    console.error("Error updating assignment:", error);
    res.status(500).json({ message: "Failed to update assignment" });
  }
});

// Delete an assignment
router.delete("/api/classes/:classId/assignments/:assignmentId", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);
  const assignmentId = parseInt(req.params.assignmentId);

  if (isNaN(classId) || isNaN(assignmentId)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  try {
    await storage.deleteAssignment(assignmentId);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error deleting assignment:", error);
    res.status(500).json({ message: "Failed to delete assignment" });
  }
});

// Reorder assignments
router.put("/api/classes/:classId/assignments/reorder", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);

  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.sendStatus(403);
  }

  const { assignmentIds } = req.body;

  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    return res.status(400).json({ message: "Invalid assignment IDs" });
  }

  try {
    await storage.reorderAssignments(classId, assignmentIds);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error reordering assignments:", error);
    res.status(500).json({ message: "Failed to reorder assignments" });
  }
});

export default router;
