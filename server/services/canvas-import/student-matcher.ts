import { User } from "@shared/schema";
import { NormalizedStudent, StudentMatchResult, StudentMatchType } from "./types";

/**
 * Service for matching CSV students to enrolled portal students
 * Uses multiple matching strategies with confidence scoring
 */
export class StudentMatcher {
  private enrolledStudents: User[];

  constructor(enrolledStudents: User[]) {
    this.enrolledStudents = enrolledStudents;
  }

  /**
   * Match a single CSV student to an enrolled student
   * Tries multiple strategies in order of reliability
   */
  matchStudent(csvStudent: NormalizedStudent): StudentMatchResult {
    // Strategy 1: Exact username match (case-insensitive)
    if (csvStudent.username) {
      const match = this.findByUsername(csvStudent.username);
      if (match) {
        return this.createResult(csvStudent, match, 'exact_username', 100);
      }
    }

    // Strategy 2: Exact email/SIS Login ID match
    if (csvStudent.email) {
      const match = this.findByEmail(csvStudent.email);
      if (match) {
        return this.createResult(csvStudent, match, 'exact_email', 100);
      }
    }

    // Strategy 3: Exact full name match (case-insensitive, normalized)
    if (csvStudent.displayName) {
      const match = this.findByExactName(csvStudent.displayName);
      if (match) {
        return this.createResult(csvStudent, match, 'exact_name', 95);
      }
    }

    // Strategy 4: Fuzzy name match (Levenshtein distance)
    if (csvStudent.displayName) {
      const fuzzyMatch = this.findByFuzzyName(csvStudent.displayName);
      if (fuzzyMatch) {
        return this.createResult(
          csvStudent,
          fuzzyMatch.student,
          'fuzzy_name',
          fuzzyMatch.confidence
        );
      }
    }

    // No match found
    return this.createResult(csvStudent, null, 'not_found', 0);
  }

  /**
   * Match all students and return results
   */
  matchAll(csvStudents: NormalizedStudent[]): StudentMatchResult[] {
    return csvStudents.map(student => this.matchStudent(student));
  }

  /**
   * Find student by username (case-insensitive)
   */
  private findByUsername(username: string): User | null {
    const normalized = username.toLowerCase().trim();
    return this.enrolledStudents.find(
      s => s.username.toLowerCase().trim() === normalized
    ) || null;
  }

  /**
   * Find student by email (also checks username as email)
   */
  private findByEmail(email: string): User | null {
    const normalized = email.toLowerCase().trim();
    return this.enrolledStudents.find(s =>
      s.email?.toLowerCase().trim() === normalized ||
      s.username.toLowerCase().trim() === normalized
    ) || null;
  }

  /**
   * Find student by exact name match (case-insensitive, normalized whitespace)
   */
  private findByExactName(name: string): User | null {
    const normalized = this.normalizeName(name);
    return this.enrolledStudents.find(
      s => this.normalizeName(s.fullName) === normalized
    ) || null;
  }

  /**
   * Find student by fuzzy name matching
   * Returns match if similarity is above threshold (80%)
   */
  private findByFuzzyName(name: string): { student: User; confidence: number } | null {
    const SIMILARITY_THRESHOLD = 80;
    const normalized = this.normalizeName(name);

    let bestMatch: { student: User; confidence: number } | null = null;

    for (const student of this.enrolledStudents) {
      const studentName = this.normalizeName(student.fullName);
      const similarity = this.calculateSimilarity(normalized, studentName);

      if (similarity >= SIMILARITY_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.confidence) {
          bestMatch = { student, confidence: similarity };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Normalize a name for comparison
   * - Lowercase
   * - Trim whitespace
   * - Collapse multiple spaces
   * - Handle "Last, First" format
   */
  private normalizeName(name: string): string {
    let normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');

    // Handle "Last, First" format - convert to "First Last"
    if (normalized.includes(',')) {
      const parts = normalized.split(',').map(p => p.trim());
      if (parts.length === 2) {
        normalized = `${parts[1]} ${parts[0]}`;
      }
    }

    return normalized;
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns percentage (0-100)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 100;
    if (str1.length === 0 || str2.length === 0) return 0;

    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    return Math.round((1 - distance / maxLength) * 100);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],
            dp[i][j - 1],
            dp[i - 1][j - 1]
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Create a match result object
   */
  private createResult(
    csvStudent: NormalizedStudent,
    matchedStudent: User | null,
    matchType: StudentMatchType,
    confidence: number
  ): StudentMatchResult {
    return {
      csvStudent,
      matchedStudent,
      matchType,
      confidence
    };
  }
}
