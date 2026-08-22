import { Router } from "express";
import { requireClassOwner } from "../middleware";
import { storage } from "../storage";
import { asyncHandler, BadRequestError, ForbiddenError } from "../errors";
import {
  CanvasImportService,
  NormalizedGradeData,
  AssignmentMapping,
  GradeChange,
} from "../services/canvas-import";

const router = Router();
const importService = new CanvasImportService();

/**
 * Preview an import without committing anything.
 */
router.post(
  "/api/classes/:classId/canvas/preview",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const { normalizedData, mappings } = req.body as {
      normalizedData: NormalizedGradeData;
      mappings: AssignmentMapping[];
    };

    if (!normalizedData || !Array.isArray(mappings)) {
      throw new BadRequestError("Missing normalizedData or mappings");
    }

    const preview = await importService.generatePreview(
      req.cls!.id,
      normalizedData,
      mappings
    );
    res.json(preview);
  })
);

/**
 * Commit an import.
 *
 * The changes arrive from the client, so every student and assignment id is
 * re-checked against this class before anything is written. Without that, a
 * crafted request could write progress rows for any student on any assignment
 * anywhere in the database, using nothing but ownership of one unrelated class.
 */
router.post(
  "/api/classes/:classId/canvas/import",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const classId = req.cls!.id;
    const { gradeChanges } = req.body as { gradeChanges: GradeChange[] };

    if (!Array.isArray(gradeChanges)) {
      throw new BadRequestError("Missing or invalid gradeChanges");
    }

    const [enrolled, classAssignments] = await Promise.all([
      storage.getEnrolledStudents(classId),
      storage.getAssignmentsByClass(classId),
    ]);
    const enrolledIds = new Set(enrolled.map((s) => s.id));
    const assignmentIds = new Set(classAssignments.map((a) => a.id));

    for (const change of gradeChanges) {
      if (!enrolledIds.has(change.studentId)) {
        throw new ForbiddenError("An imported grade names a student outside this class");
      }
      if (!assignmentIds.has(change.assignmentId)) {
        throw new ForbiddenError(
          "An imported grade names an assignment outside this class"
        );
      }
    }

    const result = await importService.executeImport(gradeChanges, classId);

    console.log(`Canvas import completed for class ${classId}:`, {
      processedStudents: result.processedStudents,
      processedGrades: result.processedGrades,
      errors: result.errors.length,
    });

    res.json(result);
  })
);

export default router;
