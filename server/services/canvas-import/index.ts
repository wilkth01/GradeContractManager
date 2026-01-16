import { storage } from "../../storage";
import { StudentMatcher } from "./student-matcher";
import { GradeConverter } from "./grade-converter";
import {
  NormalizedGradeData,
  AssignmentMapping,
  ImportPreview,
  ImportResult,
  GradeChange,
  ImportSummary,
  StudentMatchResult,
  NormalizedStudent,
  DEFAULT_GRADE_CONFIG,
} from "./types";

/**
 * Main service for Canvas gradebook import
 * Orchestrates student matching, grade conversion, and data import
 */
export class CanvasImportService {
  private gradeConverter: GradeConverter;

  constructor() {
    this.gradeConverter = new GradeConverter(DEFAULT_GRADE_CONFIG);
  }

  /**
   * Generate a preview of what the import will do without committing changes
   */
  async generatePreview(
    classId: number,
    normalizedData: NormalizedGradeData,
    mappings: AssignmentMapping[]
  ): Promise<ImportPreview> {
    // Fetch enrolled students and assignments
    const [enrolledStudents, portalAssignments] = await Promise.all([
      storage.getEnrolledStudents(classId),
      storage.getAssignmentsByClass(classId)
    ]);

    // Get all current progress for comparison
    const allProgress = await this.getAllStudentProgress(classId, enrolledStudents);

    // Match students
    const matcher = new StudentMatcher(enrolledStudents);
    const matchResults = matcher.matchAll(normalizedData.students);

    // Separate matched and unmatched
    const matchedStudents = matchResults.filter(r => r.matchedStudent !== null);
    const unmatchedStudents = matchResults
      .filter(r => r.matchedStudent === null)
      .map(r => r.csvStudent);

    // Generate grade changes
    const gradeChanges: GradeChange[] = [];
    const activeMappings = mappings.filter(m => m.portalAssignment !== null);

    for (const grade of normalizedData.grades) {
      // Find the student match
      const studentMatch = matchResults.find(
        m => m.csvStudent.sourceId === grade.studentSourceId
      );
      if (!studentMatch?.matchedStudent) continue;

      // Find the assignment mapping
      const mapping = activeMappings.find(
        m => m.canvasColumn === grade.assignmentSourceId
      );
      if (!mapping?.portalAssignment) continue;

      // Find the portal assignment
      const portalAssignment = portalAssignments.find(
        a => a.id === mapping.portalAssignment!.id
      );
      if (!portalAssignment) continue;

      // Skip empty grades
      if (!grade.rawValue || grade.rawValue.trim() === '') continue;

      // Get current progress
      const currentProgress = allProgress.find(
        p => p.studentId === studentMatch.matchedStudent!.id &&
          p.assignmentId === portalAssignment.id
      );

      // Convert grade based on assignment scoring type
      let convertedStatus: number | null = null;
      let convertedNumeric: number | null = null;

      if (portalAssignment.scoringType === 'status') {
        convertedStatus = this.gradeConverter.toStatus(grade.rawValue, mapping.gradingType);
      } else {
        convertedNumeric = this.gradeConverter.toNumeric(grade.rawValue, mapping.gradingType);
      }

      // Determine current value string for display
      let currentValue: string | null = null;
      if (currentProgress) {
        if (portalAssignment.scoringType === 'status' && currentProgress.status !== null) {
          currentValue = GradeConverter.getStatusLabel(currentProgress.status);
        } else if (currentProgress.numericGrade !== null) {
          currentValue = currentProgress.numericGrade.toString();
        }
      }

      gradeChanges.push({
        studentId: studentMatch.matchedStudent!.id,
        studentName: studentMatch.matchedStudent!.fullName,
        assignmentId: portalAssignment.id,
        assignmentName: portalAssignment.name,
        currentValue,
        newValue: grade.rawValue,
        convertedStatus,
        convertedNumeric
      });
    }

    // Calculate summary
    const summary: ImportSummary = {
      totalStudents: normalizedData.students.length,
      matchedStudents: matchedStudents.length,
      unmatchedStudents: unmatchedStudents.length,
      totalGradeUpdates: gradeChanges.length,
      assignmentsMapped: activeMappings.length
    };

    return {
      matchedStudents,
      unmatchedStudents,
      gradeChanges,
      summary
    };
  }

  /**
   * Execute the import using approved grade changes
   */
  async executeImport(gradeChanges: GradeChange[]): Promise<ImportResult> {
    const processedStudents = new Set<number>();
    const errors: { student: string; assignment: string; error: string }[] = [];
    let processedGrades = 0;

    for (const change of gradeChanges) {
      try {
        // Prepare update data
        const updateData: any = {
          studentId: change.studentId,
          assignmentId: change.assignmentId,
          lastUpdated: new Date()
        };

        if (change.convertedStatus !== null) {
          updateData.status = change.convertedStatus;
        }
        if (change.convertedNumeric !== null) {
          updateData.numericGrade = change.convertedNumeric.toString();
        }

        // Update progress
        await storage.updateProgress(updateData);

        processedStudents.add(change.studentId);
        processedGrades++;
      } catch (error) {
        errors.push({
          student: change.studentName,
          assignment: change.assignmentName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      success: errors.length === 0,
      processedStudents: processedStudents.size,
      processedGrades,
      skippedStudents: [],
      errors
    };
  }

  /**
   * Get all student progress for a class (batched for performance)
   */
  private async getAllStudentProgress(classId: number, students: { id: number }[]) {
    const allProgress: any[] = [];

    for (const student of students) {
      const progress = await storage.getStudentProgress(student.id, classId);
      allProgress.push(...progress);
    }

    return allProgress;
  }
}

// Export types for use in routes
export * from "./types";
export { StudentMatcher } from "./student-matcher";
export { GradeConverter } from "./grade-converter";
