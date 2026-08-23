import { describe, it, expect } from "vitest";
import {
  suggestScoringType,
  dueDateFrom,
  proposeAssignments,
} from "../assignment-import";
import type { CanvasAssignment } from "../client";

function canvasAssignment(overrides: Partial<CanvasAssignment> = {}): CanvasAssignment {
  return {
    id: 1,
    name: "Assignment",
    points_possible: 100,
    assignment_group_id: 10,
    published: true,
    ...overrides,
  };
}

describe("suggestScoringType", () => {
  it("carries a 4-point reading across as a number", () => {
    // Perusall readings are the reason the numeric scale exists.
    expect(suggestScoringType({ points_possible: 4, grading_type: "points" })).toBe("numeric");
  });

  it("makes a 100-point paper a status assignment", () => {
    // The numeric scale here runs 0-4, so a 100-point score has nowhere to go.
    expect(suggestScoringType({ points_possible: 100, grading_type: "points" })).toBe("status");
  });

  it("treats a complete/incomplete assignment as status whatever it is worth", () => {
    expect(suggestScoringType({ points_possible: 1, grading_type: "pass_fail" })).toBe("status");
  });

  it("does not read an ungraded assignment as a zero-to-four score", () => {
    expect(suggestScoringType({ points_possible: 0, grading_type: "not_graded" })).toBe("status");
  });

  it("falls back to status when Canvas states no point value", () => {
    expect(suggestScoringType({ points_possible: null })).toBe("status");
  });
});

describe("dueDateFrom", () => {
  it("keeps a stated due date", () => {
    expect(dueDateFrom("2026-09-15T03:59:00Z")).toBe("2026-09-15T03:59:00.000Z");
  });

  it("reports no due date rather than inventing one", () => {
    expect(dueDateFrom(null)).toBeNull();
    expect(dueDateFrom(undefined)).toBeNull();
    expect(dueDateFrom("not a date")).toBeNull();
  });
});

describe("proposeAssignments", () => {
  const groups = [
    { id: 10, name: "Perusall Annotations" },
    { id: 20, name: "Discussion Logs" },
  ];

  it("proposes the Canvas group as the module group", () => {
    const [proposal] = proposeAssignments({
      canvasAssignments: [canvasAssignment({ id: 5, name: "Reading 1", points_possible: 4 })],
      groups,
      portalAssignments: [],
    });

    expect(proposal).toMatchObject({
      canvasAssignmentId: 5,
      name: "Reading 1",
      moduleGroup: "Perusall Annotations",
      scoringType: "numeric",
      alreadyImported: false,
      portalAssignmentId: null,
    });
  });

  it("names the group Uncategorized rather than dropping the assignment", () => {
    const [proposal] = proposeAssignments({
      canvasAssignments: [canvasAssignment({ assignment_group_id: 999 })],
      groups,
      portalAssignments: [],
    });

    expect(proposal.moduleGroup).toBe("Uncategorized");
  });

  it("marks what is already here, so a second run does not duplicate it", () => {
    const proposals = proposeAssignments({
      canvasAssignments: [
        canvasAssignment({ id: 5, name: "Reading 1" }),
        canvasAssignment({ id: 6, name: "Reading 2" }),
      ],
      groups,
      portalAssignments: [
        { id: 77, canvasAssignmentId: 5 },
        { id: 78, canvasAssignmentId: null },
      ],
    });

    expect(proposals[0]).toMatchObject({ alreadyImported: true, portalAssignmentId: 77 });
    expect(proposals[1]).toMatchObject({ alreadyImported: false, portalAssignmentId: null });
  });
});
