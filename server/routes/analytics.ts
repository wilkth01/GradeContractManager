import { Router } from "express";
import { storage } from "../storage";
import { toPublicUser } from "../auth";
import { requireClassOwner } from "../middleware";
import { asyncHandler } from "../errors";
import { AssignmentStatus, isAssignmentDone } from "@shared/constants";

const router = Router();

// Class-wide analytics.
// TODO(phase 4): completion is measured against every assignment in the class
// and "at risk" is a flat 60% threshold, which is meaningless under contract
// grading -- a student meeting every C requirement currently reads as at risk.
// Rework this against the shared contract evaluator.
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

    const studentPerformance = students.map((student) => {
      const studentProgress = progressByStudent.get(student.id) || [];
      const studentContract = studentContracts.find((sc) => sc.studentId === student.id);

      const completedAssignments = studentProgress.filter((p) =>
        isAssignmentDone(p.status)
      ).length;
      const progressScore =
        assignments.length > 0
          ? Math.round((completedAssignments / assignments.length) * 100)
          : 0;

      return {
        student: toPublicUser(student),
        contract: studentContract || null,
        progressScore,
        completedAssignments,
        totalAssignments: assignments.length,
        lastActivity: studentProgress.length > 0 ? "Recent activity" : "No activity",
      };
    });

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

    const overallCompletionRate =
      studentPerformance.length > 0
        ? Math.round(
            studentPerformance.reduce((sum, sp) => sum + sp.progressScore, 0) /
              studentPerformance.length
          )
        : 0;

    res.json({
      classInfo: req.cls,
      totalStudents: students.length,
      overallCompletionRate,
      atRiskStudents: studentPerformance.filter((sp) => sp.progressScore < 60).length,
      highPerformers: studentPerformance.filter((sp) => sp.progressScore >= 90).length,
      assignmentStats,
      studentPerformance,
      contractDistribution,
    });
  })
);

export default router;
