/**
 * Robust CSV parsing utilities that properly handle:
 * - Quoted fields with commas (e.g., "Smith, John")
 * - Escaped quotes within fields
 * - Various line endings (Windows/Unix)
 * - Empty cells
 */

/**
 * Parse a single CSV line respecting quoted fields
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote ("") - add single quote and skip next char
        value += '"';
        i++;
      } else {
        // Toggle quote mode
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }

  // Don't forget the last value
  values.push(value.trim());
  return values;
}

/**
 * Parse complete CSV text into headers and rows
 */
export function parseCSV(csvText: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  // Handle both Windows (\r\n) and Unix (\n) line endings
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());

  if (lines.length < 1) {
    throw new Error("CSV file is empty");
  }

  if (lines.length < 2) {
    throw new Error("CSV must have header row and at least one data row");
  }

  const headers = parseCSVLine(lines[0]);

  const rows = lines.slice(1).map((line, lineIndex) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });

    return row;
  });

  return { headers, rows };
}

/**
 * Canvas-specific CSV column names to filter out
 */
export const CANVAS_SYSTEM_COLUMNS = [
  'Student',
  'ID',
  'SIS User ID',
  'SIS Login ID',
  'Section',
  'Integration ID',
  'Root Account'
];

/**
 * Canvas summary columns that should be excluded from assignment list
 */
export const CANVAS_SUMMARY_COLUMNS = [
  'Current Score',
  'Final Score',
  'Current Grade',
  'Final Grade',
  'Current Points',
  'Final Points',
  'Unposted Current Score',
  'Unposted Final Score',
  'Unposted Current Grade',
  'Unposted Final Grade'
];

/**
 * Extract assignment columns from Canvas CSV headers
 * Filters out system and summary columns
 */
export function extractAssignmentColumns(headers: string[]): string[] {
  return headers.filter(header => {
    const normalizedHeader = header.toLowerCase().trim();

    // Check against system columns
    const isSystemColumn = CANVAS_SYSTEM_COLUMNS.some(sc =>
      normalizedHeader === sc.toLowerCase()
    );

    // Check against summary columns
    const isSummaryColumn = CANVAS_SUMMARY_COLUMNS.some(sc =>
      normalizedHeader.includes(sc.toLowerCase())
    );

    return !isSystemColumn && !isSummaryColumn;
  });
}

/**
 * Normalize a string for comparison (lowercase, trimmed, single spaces)
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create a matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize first column
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity percentage between two strings
 * Returns a number from 0-100
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return Math.round((1 - distance / maxLength) * 100);
}
