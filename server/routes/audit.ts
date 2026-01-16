import { Router } from "express";
import { auditService } from "../audit";
import { requireAuth, requireInstructor } from "../middleware";
import { storage } from "../storage";

const router = Router();

// Get audit history for a specific student in a class
router.get(
  "/api/classes/:classId/students/:studentId/history",
  requireAuth,
  async (req, res) => {
    const classId = parseInt(req.params.classId);
    const studentId = parseInt(req.params.studentId);

    if (isNaN(classId) || isNaN(studentId)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    // Verify access
    if (req.user!.role === "instructor") {
      // Instructor must own the class
      const cls = await storage.getClass(classId);
      if (!cls || cls.instructorId !== req.user!.id) {
        return res.sendStatus(403);
      }
    } else {
      // Students can only view their own history
      if (req.user!.id !== studentId) {
        return res.sendStatus(403);
      }
      // Verify student is enrolled
      const contract = await storage.getStudentContract(studentId, classId);
      if (!contract) {
        return res.sendStatus(403);
      }
    }

    try {
      const logs = await auditService.getLogsForStudent(studentId);

      // Filter to only logs related to this class
      const classLogs = logs.filter((log) => {
        const values = (log.newValues || log.oldValues) as Record<
          string,
          unknown
        > | null;
        return values?.classId === classId;
      });

      res.json(classLogs);
    } catch (error) {
      console.error("Error fetching student history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  }
);

// Get all activity for a class (instructor only)
router.get(
  "/api/classes/:classId/activity",
  requireInstructor,
  async (req, res) => {
    const classId = parseInt(req.params.classId);

    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    // Verify instructor owns the class
    const cls = await storage.getClass(classId);
    if (!cls || cls.instructorId !== req.user!.id) {
      return res.sendStatus(403);
    }

    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await auditService.getLogsForClass(classId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching class activity:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  }
);

export default router;
