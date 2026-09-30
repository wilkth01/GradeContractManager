import { Router } from "express";
import { storage } from "../storage";
import { requireInstructor } from "../middleware";
import { asyncHandler } from "../errors";
import { meetsParticipationBar } from "@shared/constants";
import { evaluateStanding, withGradingStarted } from "@shared/contract-evaluation";
import {
  assessRisk,
  composeRiskEmail,
  ABSENCE_HIGHLIGHT_THRESHOLD,
  type AtRiskStudent,
} from "@shared/contract-risk";
import type { Class } from "@shared/schema";

const router = Router();

async function atRiskForClass(cls: Class) {
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

  const gradedAssignments = withGradingStarted(assignments, allProgress);
  const red: AtRiskStudent[] = [];
  const yellow: AtRiskStudent[] = [];

  for (const student of students) {
    const studentAbsences = Number(absences.find((a) => a.studentId === student.id)?.absences ?? 0);

    const standing = evaluateStanding({
      contracts,
      chosenContractId:
        studentContracts.find((sc) => sc.studentId === student.id)?.contractId ?? null,
      assignments: gradedAssignments,
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

    const risk = assessRisk(standing, studentAbsences);
    if (!risk.level || !risk.contractGrade) continue;

    const email = composeRiskEmail({
      fullName: student.fullName,
      className: cls.name,
      absences: studentAbsences,
      risk,
      standing,
    });

    const entry: AtRiskStudent = {
      studentId: student.id,
      fullName: student.fullName,
      email: student.email ?? null,
      contractGrade: risk.contractGrade,
      absences: studentAbsences,
      manyAbsences: risk.manyAbsences,
      overAbsenceLimit: risk.overAbsenceLimit,
      currentlyMeets: risk.currentlyMeets,
      reasons: risk.reasons,
      steps: risk.steps,
      emailSubject: email.subject,
      emailBody: email.body,
    };
    (risk.level === "red" ? red : yellow).push(entry);
  }

  // Most to fix first, then alphabetical, so the worst cases lead each group.
  const byWorst = (a: AtRiskStudent, b: AtRiskStudent) =>
    b.reasons.length - a.reasons.length || a.fullName.localeCompare(b.fullName);
  red.sort(byWorst);
  yellow.sort(byWorst);

  return { red, yellow };
}

// Students falling out of compliance, across every active class the instructor
// teaches. Archived classes are finished business and would only add noise.
router.get(
  "/api/instructor/at-risk",
  requireInstructor,
  asyncHandler(async (req, res) => {
    const classes = (await storage.getClassesByInstructor(req.user!.id)).filter(
      (cls) => !cls.isArchived
    );

    const results = await Promise.all(
      classes.map(async (cls) => ({
        classId: cls.id,
        className: cls.name,
        ...(await atRiskForClass(cls)),
      }))
    );

    res.json({ absenceHighlightThreshold: ABSENCE_HIGHLIGHT_THRESHOLD, classes: results });
  })
);

export default router;
