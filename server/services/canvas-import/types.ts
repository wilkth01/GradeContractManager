import { User, Assignment, AssignmentProgress } from "@shared/schema";
import { AssignmentStatus } from "@shared/constants";

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
  /** Score thresholds, on a 0-100 scale, for landing in each status. */
  statusThresholds: {
    /** At or above this counts as Successfully Completed. */
    complete: number;
    /** Above this (and below complete) counts as Work-in-Progress. */
    workInProgress: number;
  };
  /** First letter of a letter grade to an AssignmentStatus value. */
  letterGradeMap: Record<string, number>;
}

/**
 * Default grade conversion configuration
 */
export const DEFAULT_GRADE_CONFIG: GradeConversionConfig = {
  statusThresholds: {
    complete: 70,       // 70+ = Successfully Completed
    workInProgress: 0,  // any score above 0 = Work-in-Progress
  },
  letterGradeMap: {
    A: AssignmentStatus.COMPLETE,
    B: AssignmentStatus.COMPLETE,
    C: AssignmentStatus.WORK_IN_PROGRESS,
    D: AssignmentStatus.WORK_IN_PROGRESS,
    F: AssignmentStatus.MISSING,
  },
};

/**
 * How the values in a Canvas column should be read.
 *
 * 'numeric_scale' is the pass-through for columns already on the portal 0-4
 * scale, such as Perusall reading scores. The others rescale, so importing a
 * 0-4 column as 'points' would divide it by 100.
 */
export type GradingType =
  | 'points'
  | 'percentage'
  | 'letter'
  | 'status'
  | 'numerical_status'
  | 'numeric_scale';

/**
 * Mapping between Canvas column and portal assignment
 */
export interface AssignmentMapping {
  canvasColumn: string;
  portalAssignment: Assignment | null;
  gradingType: GradingType;
  mappingTarget?: 'assignment';
}

/**
 * A single absence change to be applied.
 *
 * Retained as an empty shape for the preview payload. Importing a bare absence
 * count no longer works now that attendance is recorded per class session --
 * there is no session for a count to attach to, and the old path deleted the
 * student real attendance history to fake one. Roll call is taken in the app.
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
  /** Set when the source value could not be represented exactly. */
  warning?: string;
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
