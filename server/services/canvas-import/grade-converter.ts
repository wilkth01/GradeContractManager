import { GradeConversionConfig, DEFAULT_GRADE_CONFIG } from "./types";

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
   * Convert a Canvas grade to portal status (0-3)
   * 0 = Not Started
   * 1 = In Progress
   * 2 = Completed
   * 3 = Excellent
   */
  toStatus(rawValue: string, gradingType: string): number {
    const value = rawValue.toLowerCase().trim();

    // Handle empty/missing values
    if (!value || value === '-' || value === 'unsubmitted' || value === 'n/a') {
      return 0;
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
   * Convert a Canvas grade to portal numeric score (0-4)
   */
  toNumeric(rawValue: string, gradingType: string): number {
    const value = rawValue.toLowerCase().trim();

    // Handle empty/missing values
    if (!value || value === '-' || value === 'unsubmitted' || value === 'n/a') {
      return 0;
    }

    // Handle numeric grades directly
    if (gradingType === 'points' || gradingType === 'percentage') {
      const numeric = parseFloat(rawValue);
      if (isNaN(numeric)) return 0;

      // Scale from 0-100 to 0-4
      return Math.min(4, Math.round((numeric / 100) * 4 * 10) / 10);
    }

    // Handle letter grades
    if (gradingType === 'letter') {
      return this.letterToNumeric(rawValue);
    }

    // Handle text status - convert to rough numeric
    return this.textToNumeric(value);
  }

  /**
   * Convert numeric grade (0-100) to status (0-3)
   */
  private numericToStatus(rawValue: string): number {
    const numeric = parseFloat(rawValue);
    if (isNaN(numeric)) return 0;

    const { statusThresholds } = this.config;

    if (numeric >= statusThresholds.excellent) return 3;
    if (numeric >= statusThresholds.completed) return 2;
    if (numeric >= statusThresholds.inProgress) return 1;
    if (numeric > 0) return 1; // Any work = at least in progress
    return 0;
  }

  /**
   * Convert letter grade to status (0-3)
   */
  private letterToStatus(rawValue: string): number {
    const letter = rawValue.trim().charAt(0).toUpperCase();
    return this.config.letterGradeMap[letter] ?? 1;
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
   * Convert text status to status number (0-3)
   */
  private textToStatus(value: string): number {
    // Excellent indicators
    if (/excellent|outstanding|exceptional|perfect/i.test(value)) {
      return 3;
    }

    // Completed indicators
    if (/complete|done|submitted|finished|passed|satisfactory/i.test(value)) {
      return 2;
    }

    // In progress indicators
    if (/progress|partial|incomplete|pending|started|working/i.test(value)) {
      return 1;
    }

    // Not started indicators
    if (/missing|not\s*submitted|absent|none|failed|0/i.test(value)) {
      return 0;
    }

    // Default to in progress for any unrecognized non-empty value
    return 1;
  }

  /**
   * Convert text status to numeric (0-4)
   */
  private textToNumeric(value: string): number {
    const status = this.textToStatus(value);

    // Map status to numeric
    const statusToNumeric: Record<number, number> = {
      0: 0,
      1: 2,
      2: 3,
      3: 4
    };

    return statusToNumeric[status] ?? 2;
  }

  /**
   * Get human-readable status label
   */
  static getStatusLabel(status: number): string {
    const labels: Record<number, string> = {
      0: 'Not Started',
      1: 'In Progress',
      2: 'Completed',
      3: 'Excellent'
    };
    return labels[status] ?? 'Unknown';
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
