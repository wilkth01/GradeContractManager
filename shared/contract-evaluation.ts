import type { CategoryRequirement } from "./schema";
import {
  getAssignmentDisplayState,
  getDisplayStateLabel,
  isOverAbsenceLimit,
} from "./constants";

/**
 * Shared contract-evaluation logic.
 *
 * The rules a student is held to must read identically on their own page, on
 * the instructor roster, and in analytics. Everything here is pure so it can be
 * tested directly and used on both sides of the wire.
 */

/**
 * Whether a due date has passed.
 *
 * A due date is treated as the end of that calendar day, so work is not "late"
 * during the day it is due.
 *
 * The day boundary is computed in UTC deliberately. Due dates originate as
 * date-only strings ("2026-03-15") and are stored as UTC midnight of that day,
 * so UTC is the calendar the stored value actually refers to. The previous
 * version parsed in UTC but called setHours, which resolves in local time --
 * west of UTC that rolled the deadline back a full day, marking work overdue
 * the moment it was assigned. That matters now that being past due is what
 * turns an ungraded assignment into a zero.
 *
 * Does not mutate the date it is given.
 */
export function isPastDue(
  dueDate: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;
  due.setUTCHours(23, 59, 59, 999);
  return now > due;
}

export interface GradeableEntry {
  /** The stored numeric grade, or null/undefined when not yet graded. */
  numericGrade?: string | number | null;
  dueDate?: Date | string | null;
}

export interface CategoryAverage {
  /** Average over the counted entries. 0 when nothing counts yet. */
  average: number;
  /** How many entries the average is over. */
  counted: number;
  /** How many entries carry a real grade. */
  graded: number;
  /** Ungraded and past due, so counted as zero. */
  missed: number;
  /** Ungraded and not yet due, so excluded entirely. */
  pending: number;
  /** True when nothing has been graded or missed yet. */
  isEmpty: boolean;
}

/**
 * Average a set of numerically graded assignments.
 *
 * Ungraded work is excluded while it is still due and counted as zero once its
 * due date has passed. That keeps the number honest mid-semester -- two
 * readings graded at 4.0 out of twelve reads as 4.0, not 0.67 -- while still
 * penalising work that was genuinely skipped, with no manual zeroing.
 *
 * Work with no due date is never counted as missed, only as pending, since
 * there is nothing to be late against.
 */
export function computeCategoryAverage(
  entries: GradeableEntry[],
  now: Date = new Date()
): CategoryAverage {
  let total = 0;
  let counted = 0;
  let graded = 0;
  let missed = 0;
  let pending = 0;

  for (const entry of entries) {
    const raw = entry.numericGrade;
    const hasGrade = raw !== null && raw !== undefined && raw !== "";
    const value = hasGrade ? Number(raw) : NaN;

    if (hasGrade && !isNaN(value)) {
      total += value;
      counted++;
      graded++;
    } else if (isPastDue(entry.dueDate, now)) {
      counted++;
      missed++;
    } else {
      pending++;
    }
  }

  return {
    average: counted > 0 ? total / counted : 0,
    counted,
    graded,
    missed,
    pending,
    isEmpty: counted === 0,
  };
}

// ===========================================================================
// Contract evaluation
//
// One place that answers "is this student meeting this contract, and if not,
// what is still needed". The same function backs the student view, the
// instructor roster, analytics, and the progress messages, so those four can
// never disagree about what a contract requires.
// ===========================================================================

export interface EvaluationAssignment {
  id: number;
  name: string;
  moduleGroup: string | null;
  scoringType: "status" | "numeric";
  dueDate?: Date | string | null;
}

export interface EvaluationProgress {
  assignmentId: number;
  status?: number | null;
  numericGrade?: string | number | null;
}

export interface EvaluationContract {
  id: number;
  grade: string;
  /** Higher supersedes lower for the same grade. */
  version?: number;
  assignments: { id: number; comments?: string; minPoints?: number }[];
  categoryRequirements?: CategoryRequirement[] | null;
  requiredParticipationSessions?: number | null;
  maxAbsences?: number | null;
}

export interface EvaluationInput {
  contract: EvaluationContract;
  assignments: EvaluationAssignment[];
  progress: EvaluationProgress[];
  /** Sessions in which the student met the participation bar. */
  participationSessions: number;
  /** Absence total, as imported. May be fractional. */
  absences: number;
  now?: Date;
}

export type RequirementKind =
  | "assignment"
  | "category-count"
  | "category-average"
  | "participation"
  | "absences";

export interface RequirementResult {
  kind: RequirementKind;
  /** What the requirement covers: an assignment name, or a module group. */
  label: string;
  met: boolean;
  /** Short human-readable state, e.g. "5 of 7" or "3.20 / 3.50". */
  detail: string;
}

export interface ContractResult {
  contractId: number;
  grade: string;
  met: boolean;
  requirements: RequirementResult[];
  /** Things the student can still do something about. */
  actionable: string[];
  /** Things they cannot act on, e.g. work not yet due. */
  informational: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Evaluate one contract for one student.
 *
 * A module group listed in the contract is required in full unless a category
 * requirement relaxes it to "N of these" or replaces the count with an average.
 * Individual numeric assignments may additionally carry a minPoints floor.
 */
export function evaluateContract(input: EvaluationInput): ContractResult {
  const { contract, assignments, progress, participationSessions, absences } = input;
  const now = input.now ?? new Date();

  const byId = new Map(assignments.map((a) => [a.id, a]));
  const progressFor = (id: number) => progress.find((p) => p.assignmentId === id);

  const requirements: RequirementResult[] = [];
  const actionable: string[] = [];
  const informational: string[] = [];

  // Group the contract's required assignments by module group.
  const groups = new Map<string, { assignment: EvaluationAssignment; minPoints?: number }[]>();
  for (const req of contract.assignments) {
    const assignment = byId.get(req.id);
    if (!assignment) continue;
    const group = assignment.moduleGroup || "Uncategorized";
    const existing = groups.get(group) ?? [];
    existing.push({ assignment, minPoints: req.minPoints });
    groups.set(group, existing);
  }

  for (const [group, items] of Array.from(groups.entries())) {
    const categoryReq = contract.categoryRequirements?.find((cr) => cr.category === group);
    const requiredCount = categoryReq?.required ?? 0;
    const minAverage = categoryReq?.minAverage;

    const complete = items.filter(({ assignment }) =>
      getAssignmentDisplayState(assignment.scoringType, progressFor(assignment.id)) === "completed"
    ).length;
    const inProgress = items.filter(({ assignment }) =>
      getAssignmentDisplayState(assignment.scoringType, progressFor(assignment.id)) === "in-progress"
    ).length;

    if (minAverage != null) {
      const stats = computeCategoryAverage(
        items.map(({ assignment }) => ({
          numericGrade: progressFor(assignment.id)?.numericGrade,
          dueDate: assignment.dueDate,
        })),
        now
      );
      const met = !stats.isEmpty && stats.average >= minAverage;
      requirements.push({
        kind: "category-average",
        label: group,
        met,
        detail: stats.isEmpty
          ? `nothing graded yet / ${minAverage.toFixed(1)} needed`
          : `${stats.average.toFixed(2)} / ${minAverage.toFixed(1)}`,
      });
      if (!met) {
        actionable.push(
          stats.isEmpty
            ? `reach a ${minAverage.toFixed(1)} average in ${group}`
            : `bring your ${group} average to ${minAverage.toFixed(1)} (currently ${stats.average.toFixed(2)})`
        );
      }
      if (stats.pending > 0) {
        informational.push(`${plural(stats.pending, "item")} in ${group} not yet due`);
      }
    }

    if (requiredCount > 0) {
      const met = complete >= requiredCount;
      requirements.push({
        kind: "category-count",
        label: group,
        met,
        detail: `${complete} of ${requiredCount}`,
      });
      if (!met) {
        const gap = requiredCount - complete;
        // Work already marked in-progress can be revised, which is a different
        // ask from starting something new.
        const revisable = Math.min(inProgress, gap);
        const fresh = gap - revisable;
        if (revisable > 0) {
          actionable.push(`revise ${plural(revisable, `work-in-progress ${group} item`)}`);
        }
        if (fresh > 0) {
          actionable.push(`complete ${plural(fresh, `more ${group} item`)}`);
        }
      }
    }

    // No category rule means every listed item in the group is required.
    if (requiredCount === 0 && minAverage == null) {
      for (const { assignment, minPoints } of items) {
        const studentProgress = progressFor(assignment.id);
        const state = getAssignmentDisplayState(assignment.scoringType, studentProgress);
        const score = Number(studentProgress?.numericGrade ?? 0);
        const met =
          minPoints != null ? score >= minPoints : state === "completed";

        requirements.push({
          kind: "assignment",
          label: assignment.name,
          met,
          detail:
            minPoints != null
              ? `${score.toFixed(1)} / ${minPoints}`
              : getDisplayStateLabel(state),
        });

        if (!met) {
          if (minPoints != null) {
            actionable.push(`reach ${minPoints} points on ${assignment.name}`);
          } else if (state === "in-progress") {
            actionable.push(`revise ${assignment.name}`);
          } else if (isPastDue(assignment.dueDate, now)) {
            actionable.push(`complete ${assignment.name}`);
          } else {
            informational.push(`${assignment.name} is not yet due`);
          }
        }
      }
    }
  }

  const requiredParticipation = contract.requiredParticipationSessions ?? 0;
  if (requiredParticipation > 0) {
    const met = participationSessions >= requiredParticipation;
    requirements.push({
      kind: "participation",
      label: "Participation",
      met,
      detail: `${participationSessions} of ${requiredParticipation} sessions`,
    });
    if (!met) {
      actionable.push(
        `participate in ${plural(requiredParticipation - participationSessions, "more session")}`
      );
    }
  }

  const maxAbsences = contract.maxAbsences ?? 0;
  const absencesMet = !isOverAbsenceLimit(absences, maxAbsences);
  requirements.push({
    kind: "absences",
    label: "Absences",
    met: absencesMet,
    detail: `${formatAbsences(absences)} of ${maxAbsences} allowed`,
  });
  if (!absencesMet) {
    // Absences cannot be undone, so this is never an action item.
    informational.push(
      `you are over the ${maxAbsences}-absence limit for this contract (${formatAbsences(absences)})`
    );
  }

  return {
    contractId: contract.id,
    grade: contract.grade,
    met: requirements.every((r) => r.met),
    actionable,
    informational,
    requirements,
  };
}

/** Absences are fractional; render 7.5 as "7.5" and 3 as "3". */
export function formatAbsences(absences: number | string | null | undefined): string {
  const value = Number(absences ?? 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type AbsencePenalty = "none" | "letter-reduction" | "failure";

export interface ClassAbsencePolicy {
  absencePenaltyThreshold?: number | null;
  absenceFailureThreshold?: number | null;
}

/**
 * Absence penalties that sit above the contract tiers.
 *
 * These are class policy, not contract terms: passing the first threshold costs
 * a letter whatever contract was met, and passing the second fails the course.
 */
export function absencePenaltyFor(
  absences: number,
  policy: ClassAbsencePolicy
): AbsencePenalty {
  const fail = policy.absenceFailureThreshold;
  if (fail != null && fail > 0 && absences >= fail) return "failure";

  const reduce = policy.absencePenaltyThreshold;
  if (reduce != null && reduce > 0 && absences >= reduce) return "letter-reduction";

  return "none";
}

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

/** The grade one letter below the given one. */
export function reduceGrade(grade: string): string {
  const index = GRADE_ORDER.indexOf(grade);
  if (index === -1) return grade;
  return GRADE_ORDER[Math.min(index + 1, GRADE_ORDER.length - 1)];
}

/**
 * The current version of each grade contract.
 *
 * Editing a contract publishes a new version rather than overwriting the old
 * one, so a class accumulates superseded rows. Only the newest version of each
 * grade is in force: changes apply to everyone who chose that grade, with no
 * action needed from them.
 */
export function currentContracts(contracts: EvaluationContract[]): EvaluationContract[] {
  const latestByGrade = new Map<string, EvaluationContract>();

  for (const contract of contracts) {
    const existing = latestByGrade.get(contract.grade);
    if (!existing || (contract.version ?? 0) > (existing.version ?? 0)) {
      latestByGrade.set(contract.grade, contract);
    }
  }

  return Array.from(latestByGrade.values());
}

export interface StandingInput {
  /** Every contract offered in the class. */
  contracts: EvaluationContract[];
  /** The contract this student selected, if any. */
  chosenContractId?: number | null;
  assignments: EvaluationAssignment[];
  progress: EvaluationProgress[];
  participationSessions: number;
  absences: number;
  policy?: ClassAbsencePolicy;
  now?: Date;
}

export interface Standing {
  /** Evaluation of the contract the student selected. */
  chosen: ContractResult | null;
  /** Every contract, best grade first. */
  all: ContractResult[];
  /** Highest grade whose requirements are currently all met. */
  highestMet: string | null;
  penalty: AbsencePenalty;
  /**
   * The grade this currently amounts to: the highest met contract, after any
   * class absence penalty. Null when no contract is met.
   */
  effectiveGrade: string | null;
}

/**
 * Evaluate a student against every contract in the class.
 *
 * Reporting the highest tier met, rather than only the chosen contract, is what
 * lets a student who contracted for an A see that they are currently on pace
 * for a B -- which is the thing they most need to know.
 */
export function evaluateStanding(input: StandingInput): Standing {
  const ordered = [...currentContracts(input.contracts)].sort(
    (a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
  );

  const all = ordered.map((contract) =>
    evaluateContract({
      contract,
      assignments: input.assignments,
      progress: input.progress,
      participationSessions: input.participationSessions,
      absences: input.absences,
      now: input.now,
    })
  );

  const highest = all.find((result) => result.met) ?? null;
  const penalty = absencePenaltyFor(input.absences, input.policy ?? {});

  let effectiveGrade: string | null = highest?.grade ?? null;
  if (penalty === "failure") {
    effectiveGrade = "F";
  } else if (penalty === "letter-reduction" && effectiveGrade) {
    effectiveGrade = reduceGrade(effectiveGrade);
  }

  // Resolve the chosen contract by grade, not by id: a student may still point
  // at a superseded row, and the terms in force are the current ones.
  const chosenGrade = input.contracts.find((c) => c.id === input.chosenContractId)?.grade;

  return {
    chosen: all.find((r) => r.grade === chosenGrade) ?? null,
    all,
    highestMet: highest?.grade ?? null,
    penalty,
    effectiveGrade,
  };
}
