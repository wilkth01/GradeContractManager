import { Router } from "express";
import { storage } from "../storage";
import { encryptSecret, decryptSecret } from "../crypto";
import { CanvasClient, CanvasError } from "../services/canvas/client";
import { buildPull } from "../services/canvas/grade-pull";
import { auditService } from "../audit";
import {
  canvasTokenSchema,
  linkCanvasCourseSchema,
  importRosterSchema,
  mapCanvasAssignmentsSchema,
} from "@shared/schema";
import { requireInstructor, requireClassOwner } from "../middleware";
import { asyncHandler, BadRequestError, NotFoundError } from "../errors";

const router = Router();

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://widener.instructure.com";

/**
 * Build a Canvas client for the signed-in instructor, or explain what is
 * missing. The token is only ever decrypted here, never returned to a client.
 */
export async function canvasClientFor(userId: number): Promise<CanvasClient> {
  const user = await storage.getUser(userId);
  const token = decryptSecret(user?.canvasTokenEncrypted);

  if (!token) {
    throw new BadRequestError(
      "No Canvas access token saved. Add one in Canvas settings before using Canvas features."
    );
  }
  return new CanvasClient(token, CANVAS_BASE_URL);
}

// Whether a token is saved, and who Canvas says it belongs to.
router.get(
  "/api/canvas/connection",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const user = await storage.getUser(req.user!.id);
    const token = decryptSecret(user?.canvasTokenEncrypted);

    if (!token) {
      return res.json({ connected: false, baseUrl: CANVAS_BASE_URL });
    }

    try {
      const canvasUser = await new CanvasClient(token, CANVAS_BASE_URL).verify();
      res.json({
        connected: true,
        baseUrl: CANVAS_BASE_URL,
        canvasUser: { id: canvasUser.id, name: canvasUser.name },
      });
    } catch (error) {
      // A saved but rejected token is worth reporting distinctly from no token.
      res.json({
        connected: false,
        baseUrl: CANVAS_BASE_URL,
        error: error instanceof CanvasError ? error.message : "Could not reach Canvas",
      });
    }
  })
);

// Save a token, after checking Canvas accepts it.
router.put(
  "/api/canvas/token",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const parsed = canvasTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("A Canvas access token is required");
    }

    let canvasUser;
    try {
      canvasUser = await new CanvasClient(parsed.data.token, CANVAS_BASE_URL).verify();
    } catch (error) {
      throw new BadRequestError(
        error instanceof CanvasError ? error.message : "Could not reach Canvas"
      );
    }

    await storage.setCanvasToken(req.user!.id, encryptSecret(parsed.data.token));
    await storage.setCanvasUserId(req.user!.id, canvasUser.id);

    res.json({ connected: true, canvasUser: { id: canvasUser.id, name: canvasUser.name } });
  })
);

router.delete(
  "/api/canvas/token",
  requireInstructor,
  asyncHandler(async (req, res) => {
    await storage.setCanvasToken(req.user!.id, null);
    res.json({ connected: false });
  })
);

// Canvas courses this instructor teaches, for linking.
router.get(
  "/api/canvas/courses",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const client = await canvasClientFor(req.user!.id);
    const courses = await client.teacherCourses();
    res.json(courses.map((c) => ({ id: c.id, name: c.name, courseCode: c.course_code })));
  })
);

router.put(
  "/api/classes/:classId/canvas/link",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = linkCanvasCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("A Canvas course id is required");
    }

    const updated = await storage.linkCanvasCourse(
      req.cls!.id,
      parsed.data.canvasCourseId,
      parsed.data.canvasAbsenceAssignmentId
    );
    res.json(updated);
  })
);

/**
 * Match this class's students to Canvas accounts and store the Canvas id.
 *
 * Matching is exact: SIS id first, then login. Names are deliberately not used
 * here -- a wrong match would send one student's grades to another.
 */
router.post(
  "/api/classes/:classId/canvas/sync-roster",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const cls = req.cls!;
    if (!cls.canvasCourseId) {
      throw new BadRequestError("Link this class to a Canvas course first");
    }

    const client = await canvasClientFor(req.user!.id);
    const [canvasStudents, enrolled] = await Promise.all([
      client.courseStudents(cls.canvasCourseId),
      storage.getEnrolledStudents(cls.id),
    ]);

    const bySis = new Map<string, number>();
    const byLogin = new Map<string, number>();
    for (const canvasStudent of canvasStudents) {
      if (canvasStudent.sis_user_id) bySis.set(String(canvasStudent.sis_user_id), canvasStudent.id);
      if (canvasStudent.login_id) byLogin.set(canvasStudent.login_id.toLowerCase(), canvasStudent.id);
    }

    const matched: { studentId: number; fullName: string; canvasUserId: number }[] = [];
    const unmatched: { studentId: number; fullName: string }[] = [];

    for (const student of enrolled) {
      const username = student.username.toLowerCase();
      const canvasUserId = byLogin.get(username) ?? bySis.get(student.username) ?? null;

      if (canvasUserId) {
        await storage.setCanvasUserId(student.id, canvasUserId);
        matched.push({ studentId: student.id, fullName: student.fullName, canvasUserId });
      } else {
        unmatched.push({ studentId: student.id, fullName: student.fullName });
      }
    }

    res.json({ matched, unmatched, canvasStudentCount: canvasStudents.length });
  })
);

/**
 * Populate this class's roster from the linked Canvas course.
 *
 * Students already in the app are linked and enrolled; the rest get an account
 * created from their Canvas details. Created accounts have no password and are
 * marked temporary -- they cannot be logged into until the student redeems an
 * invitation, which is issued separately.
 *
 * Matching is on Canvas id first, then username. Names are never used: a wrong
 * match here would enroll one student under another's record.
 */
router.post(
  "/api/classes/:classId/canvas/import-roster",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const cls = req.cls!;
    if (!cls.canvasCourseId) {
      throw new BadRequestError("Link this class to a Canvas course first");
    }

    const parsed = importRosterSchema.safeParse(req.body ?? {});
    const createMissing = parsed.success ? parsed.data.createMissing : true;

    const client = await canvasClientFor(req.user!.id);
    const canvasStudents = await client.courseStudents(cls.canvasCourseId);

    const linked: { fullName: string; username: string }[] = [];
    const created: { fullName: string; username: string }[] = [];
    const skipped: { fullName: string; reason: string }[] = [];

    for (const canvasStudent of canvasStudents) {
      const login = canvasStudent.login_id?.trim();

      let user = await storage.getUserByCanvasId(canvasStudent.id);
      if (!user && login) {
        user = await storage.getUserByUsername(login);
      }

      if (user) {
        if (user.role !== "student") {
          skipped.push({
            fullName: canvasStudent.sortable_name,
            reason: "An account with that username is not a student",
          });
          continue;
        }
        if (!user.canvasUserId) {
          await storage.setCanvasUserId(user.id, canvasStudent.id);
        }
        await storage.enrollStudent(cls.id, user.id);
        linked.push({ fullName: user.fullName, username: user.username });
        continue;
      }

      if (!createMissing) {
        skipped.push({ fullName: canvasStudent.sortable_name, reason: "No account yet" });
        continue;
      }

      if (!login) {
        // Without a login there is no stable username to create them under.
        skipped.push({
          fullName: canvasStudent.sortable_name,
          reason: "Canvas has no login id for this student",
        });
        continue;
      }

      const newUser = await storage.createCanvasStudent({
        username: login,
        fullName: canvasStudent.sortable_name || canvasStudent.name,
        email: canvasStudent.email ?? null,
        canvasUserId: canvasStudent.id,
      });
      await storage.enrollStudent(cls.id, newUser.id);
      created.push({ fullName: newUser.fullName, username: newUser.username });
    }

    res.json({ linked, created, skipped, canvasStudentCount: canvasStudents.length });
  })
);

/**
 * Canvas assignments in the linked course, alongside this class's assignments
 * and whatever mapping already exists.
 *
 * Every Canvas assignment is offered regardless of its group. Mapping by group
 * would miss readings filed elsewhere, which is exactly the problem the
 * instructor's own tracker had to work around.
 */
router.get(
  "/api/classes/:classId/canvas/assignments",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const cls = req.cls!;
    if (!cls.canvasCourseId) {
      throw new BadRequestError("Link this class to a Canvas course first");
    }

    const client = await canvasClientFor(req.user!.id);
    const [canvasAssignments, groups, portalAssignments] = await Promise.all([
      client.courseAssignments(cls.canvasCourseId),
      client.assignmentGroups(cls.canvasCourseId),
      storage.getAssignmentsByClass(cls.id),
    ]);

    const groupName = new Map(groups.map((g) => [g.id, g.name]));

    res.json({
      canvasAssignments: canvasAssignments.map((a) => ({
        id: a.id,
        name: a.name,
        pointsPossible: a.points_possible,
        group: groupName.get(a.assignment_group_id) ?? "Ungrouped",
      })),
      portalAssignments: portalAssignments.map((a) => ({
        id: a.id,
        name: a.name,
        moduleGroup: a.moduleGroup,
        scoringType: a.scoringType,
        canvasAssignmentId: a.canvasAssignmentId,
      })),
      absenceCanvasAssignmentId: cls.canvasAbsenceAssignmentId,
    });
  })
);

router.put(
  "/api/classes/:classId/canvas/assignment-map",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = mapCanvasAssignmentsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid assignment mapping");
    }

    // Only this class's assignments may be remapped.
    const owned = new Set((await storage.getAssignmentsByClass(req.cls!.id)).map((a) => a.id));
    for (const mapping of parsed.data.mappings) {
      if (!owned.has(mapping.assignmentId)) {
        throw new BadRequestError("That assignment does not belong to this class");
      }
    }

    await storage.setCanvasAssignmentIds(req.cls!.id, parsed.data.mappings);
    res.json({ mapped: parsed.data.mappings.filter((m) => m.canvasAssignmentId).length });
  })
);

/**
 * Fetch grades from Canvas and report what an import would change.
 *
 * Nothing is written. The instructor sees the changes before any of them lands,
 * which is the same guarantee the CSV path gives.
 */
async function pullFromCanvas(req: any) {
  const cls = req.cls!;
  if (!cls.canvasCourseId) {
    throw new BadRequestError("Link this class to a Canvas course first");
  }

  const client = await canvasClientFor(req.user!.id);
  const [portalAssignments, students, canvasAssignments, absences] = await Promise.all([
    storage.getAssignmentsByClass(cls.id),
    storage.getEnrolledStudents(cls.id),
    client.courseAssignments(cls.canvasCourseId),
    storage.getClassAbsences(cls.id),
  ]);

  const mapped = portalAssignments.filter((a) => a.canvasAssignmentId != null);
  const wantedCanvasIds = mapped.map((a) => a.canvasAssignmentId!);
  if (cls.canvasAbsenceAssignmentId) {
    wantedCanvasIds.push(cls.canvasAbsenceAssignmentId);
  }

  if (wantedCanvasIds.length === 0) {
    throw new BadRequestError(
      "Map at least one assignment to Canvas before pulling grades"
    );
  }

  const [submissions, existingProgress] = await Promise.all([
    client.submissions(cls.canvasCourseId, wantedCanvasIds),
    storage.getStudentProgressForClass(cls.id),
  ]);

  return buildPull({
    students,
    assignments: portalAssignments,
    submissions,
    existingProgress: existingProgress.map((p) => ({
      studentId: p.studentId,
      assignmentId: p.assignmentId,
      status: p.status,
      numericGrade: p.numericGrade,
    })),
    canvasPointsById: new Map(canvasAssignments.map((a) => [a.id, a.points_possible])),
    absenceCanvasAssignmentId: cls.canvasAbsenceAssignmentId,
    currentAbsences: new Map(
      absences.map((a) => [a.studentId, Number(a.absences)])
    ),
  });
}

router.post(
  "/api/classes/:classId/canvas/pull-preview",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    res.json(await pullFromCanvas(req));
  })
);

/**
 * Apply what a pull found.
 *
 * The pull is repeated server-side rather than trusting changes posted back
 * from the browser, so a crafted request cannot write arbitrary grades. The
 * client sends only which changes to keep.
 */
router.post(
  "/api/classes/:classId/canvas/pull-commit",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const cls = req.cls!;
    const skipAssignments: number[] = Array.isArray(req.body?.skipAssignmentIds)
      ? req.body.skipAssignmentIds
      : [];
    const includeAbsences = req.body?.includeAbsences !== false;

    const pull = await pullFromCanvas(req);
    const skip = new Set(skipAssignments);
    const applying = pull.gradeChanges.filter((c) => !skip.has(c.assignmentId));

    let appliedGrades = 0;
    for (const change of applying) {
      const existing = (await storage.getStudentProgress(change.studentId, cls.id)).find(
        (p) => p.assignmentId === change.assignmentId
      );

      const progress = await storage.updateProgress({
        studentId: change.studentId,
        assignmentId: change.assignmentId,
        status: change.convertedStatus,
        numericGrade: change.convertedNumeric != null ? String(change.convertedNumeric) : null,
        lastUpdated: new Date(),
        attempts: existing?.attempts ?? 0,
      });

      // The CSV importer bypassed the audit trail entirely; this does not.
      await auditService.logWithRequest(req, {
        action: existing ? "UPDATE" : "CREATE",
        entityType: "assignment_progress",
        entityId: progress.id,
        oldValues: existing
          ? {
              studentId: existing.studentId,
              assignmentId: existing.assignmentId,
              status: existing.status,
              numericGrade: existing.numericGrade,
              classId: cls.id,
              source: "canvas",
            }
          : null,
        newValues: {
          studentId: progress.studentId,
          assignmentId: progress.assignmentId,
          status: progress.status,
          numericGrade: progress.numericGrade,
          classId: cls.id,
          source: "canvas",
        },
      });
      appliedGrades++;
    }

    let appliedAbsences = 0;
    if (includeAbsences) {
      for (const change of pull.absenceChanges) {
        await storage.setStudentAbsences(
          change.studentId,
          cls.id,
          change.newAbsences,
          "canvas"
        );
        appliedAbsences++;
      }
    }

    res.json({ appliedGrades, appliedAbsences, summary: pull.summary });
  })
);

export default router;
