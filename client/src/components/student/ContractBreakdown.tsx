import { useState, type ReactNode } from "react";
import type { AssignmentProgress, CategoryRequirement, ClassAssignment } from "@shared/schema";
import { MAX_NUMERIC_GRADE } from "@shared/constants";
import {
  assignmentStanding,
  computeCategoryAverage,
  getAssignmentStandingLabel,
  type AssignmentStanding,
} from "@shared/contract-evaluation";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";

/**
 * One student's contract, assignment by assignment.
 *
 * The same rows back the instructor roster, the student profile, and the
 * student's own page, so both sides of the class read a student's record the
 * same way: what is done, what is in progress, what is missing, and the score
 * on anything scored.
 */

type Requirement = { id: number; comments?: string; minPoints?: number };

export interface BreakdownContract {
  assignments: Requirement[];
  categoryRequirements?: CategoryRequirement[] | null;
}

export interface BreakdownItem {
  assignment: ClassAssignment;
  req: Requirement;
  progress?: AssignmentProgress;
  standing: AssignmentStanding;
}

type Filter = "all" | "completed" | "in-progress" | "not-submitted" | "pending";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in-progress", label: "Work-in-Progress" },
  { value: "not-submitted", label: "Not submitted" },
  { value: "pending", label: "Not yet due or graded" },
];

function matchesFilter(standing: AssignmentStanding, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return standing === "not-yet-due" || standing === "awaiting-grades";
  return standing === filter;
}

/** The contract's assignments, grouped by module group in contract order. */
export function groupContractItems(
  contract: BreakdownContract,
  assignments: ClassAssignment[],
  progress: AssignmentProgress[]
): [string, BreakdownItem[]][] {
  const groups = new Map<string, BreakdownItem[]>();
  for (const req of contract.assignments ?? []) {
    const assignment = assignments.find((a) => a.id === req.id);
    if (!assignment) continue;
    const studentProgress = progress.find((p) => p.assignmentId === assignment.id);
    const group = assignment.moduleGroup || "Uncategorized";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({
      assignment,
      req,
      progress: studentProgress,
      standing: assignmentStanding(assignment, studentProgress),
    });
  }
  return Array.from(groups.entries());
}

const formatDue = (dueDate: Date | string | null | undefined) =>
  dueDate
    ? new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

function StandingIcon({ standing }: { standing: AssignmentStanding }) {
  switch (standing) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />;
    case "in-progress":
      return <Circle className="h-4 w-4 shrink-0 text-yellow-600" aria-hidden="true" />;
    case "not-submitted":
      return <XCircle className="h-4 w-4 shrink-0 text-bad" aria-hidden="true" />;
    default:
      return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
}

const PILL: Record<AssignmentStanding, string> = {
  completed: "pill-ok",
  "in-progress": "pill-warn",
  "not-submitted": "pill-bad",
  "not-yet-due": "pill-neutral",
  "awaiting-grades": "pill-neutral",
};

/** A scored assignment shows its score; anything else shows its state. */
function ResultPill({ item }: { item: BreakdownItem }) {
  const { assignment, req, progress, standing } = item;
  const raw = progress?.numericGrade;
  const hasScore = assignment.scoringType === "numeric" && raw != null && raw !== "";

  if (hasScore) {
    const score = Number(raw);
    const belowMin = req.minPoints != null && score < req.minPoints;
    return (
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium tabular-nums ${belowMin ? "pill-warn" : "pill-info"}`}
        title={req.minPoints != null ? `${req.minPoints} required` : undefined}
      >
        {score.toFixed(2)} / {MAX_NUMERIC_GRADE}
      </span>
    );
  }

  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${PILL[standing]}`}
      title={
        standing === "awaiting-grades"
          ? "Past due, but no one has been graded on this yet, so it does not count against the average"
          : undefined
      }
    >
      {getAssignmentStandingLabel(standing)}
    </span>
  );
}

/** One line per assignment. */
export function BreakdownRows({
  items,
  renderAction,
}: {
  items: BreakdownItem[];
  renderAction?: (item: BreakdownItem) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border">
      {items.map((item) => {
        const due = formatDue(item.assignment.dueDate);
        return (
          <li key={item.assignment.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <StandingIcon standing={item.standing} />
            <div className="min-w-0 flex-1">
              <span className="break-words">{item.assignment.name}</span>
              {item.req.comments && (
                <span className="text-muted-foreground"> ({item.req.comments})</span>
              )}
            </div>
            {due && (
              <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground tabular-nums">
                Due {due}
              </span>
            )}
            <ResultPill item={item} />
            {renderAction && <div className="shrink-0">{renderAction(item)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** How a group is scored, in words, with the student's current figure. */
function GroupSummary({
  items,
  requirement,
}: {
  items: BreakdownItem[];
  requirement?: CategoryRequirement;
}) {
  const completed = items.filter((i) => i.standing === "completed").length;
  const parts: ReactNode[] = [];

  if (requirement?.minAverage != null) {
    const stats = computeCategoryAverage(
      items.map(({ assignment, progress }) => ({
        numericGrade: progress?.numericGrade,
        dueDate: assignment.dueDate,
        gradingStarted: assignment.gradingStarted,
      }))
    );
    const met = !stats.isEmpty && stats.average >= requirement.minAverage;
    parts.push(
      <span
        key="avg"
        className={`rounded px-1.5 py-0.5 ${stats.isEmpty ? "pill-neutral" : met ? "pill-ok" : "pill-warn"}`}
        title={`${stats.graded} graded, ${stats.missed} past due counted as 0, ${stats.pending} not yet due, ${stats.awaitingGrades} not graded yet`}
      >
        {stats.isEmpty
          ? `Avg: none yet / ${requirement.minAverage} required`
          : `Avg ${stats.average.toFixed(2)} over ${stats.counted} / ${requirement.minAverage} required`}
      </span>
    );
  }

  const required = requirement?.required ?? 0;
  if (required > 0) {
    parts.push(
      <span key="count" className={`rounded px-1.5 py-0.5 ${completed >= required ? "pill-ok" : "pill-warn"}`}>
        {completed} of {required} required
      </span>
    );
  } else if (requirement?.minAverage == null) {
    parts.push(
      <span
        key="all"
        className={`rounded px-1.5 py-0.5 ${completed === items.length ? "pill-ok" : "pill-neutral"}`}
      >
        {completed} of {items.length} completed
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1.5 text-xs">{parts}</div>;
}

/**
 * The full drill-down: every contract assignment, grouped, filterable by
 * where it stands.
 */
export function ContractBreakdown({
  contract,
  assignments,
  progress,
  renderAction,
}: {
  contract: BreakdownContract;
  assignments: ClassAssignment[];
  progress: AssignmentProgress[];
  renderAction?: (item: BreakdownItem) => ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const groups = groupContractItems(contract, assignments, progress);
  const everything = groups.flatMap(([, items]) => items);

  const visibleGroups = groups
    .map(([name, items]) => [name, items.filter((i) => matchesFilter(i.standing, filter))] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter assignments">
        {FILTERS.map(({ value, label }) => {
          const count = everything.filter((i) => matchesFilter(i.standing, value)).length;
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label} <span className="tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No assignments in this category.
        </p>
      ) : (
        visibleGroups.map(([name, items]) => {
          const allItems = groups.find(([g]) => g === name)![1];
          return (
            <section key={name} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-brand">{name}</h4>
                <GroupSummary
                  items={allItems}
                  requirement={contract.categoryRequirements?.find((cr) => cr.category === name)}
                />
              </div>
              <BreakdownRows items={items} renderAction={renderAction} />
            </section>
          );
        })
      )}
    </div>
  );
}
