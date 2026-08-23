import { Router } from "express";
import { storage } from "../storage";
import { auditService } from "../audit";
import { sendMessagesSchema } from "@shared/schema";
import { evaluateStanding } from "@shared/contract-evaluation";
import { composeContractMessage, type ComposedMessage } from "@shared/contract-messages";
import { meetsParticipationBar } from "@shared/constants";
import { requireClassOwner } from "../middleware";
import { asyncHandler, BadRequestError } from "../errors";
import { CanvasError } from "../services/canvas/client";
import { canvasClientFor } from "./canvas";
import type { Class } from "@shared/schema";

const router = Router();

/**
 * Build every student's message for a class.
 *
 * Deliberately shares evaluateStanding with the student's own page: a message
 * that disagreed with what the student sees when they log in would be worse
 * than no message at all.
 */
async function composeForClass(
  cls: Class,
  studentIds: number[] | null,
  intro?: string,
  signature?: string
): Promise<ComposedMessage[]> {
  const [students, assignments, contracts, studentContracts, allProgress, participation, absences] =
    await Promise.all([
      storage.getEnrolledStudents(cls.id),
      storage.getAssignmentsByClass(cls.id),
      storage.getContractsByClass(cls.id),
      storage.getStudentContractsByClass(cls.id),
      storage.getStudentProgressForClass(cls.id),
      storage.getClassParticipation(cls.id),
      storage.getClassAbsences(cls.id),
    ]);

  const wanted = studentIds ? new Set(studentIds) : null;

  return students
    .filter((student) => !wanted || wanted.has(student.id))
    .map((student) => {
      const studentAbsences = Number(
        absences.find((a) => a.studentId === student.id)?.absences ?? 0
      );

      const standing = evaluateStanding({
        contracts,
        chosenContractId:
          studentContracts.find((sc) => sc.studentId === student.id)?.contractId ?? null,
        assignments,
        progress: allProgress.filter((p) => p.studentId === student.id),
        participationSessions: participation.filter(
          (r) => r.studentId === student.id && meetsParticipationBar(r.participation, cls.participationBar)
        ).length,
        absences: studentAbsences,
        policy: {
          absencePenaltyThreshold: cls.absencePenaltyThreshold,
          absenceFailureThreshold: cls.absenceFailureThreshold,
        },
      });

      return composeContractMessage(
        { studentId: student.id, fullName: student.fullName },
        standing,
        { className: cls.name, intro, signature, absences: studentAbsences }
      );
    });
}

// Preview every message without sending anything.
router.post(
  "/api/classes/:classId/messages/preview",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const { intro, signature } = req.body ?? {};
    const messages = await composeForClass(req.cls!, null, intro, signature);

    // Say up front who cannot be reached, so it is visible before sending.
    const students = await storage.getEnrolledStudents(req.cls!.id);
    const unlinked = students
      .filter((s) => !s.canvasUserId)
      .map((s) => ({ studentId: s.id, fullName: s.fullName }));

    res.json({ messages, unlinked });
  })
);

/**
 * Send the messages, to an explicit list of students.
 *
 * Requiring studentIds rather than defaulting to "everyone" is deliberate: this
 * writes to real students' inboxes and cannot be undone, so the caller has to
 * have named who it means.
 */
router.post(
  "/api/classes/:classId/messages/send",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const parsed = sendMessagesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Select at least one student to message");
    }

    const cls = req.cls!;
    const students = await storage.getEnrolledStudents(cls.id);
    const byId = new Map(students.map((s) => [s.id, s]));

    for (const studentId of parsed.data.studentIds) {
      if (!byId.has(studentId)) {
        throw new BadRequestError("That student is not enrolled in this class");
      }
    }

    const client = await canvasClientFor(req.user!.id);
    const messages = await composeForClass(
      cls,
      parsed.data.studentIds,
      parsed.data.intro,
      parsed.data.signature
    );

    const sent: string[] = [];
    const failed: { studentName: string; error: string }[] = [];

    for (const message of messages) {
      const student = byId.get(message.studentId)!;

      if (!student.canvasUserId) {
        failed.push({
          studentName: student.fullName,
          error: "No Canvas account linked. Sync the roster first.",
        });
        continue;
      }

      try {
        await client.sendMessage(student.canvasUserId, message.subject, message.body);
        sent.push(student.fullName);
        // Canvas rate-limits bursts; the original script paced these too.
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        failed.push({
          studentName: student.fullName,
          error: error instanceof CanvasError ? error.message : "Send failed",
        });
      }
    }

    await auditService.logWithRequest(req, {
      action: "CREATE",
      entityType: "class",
      entityId: cls.id,
      newValues: {
        classId: cls.id,
        action: "contract_messages_sent",
        sent: sent.length,
        failed: failed.length,
      },
    });

    res.json({ sent, failed });
  })
);

/**
 * Send account setup links to students who cannot log in yet.
 *
 * A roster imported from Canvas creates accounts with no password. This issues
 * each one an invitation bound to their existing account and delivers the link
 * over Canvas Inbox, so the student never has to be found by email.
 */
router.post(
  "/api/classes/:classId/invitations/send-setup-links",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const cls = req.cls!;
    const students = await storage.getEnrolledStudents(cls.id);

    // Only students who genuinely cannot log in yet.
    const needSetup = students.filter((s) => !s.password);
    if (needSetup.length === 0) {
      return res.json({ sent: [], failed: [], skipped: [] });
    }

    const client = await canvasClientFor(req.user!.id);
    const origin = `${req.protocol}://${req.get("host")}`;

    const sent: string[] = [];
    const failed: { studentName: string; error: string }[] = [];
    const skipped: { studentName: string; reason: string }[] = [];

    for (const student of needSetup) {
      if (!student.canvasUserId) {
        skipped.push({
          studentName: student.fullName,
          reason: "No Canvas account linked",
        });
        continue;
      }

      try {
        const invitation = await storage.createStudentInvitation({
          userId: student.id,
          email: student.email ?? `${student.username}@unknown.invalid`,
          fullName: student.fullName,
          classId: cls.id,
        });

        const url = `${origin}/setup-account?token=${invitation.token}`;
        const firstName = student.fullName.split(",")[0].trim();
        const body = [
          `Hi ${firstName},`,
          `You have been added to ${cls.name} on the Contract Grading Portal, where you can `
            + `choose your grade contract and track your progress.`,
          `Set your password here:\n${url}`,
          `Your username is ${student.username}. The link expires in 7 days \u2014 let me know `
            + `if you need a new one.`,
        ].join("\n\n");

        await client.sendMessage(
          student.canvasUserId,
          `${cls.name} — Set up your Contract Grading Portal account`,
          body
        );
        sent.push(student.fullName);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        failed.push({
          studentName: student.fullName,
          error: error instanceof CanvasError ? error.message : "Send failed",
        });
      }
    }

    res.json({ sent, failed, skipped });
  })
);

export default router;
