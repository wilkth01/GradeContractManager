import { Router } from "express";
import { auditService } from "../audit";
import { requireClassOwner, requireStudentAccess } from "../middleware";
import { asyncHandler, BadRequestError } from "../errors";

const router = Router();

// Change history for one student in one class.
// The student themselves, or the instructor who owns the class.
router.get(
  "/api/classes/:classId/students/:studentId/history",
  requireStudentAccess(),
  asyncHandler(async (req, res) => {
    const classId = req.cls!.id;
    const studentId = parseInt(req.params.studentId);

    const logs = await auditService.getLogsForStudent(studentId);

    const classLogs = logs.filter((log) => {
      const values = (log.newValues || log.oldValues) as Record<string, unknown> | null;
      return values?.classId === classId;
    });

    res.json(classLogs);
  })
);

// All activity in a class
router.get(
  "/api/classes/:classId/activity",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const rawLimit = req.query.limit;
    const limit = typeof rawLimit === "string" ? parseInt(rawLimit, 10) : 100;
    if (isNaN(limit) || limit < 1 || limit > 500) {
      throw new BadRequestError("limit must be between 1 and 500");
    }

    const logs = await auditService.getLogsForClass(req.cls!.id, limit);
    res.json(logs);
  })
);

export default router;
