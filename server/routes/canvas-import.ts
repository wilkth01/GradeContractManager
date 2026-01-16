import { Router } from "express";
import { requireInstructor } from "../middleware";
import { storage } from "../storage";
import {
  CanvasImportService,
  NormalizedGradeData,
  AssignmentMapping,
  GradeChange,
} from "../services/canvas-import";

const router = Router();
const importService = new CanvasImportService();

/**
 * Generate a preview of the import without committing changes
 * POST /api/classes/:classId/canvas/preview
 */
router.post("/api/classes/:classId/canvas/preview", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);

  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { normalizedData, mappings } = req.body as {
    normalizedData: NormalizedGradeData;
    mappings: AssignmentMapping[];
  };

  if (!normalizedData || !mappings) {
    return res.status(400).json({ message: "Missing normalizedData or mappings" });
  }

  try {
    const preview = await importService.generatePreview(classId, normalizedData, mappings);
    res.json(preview);
  } catch (error) {
    console.error("Error generating import preview:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to generate preview"
    });
  }
});

/**
 * Execute the import with approved grade changes
 * POST /api/classes/:classId/canvas/import
 */
router.post("/api/classes/:classId/canvas/import", requireInstructor, async (req, res) => {
  const classId = parseInt(req.params.classId);

  if (isNaN(classId)) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  // Verify instructor owns this class
  const cls = await storage.getClass(classId);
  if (!cls || cls.instructorId !== req.user!.id) {
    return res.status(403).json({ message: "Not authorized" });
  }

  const { gradeChanges } = req.body as { gradeChanges: GradeChange[] };

  if (!gradeChanges || !Array.isArray(gradeChanges)) {
    return res.status(400).json({ message: "Missing or invalid gradeChanges" });
  }

  try {
    const result = await importService.executeImport(gradeChanges);

    // Log successful imports to audit (if audit service is available)
    console.log(`Canvas import completed for class ${classId}:`, {
      processedStudents: result.processedStudents,
      processedGrades: result.processedGrades,
      errors: result.errors.length
    });

    res.json(result);
  } catch (error) {
    console.error("Error executing import:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to execute import"
    });
  }
});

export default router;
