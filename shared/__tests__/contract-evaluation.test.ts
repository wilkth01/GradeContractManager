import { describe, it, expect } from "vitest";
import {
  assignmentStanding,
  computeCategoryAverage,
  isPastDue,
  withGradingStarted,
} from "../contract-evaluation";

const NOW = new Date("2026-03-15T12:00:00Z");
const PAST = "2026-03-01";
const FUTURE = "2026-04-01";

describe("isPastDue", () => {
  it("is false for work due later", () => {
    expect(isPastDue(FUTURE, NOW)).toBe(false);
  });

  it("is true once the due date has passed", () => {
    expect(isPastDue(PAST, NOW)).toBe(true);
  });

  it("gives the student the whole due day", () => {
    expect(isPastDue("2026-03-15", new Date("2026-03-15T23:00:00Z"))).toBe(false);
    expect(isPastDue("2026-03-15", new Date("2026-03-16T00:30:00Z"))).toBe(true);
  });

  it("does not roll the deadline back a day for non-UTC callers", () => {
    // A date-only due date is stored as UTC midnight. Resolving the end of day
    // in local time made this true a full day early west of UTC.
    expect(isPastDue("2026-03-15", new Date("2026-03-15T04:00:00Z"))).toBe(false);
  });

  it("is false when there is no due date", () => {
    expect(isPastDue(null, NOW)).toBe(false);
    expect(isPastDue(undefined, NOW)).toBe(false);
  });

  it("does not mutate the date it is given", () => {
    const due = new Date("2026-03-01T08:00:00Z");
    isPastDue(due, NOW);
    expect(due.toISOString()).toBe("2026-03-01T08:00:00.000Z");
  });
});

describe("computeCategoryAverage", () => {
  it("averages only what is graded when the rest is not yet due", () => {
    // The case that motivated this: 2 of 12 readings graded at 4.0 in week 3.
    const entries = [
      { numericGrade: "4", dueDate: PAST },
      { numericGrade: "4", dueDate: PAST },
      ...Array.from({ length: 10 }, () => ({ numericGrade: null, dueDate: FUTURE })),
    ];

    const result = computeCategoryAverage(entries, NOW);

    expect(result.average).toBe(4);
    expect(result.graded).toBe(2);
    expect(result.pending).toBe(10);
    expect(result.counted).toBe(2);
  });

  it("counts ungraded work as zero once it is past due", () => {
    const entries = [
      { numericGrade: "4", dueDate: PAST },
      { numericGrade: null, dueDate: PAST },
    ];

    const result = computeCategoryAverage(entries, NOW);

    expect(result.average).toBe(2);
    expect(result.missed).toBe(1);
    expect(result.counted).toBe(2);
  });

  it("never counts work with no due date as missed", () => {
    const result = computeCategoryAverage([{ numericGrade: null, dueDate: null }], NOW);

    expect(result.pending).toBe(1);
    expect(result.missed).toBe(0);
    expect(result.isEmpty).toBe(true);
  });

  it("reports empty rather than zero when nothing counts yet", () => {
    const result = computeCategoryAverage(
      [{ numericGrade: null, dueDate: FUTURE }],
      NOW
    );

    expect(result.isEmpty).toBe(true);
    expect(result.average).toBe(0);
  });

  it("handles a contract threshold at the boundary", () => {
    const entries = [
      { numericGrade: "4", dueDate: PAST },
      { numericGrade: "3", dueDate: PAST },
    ];

    const result = computeCategoryAverage(entries, NOW);

    // An A needs 3.5; exactly 3.5 should satisfy it.
    expect(result.average).toBe(3.5);
    expect(result.average >= 3.5).toBe(true);
  });

  it("accepts grades stored as numbers or strings", () => {
    const result = computeCategoryAverage(
      [{ numericGrade: 3.5, dueDate: PAST }, { numericGrade: "2.5", dueDate: PAST }],
      NOW
    );

    expect(result.average).toBe(3);
  });

  it("returns an empty result for an empty category", () => {
    expect(computeCategoryAverage([], NOW).isEmpty).toBe(true);
  });
});

describe("work nobody has been graded on yet", () => {
  it("leaves it out of the average instead of zeroing it", () => {
    // The Hypothesis case: four readings graded, five more past due whose
    // grades have not been pulled for anyone. The average is over four.
    const entries = [
      ...Array.from({ length: 4 }, () => ({ numericGrade: "4", dueDate: PAST, gradingStarted: true })),
      ...Array.from({ length: 5 }, () => ({ numericGrade: null, dueDate: PAST, gradingStarted: false })),
    ];

    const result = computeCategoryAverage(entries, NOW);

    expect(result.average).toBe(4);
    expect(result.counted).toBe(4);
    expect(result.awaitingGrades).toBe(5);
    expect(result.missed).toBe(0);
  });

  it("still zeroes a miss once others have been graded on it", () => {
    const result = computeCategoryAverage(
      [
        { numericGrade: "4", dueDate: PAST, gradingStarted: true },
        { numericGrade: null, dueDate: PAST, gradingStarted: true },
      ],
      NOW
    );

    expect(result.average).toBe(2);
    expect(result.missed).toBe(1);
  });

  it("treats an unknown grading state as started", () => {
    const result = computeCategoryAverage([{ numericGrade: null, dueDate: PAST }], NOW);
    expect(result.missed).toBe(1);
  });
});

describe("withGradingStarted", () => {
  it("marks an assignment once any student has a grade or status on it", () => {
    const marked = withGradingStarted(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      [
        { assignmentId: 1, numericGrade: "3.00" },
        { assignmentId: 2, status: 0 },
        { assignmentId: 3, numericGrade: null, status: null },
      ]
    );

    expect(marked.map((a) => a.gradingStarted)).toEqual([true, true, false, false]);
  });
});

describe("assignmentStanding", () => {
  const numeric = { scoringType: "numeric" as const, dueDate: PAST, gradingStarted: true };

  it("separates missing, not yet due, and not graded yet", () => {
    expect(assignmentStanding(numeric, null, NOW)).toBe("not-submitted");
    expect(assignmentStanding({ ...numeric, dueDate: FUTURE }, null, NOW)).toBe("not-yet-due");
    expect(assignmentStanding({ ...numeric, gradingStarted: false }, null, NOW)).toBe("awaiting-grades");
    expect(assignmentStanding(numeric, { numericGrade: "3.25" }, NOW)).toBe("completed");
  });

  it("takes a recorded Not Submitted at its word, even before the due date", () => {
    expect(
      assignmentStanding({ scoringType: "status", dueDate: FUTURE }, { status: 0 }, NOW)
    ).toBe("not-submitted");
    expect(
      assignmentStanding({ scoringType: "status", dueDate: FUTURE }, { status: 1 }, NOW)
    ).toBe("in-progress");
  });
});
