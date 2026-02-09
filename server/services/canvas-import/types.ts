import { User, Assignment, AssignmentProgress } from "@shared/schema";

/**
 * Normalized student data from any source (CSV or future API)
 */
export interface NormalizedStudent {
  sourceId: string;        // Unique identifier within the source (row index for CSV)
  displayName: string;     // "Student" column value
  email?: string;          // SIS Login ID or email
  sisId?: string;          // SIS User ID
  username?: string;       // Derived username
}

/**
 * Normalized grade entry from any source
 */
export interface NormalizedGrade {
  studentSourceId: string;
  assignmentSourceId: string;
  rawValue: string;        // Original value from source
  sourceType: 'csv' | 'api';
}

/**
 * Complete normalized data from import source
 */
export interface NormalizedGradeData {
  students: NormalizedStudent[];
  assignments: string[];   // Assignment column names
  grades: NormalizedGrade[];
}

/**
 * Match type indicating how a student was matched
 */
export type StudentMatchType =
  | 'exact_username'
  | 'exact_email'
  | 'exact_name'
  | 'fuzzy_name'
  | 'not_found';

/**
 * Result of attempting to match a CSV student to an enrolled student
 */
export interface StudentMatchResult {
  csvStudent: NormalizedStudent;
  matchedStudent: User | null;
  matchType: StudentMatchType;
  confidence: number;  // 0-100
}

/**
 * Configuration for grade conversion thresholds
 */
export interface GradeConversionConfig {
  statusThresholds: {
    notStarted: number;     // Below this = 0 (Not Submitted)
    inProgress: number;     // At or above = 1 (Not Submitted)
    completed: number;      // At or above = 2 (Work-in-Progress)
    excellent: number;      // At or above = 3 (Successfully Completed)
  };
  letterGradeMap: Record<string, number>;
}

/**
 * Default grade conversion configuration
 */
export const DEFAULT_GRADE_CONFIG: GradeConversionConfig = {
  statusThresholds: {
    notStarted: 1,    // 0 = Not Submitted
    inProgress: 1,    // 1+ = Not Submitted (same as 0)
    completed: 1,     // 1-69 = Work-in-Progress
    excellent: 70     // 70+ = Successfully Completed
  },
  letterGradeMap: {
    'A': 3,
    'B': 3,
    'C': 2,
    'D': 2,
    'F': 0
  }
};

/**
 * Mapping between Canvas column and portal assignment
 */
export interface AssignmentMapping {
  canvasColumn: string;
  portalAssignment: Assignment | null;
  gradingType: 'points' | 'percentage' | 'letter' | 'status' | 'numerical_status';
  mappingTarget?: 'assignment' | 'absences';
}

/**
 * A single absence change to be applied
 */
export interface AbsenceChange {
  studentId: number;
  studentName: string;
  currentAbsences: number;
  newAbsences: number;
}

/**
 * A single grade change to be applied
 */
export interface GradeChange {
  studentId: number;
  studentName: string;
  assignmentId: number;
  assignmentName: string;
  currentValue: string | null;
  newValue: string;
  convertedStatus: number | null;
  convertedNumeric: number | null;
}

/**
 * Preview of what import will do (before committing)
 */
export interface ImportPreview {
  matchedStudents: StudentMatchResult[];
  unmatchedStudents: NormalizedStudent[];
  gradeChanges: GradeChange[];
  absenceChanges: AbsenceChange[];
  summary: ImportSummary;
}

/**
 * Summary statistics for import
 */
export interface ImportSummary {
  totalStudents: number;
  matchedStudents: number;
  unmatchedStudents: number;
  totalGradeUpdates: number;
  totalAbsenceUpdates: number;
  assignmentsMapped: number;
}

/**
 * Result after executing import
 */
export interface ImportResult {
  success: boolean;
  processedStudents: number;
  processedGrades: number;
  processedAbsences: number;
  skippedStudents: string[];
  errors: ImportError[];
}

/**
 * Error that occurred during import
 */
export interface ImportError {
  student: string;
  assignment: string;
  error: string;
}

/**
 * Request body for preview endpoint
 */
export interface PreviewRequest {
  normalizedData: NormalizedGradeData;
  mappings: AssignmentMapping[];
}

/**
 * Request body for import endpoint
 */
export interface ImportRequest {
  gradeChanges: GradeChange[];
  absenceChanges?: AbsenceChange[];
}
