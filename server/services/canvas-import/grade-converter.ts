import { GradeConversionConfig, DEFAULT_GRADE_CONFIG } from "./types";
import {
  AssignmentStatus,
  MAX_NUMERIC_GRADE,
  getAssignmentStatusLabel,
} from "@shared/constants";

/**
 * The 0-3 scale some Canvas columns use, mapped onto the three stored states.
 *
 * This is the same collapse applied to existing assignment_progress rows: the
 * old scheme had two values that both displayed as "Not Submitted".
 */
const CanvasNumericalStatus: Record<number, number> = {
  0: AssignmentStatus.MISSING,
  1: AssignmentStatus.MISSING,
  2: AssignmentStatus.WORK_IN_PROGRESS,
  3: AssignmentStatus.COMPLETE,
};

/**
 * Service for converting Canvas grades to portal format
 * Supports configurable thresholds and multiple grade formats
 */
export class GradeConverter {
  private config: GradeConversionConfig;

  constructor(config: GradeConversionConfig = DEFAULT_GRADE_CONFIG) {
    this.config = config;
  }

  /**
   * Convert a Canvas grade to an AssignmentStatus value.
   */
  toStatus(rawValue: string, gradingType: string): number {
    const value = rawValue.toLowerCase().trim();

    // Handle empty/missing values
    if (!value || value === '-' || value === 'unsubmitted' || value === 'n/a') {
      return 0;
    }

    // A 0-4 column mapped onto a status assignment: read it as a proportion of
    // the scale and apply the usual score thresholds.
    if (gradingType === 'numeric_scale') {
      const numeric = parseFloat(rawValue);
      if (isNaN(numeric) || numeric <= 0) return AssignmentStatus.MISSING;
      return this.numericToStatus(String((numeric / MAX_NUMERIC_GRADE) * 100));
    }

    // Canvas columns using the older 0-3 convention. 0 and 1 both meant Not
    // Submitted, 2 meant Work-in-Progress and 3 meant Successfully Completed,
    // so the same collapse the stored values got is applied here.
    if (gradingType === 'numerical_status') {
      return CanvasNumericalStatus[parseInt(rawValue, 10)] ?? AssignmentStatus.MISSING;
    }

    // Handle numeric grades (points/percentage)
    if (gradingType === 'points' || gradingType === 'percentage') {
      return this.numericToStatus(rawValue);
    }

    // Handle letter grades
    if (gradingType === 'letter') {
      return this.letterToStatus(rawValue);
    }

    // Handle text status
    return this.textToStatus(value);
  }

  /**
   * Convert a Canvas grade to a portal numeric score, reporting whether the
   * source value had to be clamped to fit the scale.
   */
  toNumericDetailed(
    rawValue: string,
    gradingType: string
  ): { value: number; clamped: boolean } {
    if (gradingType === 'numeric_scale') {
      const numeric = parseFloat(rawValue);
      if (isNaN(numeric)) return { value: 0, clamped: false };

      const bounded = Math.min(MAX_NUMERIC_GRADE, Math.max(0, numeric));
      return {
        value: Math.round(bounded * 100) / 100,
        clamped: numeric !== bounded,
      };
    }

    return { value: this.toNumeric(rawValue, gradingType), clamped: false };
  }

  /**
   * Convert a Canvas grade to portal numeric score (0-4)
   */
  toNumeric(rawValue: string, gradingType: string): number {
    const value = rawValue.toLowerCase().trim();

    // Handle empty/missing values
    if (!value || value === '-' || value === 'unsubmitted' || value === 'n/a') {
      return 0;
    }

    // Already on the portal scale -- clamp only.
    if (gradingType === 'numeric_scale') {
      const numeric = parseFloat(rawValue);
      if (isNaN(numeric)) return 0;
      return Math.round(Math.min(MAX_NUMERIC_GRADE, Math.max(0, numeric)) * 100) / 100;
    }

    // Canvas 0-3 columns, rescaled onto the numeric grading scale
    if (gradingType === 'numerical_status') {
      const num = parseInt(rawValue, 10);
      if (isNaN(num) || num < 0) return 0;
      return Math.min(
        MAX_NUMERIC_GRADE,
        Math.round((num / 3) * MAX_NUMERIC_GRADE * 10) / 10
      );
    }

    // Handle numeric grades directly
    if (gradingType === 'points' || gradingType === 'percentage') {
      const numeric = parseFloat(rawValue);
      if (isNaN(numeric)) return 0;

      // Scale from 0-100 onto the numeric grading scale
      return Math.min(
        MAX_NUMERIC_GRADE,
        Math.round((numeric / 100) * MAX_NUMERIC_GRADE * 10) / 10
      );
    }

    // Handle letter grades
    if (gradingType === 'letter') {
      return this.letterToNumeric(rawValue);
    }

    // Handle text status - convert to rough numeric
    return this.textToNumeric(value);
  }

  /**
   * Convert a numeric grade (0-100) to an AssignmentStatus value.
   */
  private numericToStatus(rawValue: string): number {
    const numeric = parseFloat(rawValue);
    if (isNaN(numeric)) return AssignmentStatus.MISSING;

    const { statusThresholds } = this.config;

    if (numeric >= statusThresholds.complete) return AssignmentStatus.COMPLETE;
    if (numeric > statusThresholds.workInProgress) return AssignmentStatus.WORK_IN_PROGRESS;
    return AssignmentStatus.MISSING;
  }

  /**
   * Convert a letter grade to an AssignmentStatus value.
   */
  private letterToStatus(rawValue: string): number {
    const letter = rawValue.trim().charAt(0).toUpperCase();
    return this.config.letterGradeMap[letter] ?? AssignmentStatus.WORK_IN_PROGRESS;
  }

  /**
   * Convert letter grade to numeric (0-4)
   */
  private letterToNumeric(rawValue: string): number {
    const letter = rawValue.trim().toUpperCase();

    // Handle plus/minus grades
    const baseGrades: Record<string, number> = {
      'A+': 4.0, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D+': 1.3, 'D': 1.0, 'D-': 0.7,
      'F': 0
    };

    // Try full grade first (e.g., "A-")
    if (letter in baseGrades) {
      return baseGrades[letter];
    }

    // Try just first letter
    const firstLetter = letter.charAt(0);
    if (firstLetter in baseGrades) {
      return baseGrades[firstLetter];
    }

    return 2; // Default to middle score
  }

  /**
   * Convert a free-text status to an AssignmentStatus value.
   */
  private textToStatus(value: string): number {
    if (/excellent|outstanding|exceptional|perfect|complete|done|submitted|finished|passed|satisfactory/i.test(value)) {
      return AssignmentStatus.COMPLETE;
    }

    if (/progress|partial|incomplete|pending|started|working/i.test(value)) {
      return AssignmentStatus.WORK_IN_PROGRESS;
    }

    if (/missing|not\s*submitted|absent|none|failed|0/i.test(value)) {
      return AssignmentStatus.MISSING;
    }

    // Anything else non-empty is treated as work started but not finished.
    return AssignmentStatus.WORK_IN_PROGRESS;
  }

  /**
   * Convert text status to numeric (0-4)
   */
  private textToNumeric(value: string): number {
    const status = this.textToStatus(value);

    const statusToNumeric: Record<number, number> = {
      [AssignmentStatus.MISSING]: 0,
      [AssignmentStatus.WORK_IN_PROGRESS]: 2,
      [AssignmentStatus.COMPLETE]: MAX_NUMERIC_GRADE,
    };

    return statusToNumeric[status] ?? 2;
  }

  /**
   * Get a human-readable status label. Delegates to the shared labels so the
   * importer and the UI can never drift apart.
   */
  static getStatusLabel(status: number): string {
    return getAssignmentStatusLabel(status);
  }

  /**
   * Update conversion configuration
   */
  setConfig(config: Partial<GradeConversionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): GradeConversionConfig {
    return { ...this.config };
  }
}
