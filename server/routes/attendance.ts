import { Router } from "express";
import { storage } from "../storage";
import {
  insertClassSessionSchema,
  updateClassSessionSchema,
  recordParticipationSchema,
  setAbsencesSchema,
} from "@shared/schema";
import { requireClassOwner, requireStudentAccess } from "../middleware";
import { asyncHandler, BadRequestError, ForbiddenError, NotFoundError } from "../errors";

const router = Router();

/**
 * Load a session and confirm it belongs to the authorized class.
 *
 * Without this, owning any one class would let you take roll in another.
 */
async function sessionInClass(classId: number, rawSessionId: string) {
  const sessionId = parseInt(rawSessionId);
  if (isNaN(sessionId)) {
    throw new BadRequestError("Invalid session ID");
  }
  const session = await storage.getClassSession(sessionId);
  if (!session || session.classId !== classId) {
    throw new NotFoundError("Session not found in this class");
  }
  return session;
}

// List the class meetings
router.get(
  "/api/classes/:classId/sessions",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const sessions = await storage.getClassSessions(req.cls!.id);
    res.json(sessions);
  })
);

// Create a class meeting
router.post(
  "/api/classes/:classId/sessions",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = insertClassSessionSchema.safeParse({
      ...req.body,
      classId: req.cls!.id,
    });
    if (!parsed.success) {
      throw new BadRequestError("A session needs a valid date");
    }

    const date = new Date(parsed.data.date);
    if (isNaN(date.getTime())) {
      throw new BadRequestError("A session needs a valid date");
    }

    // One session per class per day.
    const existing = await storage.getClassSessions(req.cls!.id);
    if (existing.some((s) => new Date(s.date).getTime() === date.getTime())) {
      throw new BadRequestError("A session already exists for that date");
    }

    const session = await storage.createClassSession({
      classId: req.cls!.id,
      date,
      topic: parsed.data.topic ?? null,
      notes: parsed.data.notes ?? null,
    });
    res.status(201).json(session);
  })
);

// Update a class meeting
router.patch(
  "/api/classes/:classId/sessions/:sessionId",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const session = await sessionInClass(req.cls!.id, req.params.sessionId);

    const parsed = updateClassSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid session data");
    }

    const { date, ...rest } = parsed.data;
    const updated = await storage.updateClassSession(session.id, {
      ...rest,
      ...(date !== undefined ? { date: new Date(date) } : {}),
    });
    res.json(updated);
  })
);

// Delete a class meeting and the attendance recorded against it
router.delete(
  "/api/classes/:classId/sessions/:sessionId",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const session = await sessionInClass(req.cls!.id, req.params.sessionId);
    await storage.deleteClassSession(session.id);
    res.json({ message: "Session deleted" });
  })
);

// Participation for one meeting
router.get(
  "/api/classes/:classId/sessions/:sessionId/participation",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const session = await sessionInClass(req.cls!.id, req.params.sessionId);
    const records = await storage.getSessionParticipation(session.id);
    res.json(records);
  })
);

// Record participation for one meeting
router.put(
  "/api/classes/:classId/sessions/:sessionId/participation",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const session = await sessionInClass(req.cls!.id, req.params.sessionId);

    const parsed = recordParticipationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid participation data");
    }

    // Only enrolled students may be written.
    const enrolled = await storage.getEnrolledStudents(req.cls!.id);
    const enrolledIds = new Set(enrolled.map((s) => s.id));
    for (const entry of parsed.data.entries) {
      if (!enrolledIds.has(entry.studentId)) {
        throw new ForbiddenError("That student is not enrolled in this class");
      }
    }

    await storage.recordSessionParticipation(session.id, parsed.data.entries);
    const records = await storage.getSessionParticipation(session.id);
    res.json(records);
  })
);

// All participation in the class
router.get(
  "/api/classes/:classId/participation",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const records = await storage.getClassParticipation(req.cls!.id);
    res.json(records);
  })
);

// One student participation. The student themselves, or the class owner.
router.get(
  "/api/classes/:classId/students/:studentId/participation",
  requireStudentAccess(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const records = await storage.getStudentParticipation(studentId, req.cls!.id);
    res.json(records);
  })
);

// ============================================================================
// Absence totals. Qwickly owns attendance; these are imported from the Canvas
// gradebook column Qwickly writes, not recorded here.
// ============================================================================

router.get(
  "/api/classes/:classId/absences",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const absences = await storage.getClassAbsences(req.cls!.id);
    res.json(absences);
  })
);

router.get(
  "/api/classes/:classId/students/:studentId/absences",
  requireStudentAccess(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const record = await storage.getStudentAbsences(studentId, req.cls!.id);
    res.json(record ?? null);
  })
);

// Manual override, for a correction between imports.
router.put(
  "/api/classes/:classId/students/:studentId/absences",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const parsed = setAbsencesSchema.safeParse({ ...req.body, studentId });
    if (!parsed.success) {
      throw new BadRequestError("absences must be a non-negative number");
    }

    const enrollment = await storage.getStudentContract(studentId, req.cls!.id);
    if (!enrollment) {
      throw new ForbiddenError("That student is not enrolled in this class");
    }

    const record = await storage.setStudentAbsences(
      studentId,
      req.cls!.id,
      parsed.data.absences,
      "manual"
    );
    res.json(record);
  })
);

export default router;
