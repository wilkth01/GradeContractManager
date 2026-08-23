import { Router } from "express";
import { storage } from "../storage";
import { toPublicUser } from "../auth";
import { requireClassOwner } from "../middleware";
import { asyncHandler } from "../errors";
import { AssignmentStatus, isAssignmentDone, meetsParticipationBar } from "@shared/constants";
import { evaluateStanding } from "@shared/contract-evaluation";

const router = Router();

// Class-wide analytics, measured against each student's own contract.
router.get(
  "/api/classes/:classId/analytics",
  requireClassOwner(),
  asyncHandler(async (req, res) => {
    const classId = req.cls!.id;

    const [students, assignments, contracts, studentContracts, allProgressFlat] =
      await Promise.all([
        storage.getEnrolledStudents(classId),
        storage.getAssignmentsByClass(classId),
        storage.getContractsByClass(classId),
        storage.getStudentContractsByClass(classId),
        storage.getStudentProgressForClass(classId),
      ]);

    const progressByStudent = new Map<number, typeof allProgressFlat>();
    for (const progress of allProgressFlat) {
      const studentProgress = progressByStudent.get(progress.studentId) || [];
      studentProgress.push(progress);
      progressByStudent.set(progress.studentId, studentProgress);
    }

    const assignmentStats = assignments.map((assignment) => {
      const statusBreakdown = { missing: 0, workInProgress: 0, complete: 0 };
      let totalProgress = 0;

      students.forEach((student) => {
        const studentProgress = progressByStudent.get(student.id) || [];
        const assignmentProgress = studentProgress.find(
          (p) => p.assignmentId === assignment.id
        );
        const status = assignmentProgress?.status ?? AssignmentStatus.MISSING;

        if (status === AssignmentStatus.COMPLETE) {
          statusBreakdown.complete++;
        } else if (status === AssignmentStatus.WORK_IN_PROGRESS) {
          statusBreakdown.workInProgress++;
        } else {
          statusBreakdown.missing++;
        }

        if (assignmentProgress && isAssignmentDone(status)) {
          totalProgress++;
        }
      });

      const completionRate =
        students.length > 0 ? Math.round((totalProgress / students.length) * 100) : 0;

      return { assignment, completionRate, statusBreakdown };
    });

    const [participation, absences] = await Promise.all([
      storage.getClassParticipation(classId),
      storage.getClassAbsences(classId),
    ]);

    const evaluationContracts = contracts.map((c) => ({
      id: c.id,
      grade: c.grade,
      version: c.version,
      assignments: c.assignments,
      categoryRequirements: c.categoryRequirements,
      requiredParticipationSessions: c.requiredParticipationSessions,
      maxAbsences: c.maxAbsences,
    }));

    const studentPerformance = students.map((student) => {
      const studentProgress = progressByStudent.get(student.id) || [];
      const enrollment = studentContracts.find((sc) => sc.studentId === student.id);

      const standing = evaluateStanding({
        contracts: evaluationContracts,
        chosenContractId: enrollment?.contractId ?? null,
        assignments,
        progress: studentProgress,
        participationSessions: participation.filter(
          (r) =>
            r.studentId === student.id &&
            meetsParticipationBar(r.participation, req.cls!.participationBar)
        ).length,
        absences: Number(absences.find((a) => a.studentId === student.id)?.absences ?? 0),
        policy: {
          absencePenaltyThreshold: req.cls!.absencePenaltyThreshold,
          absenceFailureThreshold: req.cls!.absenceFailureThreshold,
        },
      });

      return {
        student: toPublicUser(student),
        contract: enrollment || null,
        // What the contract actually says, rather than a share of all work.
        contractGrade: standing.chosen?.grade ?? null,
        meetingContract: standing.chosen?.met ?? false,
        highestMet: standing.highestMet,
        effectiveGrade: standing.effectiveGrade,
        penalty: standing.penalty,
        outstanding: standing.chosen?.actionable ?? [],
        completedAssignments: studentProgress.filter((p) => isAssignmentDone(p.status)).length,
        totalAssignments: assignments.length,
      };
    });

    const withContract = studentPerformance.filter((sp) => sp.contractGrade !== null);

    const contractDistribution = contracts.map((contract) => {
      const contractStudents = studentContracts.filter(
        (sc) => sc.contractId === contract.id
      );
      const confirmed = contractStudents.filter((sc) => sc.isConfirmed).length;
      const count = contractStudents.length;

      return {
        gradeLevel: contract.grade,
        count,
        percentage: students.length > 0 ? Math.round((count / students.length) * 100) : 0,
        confirmed,
        pending: count - confirmed,
      };
    });

    res.json({
      classInfo: req.cls,
      totalStudents: students.length,
      studentsWithContract: withContract.length,
      // "At risk" now means not on track for the contract this student chose,
      // rather than a share of all class work. Under contract grading a student
      // meeting every C requirement is not at risk, and used to read as such.
      atRiskStudents: withContract.filter((sp) => !sp.meetingContract).length,
      meetingContract: withContract.filter((sp) => sp.meetingContract).length,
      noContractSelected: studentPerformance.length - withContract.length,
      underAbsencePenalty: studentPerformance.filter((sp) => sp.penalty !== "none").length,
      assignmentStats,
      studentPerformance,
      contractDistribution,
    });
  })
);

export default router;
