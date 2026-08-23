/**
 * Build grade contracts from a pasted HTML summary table.
 *
 * A contract-graded syllabus already states the bargain as a table -- one row
 * per requirement, one column per tier. Retyping that into three dialogs is
 * both tedious and the likeliest place for the app and the syllabus to drift
 * apart. This reads the table the instructor already wrote.
 *
 * Nothing here writes anything. It produces an interpretation the instructor
 * confirms or corrects first, because a row label is prose and matching prose
 * to an assignment is a guess, however good.
 */

import { MAX_NUMERIC_GRADE } from "./constants";

// ============================================================================
// Table parsing
// ============================================================================

export interface ContractTableRow {
  label: string;
  /** One cell per grade column, aligned with ParsedContractTable.grades. */
  cells: string[];
}

export interface ParsedContractTable {
  /** Column headers after the leading label column, e.g. ["A", "B", "C"]. */
  grades: string[];
  rows: ContractTableRow[];
  warnings: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  check: "✓",
  times: "×",
};

/** Decode the entities a copied syllabus table actually contains. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Strip tags and collapse whitespace, so a cell reads as its text. */
function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull rows and cells out of the first table in the markup.
 *
 * Deliberately regex-based rather than DOM-based: this runs in the browser and
 * in tests, and pulling in a parser for one well-formed table copied out of a
 * syllabus is not worth the dependency. Anything it cannot read is reported
 * rather than guessed at.
 */
export function parseContractTable(html: string): ParsedContractTable {
  const warnings: string[] = [];

  const tables = html.match(/<table[\s\S]*?<\/table>/gi);
  if (!tables || tables.length === 0) {
    throw new Error("No <table> found in that markup. Paste the table itself, tags included.");
  }
  if (tables.length > 1) {
    warnings.push(`Found ${tables.length} tables; reading the first one only.`);
  }

  const rawRows = tables[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  if (rawRows.length < 2) {
    throw new Error("That table has no data rows.");
  }

  const parsed = rawRows.map((row) =>
    (row.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map(cellText)
  );

  const header = parsed[0];
  if (header.length < 2) {
    throw new Error("The first row needs a label column and at least one grade column.");
  }

  const grades = header.slice(1).map((g) => g.trim());
  const rows: ContractTableRow[] = [];

  for (const cells of parsed.slice(1)) {
    const label = (cells[0] ?? "").trim();
    if (!label) continue;

    if (cells.length - 1 !== grades.length) {
      warnings.push(
        `"${label}" has ${cells.length - 1} value${
          cells.length - 1 === 1 ? "" : "s"
        } for ${grades.length} grade columns; missing values were read as blank.`
      );
    }
    rows.push({
      label,
      cells: grades.map((_g, i) => (cells[i + 1] ?? "").trim()),
    });
  }

  if (rows.length === 0) {
    throw new Error("That table has a header but no requirement rows.");
  }

  return { grades, rows, warnings };
}

// ============================================================================
// Reading a row
// ============================================================================

export type RequirementKind =
  | "absences"
  | "participation"
  | "category-count"
  | "category-average"
  | "assignment"
  | "unknown";

export type MatchConfidence = "exact" | "close" | "none";

export interface InterpretedRow {
  label: string;
  kind: RequirementKind;
  /** Module group this row applies to, for the two category kinds. */
  category: string | null;
  /** Portal assignment this row names, for assignment rows. */
  assignmentId: number | null;
  confidence: MatchConfidence;
  /** Per grade, aligned with the table's grade columns. */
  numbers: (number | null)[];
  /** The "of M" in "10 of 13", per grade. Null when the row states no total. */
  totals: (number | null)[];
  /** Whether the row is required at that tier, for assignment rows. */
  required: boolean[];
  warnings: string[];
}

const COUNT_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:of|\/|out of)\s*(\d+(?:\.\d+)?)$/i;
const NUMBER_PATTERN = /^(\d+(?:\.\d+)?)$/;

const AFFIRMATIVE = /^(required|yes|y|x|✓|✔|req\.?|mandatory|all)$/i;
const NEGATIVE = /^(|—|–|-|--|n\/a|na|no|none|optional|not required)$/i;

/** Everything outside a parenthetical, which is where qualifiers hide. */
function withoutParentheticals(label: string): string {
  return label.replace(/\([^)]*\)/g, " ");
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words that describe the requirement rather than name its target. Stripped
// before matching a row label against a module group, so "Discussion Logs
// Successfully Completed" looks for "discussion logs".
const QUALIFIER_WORDS = new Set([
  "successfully",
  "completed",
  "complete",
  "completion",
  "average",
  "averages",
  "avg",
  "required",
  "allowed",
  "minimum",
  "min",
  "max",
  "maximum",
  "score",
  "scores",
  "grade",
  "grades",
  "of",
  "out",
  "at",
  "least",
  "the",
  "a",
  "an",
]);

function targetPhrase(label: string): string {
  return normalize(withoutParentheticals(label))
    .split(" ")
    .filter((word) => word && !QUALIFIER_WORDS.has(word))
    .join(" ");
}

function parseCount(cell: string): { value: number; total: number } | null {
  const match = COUNT_PATTERN.exec(cell.trim());
  if (!match) return null;
  return { value: Number(match[1]), total: Number(match[2]) };
}

function parseNumber(cell: string): number | null {
  const match = NUMBER_PATTERN.exec(cell.trim());
  return match ? Number(match[1]) : null;
}

/** Cells that state nothing -- an em dash, an N/A, a blank. */
function isBlank(cell: string): boolean {
  return NEGATIVE.test(cell.trim());
}

export interface MatchTarget {
  key: string;
  label: string;
}

export interface MatchResult {
  key: string | null;
  confidence: MatchConfidence;
}

/**
 * Match a row label to a module group or an assignment name.
 *
 * Exact first, then containment, then token overlap. A near miss is reported as
 * "close" rather than accepted silently: the instructor confirms every match
 * before anything is built, because binding a requirement to the wrong
 * assignment produces a contract that looks right and grades wrong.
 */
export function matchTarget(phrase: string, candidates: MatchTarget[]): MatchResult {
  const needle = normalize(phrase);
  if (!needle) return { key: null, confidence: "none" };

  const scored = candidates.map((candidate) => {
    const hay = normalize(candidate.label);
    if (hay === needle) return { key: candidate.key, score: 1, exact: true };

    const needleTokens = needle.split(" ").filter(Boolean);
    const hayTokens = hay.split(" ").filter(Boolean);
    const shared = needleTokens.filter((token) => hayTokens.includes(token)).length;
    const overlap = shared / Math.max(1, Math.min(needleTokens.length, hayTokens.length));

    // Containment is a strong signal ("Hypothesis" inside "Hypothesis
    // Annotations") but weaker than an exact name.
    const contains = hay.includes(needle) || needle.includes(hay);
    return {
      key: candidate.key,
      score: contains ? Math.max(0.8, overlap) : overlap,
      exact: false,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { key: null, confidence: "none" };
  if (best.exact) return { key: best.key, confidence: "exact" };
  if (best.score >= 0.6) return { key: best.key, confidence: "close" };
  return { key: null, confidence: "none" };
}

export interface InterpretationContext {
  /** Distinct module groups in the class. */
  categories: string[];
  /** The class's assignments, for naming a row's target. */
  assignments: { id: number; name: string; moduleGroup: string | null }[];
}

/**
 * Read one table row as a requirement.
 *
 * Kind is decided by the shape of the values, with the label breaking ties the
 * values cannot: "2 / 3 / 4" is a count of absences or a count of sessions
 * depending entirely on what the row is called.
 */
export function interpretRow(
  row: ContractTableRow,
  context: InterpretationContext
): InterpretedRow {
  const warnings: string[] = [];
  const plainLabel = normalize(withoutParentheticals(row.label));

  const counts = row.cells.map(parseCount);
  const numbers = row.cells.map(parseNumber);
  const stated = row.cells.filter((cell) => !isBlank(cell));

  const mentions = (pattern: RegExp) => pattern.test(plainLabel);
  const anyCount = counts.some(Boolean);
  const allNumeric =
    stated.length > 0 && row.cells.every((cell, i) => isBlank(cell) || numbers[i] != null);
  const allBoolean =
    stated.length > 0 && row.cells.every((cell) => isBlank(cell) || AFFIRMATIVE.test(cell.trim()));

  const base: InterpretedRow = {
    label: row.label,
    kind: "unknown",
    category: null,
    assignmentId: null,
    confidence: "none",
    numbers: row.cells.map(() => null),
    totals: row.cells.map(() => null),
    required: row.cells.map(() => false),
    warnings,
  };

  // A "10 of 13" row is a category count whatever it is called.
  if (anyCount) {
    base.kind = "category-count";
    base.numbers = counts.map((c) => (c ? c.value : null));
    base.totals = counts.map((c) => (c ? c.total : null));
    resolveCategory(base, context, warnings);
    return base;
  }

  // Checked before participation: "Absences allowed (of 42 sessions)" mentions
  // sessions in its parenthetical, and absences everywhere else.
  if (mentions(/\babsen/) && allNumeric) {
    base.kind = "absences";
    base.numbers = numbers;
    base.confidence = "exact";
    return base;
  }

  if (mentions(/\bparticipat|\bsession/) && allNumeric) {
    base.kind = "participation";
    base.numbers = numbers;
    base.confidence = "exact";
    return base;
  }

  if (allNumeric) {
    const looksLikeAverage =
      mentions(/\baverage|\bavg\b|\bmean\b/) ||
      numbers.some((n) => n != null && !Number.isInteger(n));

    base.kind = looksLikeAverage ? "category-average" : "unknown";
    base.numbers = numbers;
    if (base.kind === "category-average") {
      resolveCategory(base, context, warnings);
      if (numbers.some((n) => n != null && n > MAX_NUMERIC_GRADE)) {
        warnings.push(
          `Values above ${MAX_NUMERIC_GRADE} cannot be an average on this app's ${MAX_NUMERIC_GRADE}-point scale.`
        );
      }
    } else {
      warnings.push("These numbers could be a count or an average. Say which.");
    }
    return base;
  }

  if (allBoolean) {
    base.kind = "assignment";
    base.required = row.cells.map((cell) => AFFIRMATIVE.test(cell.trim()));

    const candidates = context.assignments.map((a) => ({ key: String(a.id), label: a.name }));
    // The row label is the assignment's own name here, so try it verbatim
    // first: stripping qualifier words hurts a name like "Writing Assignment 1".
    const verbatim = matchTarget(row.label, candidates);
    const stripped = matchTarget(targetPhrase(row.label), candidates);
    const chosen =
      verbatim.confidence === "exact" ? verbatim : stripped.key ? stripped : verbatim;

    base.assignmentId = chosen.key ? Number(chosen.key) : null;
    base.confidence = chosen.confidence;
    if (!base.assignmentId) {
      warnings.push("No assignment in this class matches that name. Pick one, or skip the row.");
    }
    return base;
  }

  warnings.push("Could not read these values as a count, an average, or required/not required.");
  return base;
}

function resolveCategory(
  row: InterpretedRow,
  context: InterpretationContext,
  warnings: string[]
): void {
  const match = matchTarget(
    targetPhrase(row.label),
    context.categories.map((c) => ({ key: c, label: c }))
  );
  row.category = match.key;
  row.confidence = match.confidence;
  if (!row.category) {
    warnings.push("No module group in this class matches that name. Pick one, or skip the row.");
  }
}

/** Read every row of a parsed table. */
export function interpretTable(
  table: ParsedContractTable,
  context: InterpretationContext
): InterpretedRow[] {
  return table.rows.map((row) => interpretRow(row, context));
}

// ============================================================================
// Building the contracts
// ============================================================================

export interface ContractDraft {
  grade: string;
  assignments: { id: number; minPoints?: number }[];
  maxAbsences: number;
  requiredParticipationSessions: number;
  categoryRequirements: { category: string; required?: number; minAverage?: number }[];
}

export interface DraftResult {
  drafts: ContractDraft[];
  warnings: string[];
}

/**
 * Turn confirmed row interpretations into one contract per grade column.
 *
 * A category requirement only bites on assignments the contract actually lists,
 * so a counted or averaged group contributes its whole membership to the pool
 * and is then relaxed -- "10 of 13" means all thirteen are candidates and ten
 * must land, which is not the same as naming ten of them.
 */
export function buildContractDrafts(
  table: ParsedContractTable,
  rows: InterpretedRow[],
  context: InterpretationContext
): DraftResult {
  const warnings: string[] = [];
  const byCategory = new Map<string, number[]>();
  for (const assignment of context.assignments) {
    const group = assignment.moduleGroup || "Uncategorized";
    byCategory.set(group, [...(byCategory.get(group) ?? []), assignment.id]);
  }

  const categoriesUsed = new Set(
    rows
      .filter((r) => r.kind === "category-count" || r.kind === "category-average")
      .map((r) => r.category)
      .filter((c): c is string => c != null)
  );

  const drafts = table.grades.map<ContractDraft>((grade, column) => {
    const assignmentIds = new Set<number>();
    const categoryRequirements = new Map<
      string,
      { category: string; required?: number; minAverage?: number }
    >();
    let maxAbsences = 0;
    let requiredParticipationSessions = 0;

    const requirementFor = (category: string) => {
      const existing = categoryRequirements.get(category);
      if (existing) return existing;
      const created: { category: string; required?: number; minAverage?: number } = { category };
      categoryRequirements.set(category, created);
      return created;
    };

    for (const row of rows) {
      switch (row.kind) {
        case "absences": {
          const value = row.numbers[column];
          if (value != null) maxAbsences = value;
          break;
        }
        case "participation": {
          const value = row.numbers[column];
          if (value != null) requiredParticipationSessions = value;
          break;
        }
        case "category-count": {
          if (!row.category) break;
          const value = row.numbers[column];
          if (value == null || value <= 0) break;
          const members = byCategory.get(row.category) ?? [];
          members.forEach((id) => assignmentIds.add(id));
          requirementFor(row.category).required = value;

          const total = row.totals[column];
          if (total != null && members.length !== total && column === 0) {
            warnings.push(
              `"${row.label}" says ${total} in ${row.category}, but this class has ${members.length}.`
            );
          }
          if (value > members.length) {
            warnings.push(
              `Grade ${grade} needs ${value} from ${row.category}, which only has ${
                members.length
              } assignment${members.length === 1 ? "" : "s"}.`
            );
          }
          break;
        }
        case "category-average": {
          if (!row.category) break;
          const value = row.numbers[column];
          if (value == null) break;
          const members = byCategory.get(row.category) ?? [];
          members.forEach((id) => assignmentIds.add(id));
          requirementFor(row.category).minAverage = value;
          break;
        }
        case "assignment": {
          if (!row.assignmentId || !row.required[column]) break;
          assignmentIds.add(row.assignmentId);

          // A group carrying a count or an average rule ignores its members
          // individually, so a row demanding one of them would quietly do
          // nothing.
          const assignment = context.assignments.find((a) => a.id === row.assignmentId);
          const group = assignment?.moduleGroup || "Uncategorized";
          if (categoriesUsed.has(group)) {
            warnings.push(
              `"${row.label}" is in ${group}, which this table also gives a group rule. The group rule wins, so requiring it on its own has no effect.`
            );
          }
          break;
        }
        default:
          break;
      }
    }

    return {
      grade,
      assignments: Array.from(assignmentIds).map((id) => ({ id })),
      maxAbsences,
      requiredParticipationSessions,
      categoryRequirements: Array.from(categoryRequirements.values()),
    };
  });

  return { drafts, warnings: Array.from(new Set(warnings)) };
}
