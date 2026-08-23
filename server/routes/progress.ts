import { Router } from "express";
import { storage } from "../storage";
import { auditService } from "../audit";
import { connectionManager, createProgressUpdateEvent } from "../websocket";
import { requireClassOwner, requireStudentAccess } from "../middleware";
import { asyncHandler, BadRequestError, ForbiddenError, NotFoundError } from "../errors";
import { MAX_ASSIGNMENT_STATUS, MAX_NUMERIC_GRADE } from "@shared/constants";

const router = Router();

// All progress in a class. Instructor only -- this is every student grade.
router.get(
  "/api/classes/:classId/students/progress",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const allProgress = await storage.getStudentProgressForClass(req.cls!.id);
    res.json(allProgress);
  })
);

// One student progress. The student themselves, or the class owner.
router.get(
  "/api/classes/:classId/students/:studentId/progress",
  requireStudentAccess(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const progress = await storage.getStudentProgress(studentId, req.cls!.id);
    res.json(progress);
  })
);

// Record a grade for one student on one assignment.
router.post(
  "/api/classes/:classId/students/:studentId/assignments/:assignmentId/progress",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const classId = req.cls!.id;
    const studentId = parseInt(req.params.studentId);
    const assignmentId = parseInt(req.params.assignmentId);

    if (isNaN(studentId) || isNaN(assignmentId)) {
      throw new BadRequestError("Invalid student or assignment ID");
    }

    // The assignment has to belong to this class, and the student has to be
    // enrolled in it. Without both checks, owning any one class would let you
    // write a grade anywhere.
    const classAssignments = await storage.getAssignmentsByClass(classId);
    const assignment = classAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new NotFoundError("Assignment not found in this class");
    }

    const enrollment = await storage.getStudentContract(studentId, classId);
    if (!enrollment) {
      throw new ForbiddenError("That student is not enrolled in this class");
    }

    // Only the field matching the assignment scoring type is writable, so a
    // numeric score cannot end up on a status assignment or vice versa.
    let status: number | null = null;
    let numericGrade: string | null = null;

    if (assignment.scoringType === "status") {
      if (req.body.status === undefined || req.body.status === null) {
        throw new BadRequestError("status is required for a status assignment");
      }
      const parsedStatus = parseInt(req.body.status);
      if (isNaN(parsedStatus) || parsedStatus < 0 || parsedStatus > MAX_ASSIGNMENT_STATUS) {
        throw new BadRequestError(`status must be between 0 and ${MAX_ASSIGNMENT_STATUS}`);
      }
      status = parsedStatus;
    } else {
      if (req.body.numericGrade === undefined || req.body.numericGrade === null) {
        throw new BadRequestError("numericGrade is required for a numeric assignment");
      }
      const parsedGrade = parseFloat(req.body.numericGrade);
      if (isNaN(parsedGrade) || parsedGrade < 0 || parsedGrade > MAX_NUMERIC_GRADE) {
        throw new BadRequestError(`numericGrade must be between 0 and ${MAX_NUMERIC_GRADE}`);
      }
      numericGrade = parsedGrade.toString();
    }

    const existingProgress = await storage.getStudentProgress(studentId, classId);
    const currentProgress = existingProgress.find((p) => p.assignmentId === assignmentId);

    const progress = await storage.updateProgress({
      studentId,
      assignmentId,
      status,
      numericGrade,
      lastUpdated: new Date(),
      attempts: (currentProgress?.attempts ?? 0) + 1,
    });

    await auditService.logWithRequest(req, {
      action: currentProgress ? "UPDATE" : "CREATE",
      entityType: "assignment_progress",
      entityId: progress.id,
      oldValues: currentProgress
        ? {
            studentId: currentProgress.studentId,
            assignmentId: currentProgress.assignmentId,
            status: currentProgress.status,
            numericGrade: currentProgress.numericGrade,
            classId,
          }
        : null,
      newValues: {
        studentId: progress.studentId,
        assignmentId: progress.assignmentId,
        status: progress.status,
        numericGrade: progress.numericGrade,
        classId,
      },
    });

    const event = createProgressUpdateEvent(classId, {
      studentId,
      assignmentId,
      status: progress.status ?? undefined,
      numericGrade: progress.numericGrade ?? undefined,
      attempts: progress.attempts ?? undefined,
    });
    connectionManager.broadcast(classId, event);

    res.json(progress);
  })
);

export default router;
