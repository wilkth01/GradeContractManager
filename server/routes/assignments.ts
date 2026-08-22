import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertAssignmentSchema } from "@shared/schema";
import { requireClassOwner, requireClassMember } from "../middleware";
import { asyncHandler, BadRequestError, NotFoundError } from "../errors";

const router = Router();

// Create an assignment
router.post(
  "/api/classes/:classId/assignments",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = insertAssignmentSchema.safeParse({
      ...req.body,
      classId: req.cls!.id,
      moduleGroup: req.body.moduleGroup || null,
    });
    if (!parsed.success) {
      throw new BadRequestError("Invalid assignment data");
    }

    const assignment = await storage.createAssignment({
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    });
    res.status(201).json(assignment);
  })
);

// List assignments. Enrolled students need this to see their contract work.
router.get(
  "/api/classes/:classId/assignments",
  requireClassMember(),
  asyncHandler(async (req, res) => {
    const assignments = await storage.getAssignmentsByClass(req.cls!.id);
    res.json(assignments);
  })
);

// Reorder assignments. Declared before the :assignmentId routes for clarity.
router.put(
  "/api/classes/:classId/assignments/reorder",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = z.array(z.number().int()).min(1).safeParse(req.body.assignmentIds);
    if (!parsed.success) {
      throw new BadRequestError("assignmentIds must be a non-empty array of numbers");
    }

    // reorderAssignments already scopes each update to the class, so ids from
    // another class are simply no-ops rather than cross-class writes.
    await storage.reorderAssignments(req.cls!.id, parsed.data);
    res.sendStatus(200);
  })
);

/**
 * Confirm an assignment belongs to the authorized class.
 *
 * Without this, owning any one class was enough to edit or delete an
 * assignment anywhere, since only the classId in the URL was ever checked.
 */
async function assignmentInClass(classId: number, assignmentId: number) {
  if (isNaN(assignmentId)) {
    throw new BadRequestError("Invalid assignment ID");
  }
  const assignments = await storage.getAssignmentsByClass(classId);
  const assignment = assignments.find((a) => a.id === assignmentId);
  if (!assignment) {
    throw new NotFoundError("Assignment not found in this class");
  }
  return assignment;
}

// Fields an instructor may change. classId and displayOrder are deliberately
// absent so an update cannot move an assignment into another class.
const updateAssignmentSchema = z.object({
  name: z.string().min(1).optional(),
  moduleGroup: z.string().nullable().optional(),
  scoringType: z.enum(["status", "numeric"]).optional(),
  dueDate: z.string().nullable().optional(),
});

// Update an assignment
router.patch(
  "/api/classes/:classId/assignments/:assignmentId",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const assignmentId = parseInt(req.params.assignmentId);
    await assignmentInClass(req.cls!.id, assignmentId);

    const parsed = updateAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid assignment data");
    }

    const { dueDate, ...rest } = parsed.data;
    const assignment = await storage.updateAssignment(assignmentId, {
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    });
    res.json(assignment);
  })
);

// Delete an assignment
router.delete(
  "/api/classes/:classId/assignments/:assignmentId",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const assignmentId = parseInt(req.params.assignmentId);
    await assignmentInClass(req.cls!.id, assignmentId);

    await storage.deleteAssignment(assignmentId);
    res.sendStatus(200);
  })
);

export default router;
