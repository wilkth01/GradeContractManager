/**
 * Turning Canvas assignments into portal assignments.
 *
 * Building a semester's worth of assignments by hand is the longest part of
 * setting a class up, and every one of them already exists in Canvas. This
 * proposes what each Canvas assignment would become; the instructor confirms
 * the list, and only then is anything created.
 */

import { MAX_NUMERIC_GRADE } from "@shared/constants";
import type { CanvasAssignment, CanvasAssignmentGroup } from "./client";

export interface AssignmentProposal {
  canvasAssignmentId: number;
  name: string;
  /** The Canvas assignment group, which is what a module group usually is. */
  moduleGroup: string;
  scoringType: "status" | "numeric";
  pointsPossible: number | null;
  dueDate: string | null;
  /** Already imported: a portal assignment in this class carries this id. */
  alreadyImported: boolean;
  /** The portal assignment holding that id, when there is one. */
  portalAssignmentId: number | null;
}

/**
 * Which of this app's two scoring types a Canvas assignment fits.
 *
 * The numeric scale here runs 0-{MAX_NUMERIC_GRADE}, so only an assignment
 * scored out of that many points or fewer can be carried across as a number --
 * a 100-point paper has no numeric representation and becomes a status
 * assignment, which is how contract grading treats it anyway.
 */
export function suggestScoringType(assignment: {
  points_possible: number | null;
  grading_type?: string;
}): "status" | "numeric" {
  if (assignment.grading_type === "pass_fail" || assignment.grading_type === "not_graded") {
    return "status";
  }

  const points = assignment.points_possible;
  if (points != null && points > 0 && points <= MAX_NUMERIC_GRADE) {
    return "numeric";
  }
  return "status";
}

/** Canvas sends a full timestamp; an assignment due date is a day. */
export function dueDateFrom(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const parsed = new Date(dueAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Describe what importing each Canvas assignment would create.
 *
 * Assignments already mapped to a portal assignment are still listed, marked,
 * so an instructor adding a few mid-semester can see at a glance what is
 * already here rather than creating a second copy of it.
 */
export function proposeAssignments(input: {
  canvasAssignments: CanvasAssignment[];
  groups: CanvasAssignmentGroup[];
  portalAssignments: { id: number; canvasAssignmentId: number | null }[];
}): AssignmentProposal[] {
  const groupName = new Map(input.groups.map((g) => [g.id, g.name]));
  const importedBy = new Map(
    input.portalAssignments
      .filter((a) => a.canvasAssignmentId != null)
      .map((a) => [a.canvasAssignmentId!, a.id])
  );

  return input.canvasAssignments.map((assignment) => ({
    canvasAssignmentId: assignment.id,
    name: assignment.name,
    moduleGroup: groupName.get(assignment.assignment_group_id) ?? "Uncategorized",
    scoringType: suggestScoringType(assignment),
    pointsPossible: assignment.points_possible,
    dueDate: dueDateFrom(assignment.due_at),
    alreadyImported: importedBy.has(assignment.id),
    portalAssignmentId: importedBy.get(assignment.id) ?? null,
  }));
}
