/**
 * These are built around the real PHIL 352 contract, so the evaluator is pinned
 * to a bargain that was actually offered to students:
 *
 *   A: <=2 absences | 7 Discussion Logs SC | Perusall avg >= 3.5 | SVP #1 + #2
 *   B: <=3 absences | 5 Discussion Logs SC | Perusall avg >= 3.0 | SVP #1 + #2
 *   C: <=4 absences | 3 Discussion Logs SC | Perusall avg >= 2.5 | SVP #1
 */
import { describe, it, expect } from "vitest";
import {
  evaluateContract,
  evaluateStanding,
  absencePenaltyFor,
  reduceGrade,
  formatAbsences,
  type EvaluationAssignment,
  type EvaluationContract,
} from "../contract-evaluation";
import { AssignmentStatus } from "../constants";

const NOW = new Date("2026-07-01T12:00:00Z");
const PAST = "2026-06-01";

const discussionLogs: EvaluationAssignment[] = Array.from({ length: 11 }, (_, i) => ({
  id: 100 + i,
  name: `Discussion Log ${i + 1}`,
  moduleGroup: "Discussion Logs",
  scoringType: "status",
  dueDate: PAST,
}));

const perusall: EvaluationAssignment[] = Array.from({ length: 8 }, (_, i) => ({
  id: 200 + i,
  name: `Perusall Reading ${i + 1}`,
  moduleGroup: "Perusall Annotations",
  scoringType: "numeric",
  dueDate: PAST,
}));

const svp1: EvaluationAssignment = {
  id: 300,
  name: "Stakeholder Voice Paper #1",
  moduleGroup: "Stakeholder Voice Papers",
  scoringType: "status",
  dueDate: PAST,
};

const allAssignments = [...discussionLogs, ...perusall, svp1];

function contractA(): EvaluationContract {
  return {
    id: 1,
    grade: "A",
    assignments: [...allAssignments.map((a) => ({ id: a.id }))],
    categoryRequirements: [
      { category: "Discussion Logs", required: 7 },
      { category: "Perusall Annotations", minAverage: 3.5 },
    ],
    maxAbsences: 2,
  };
}

/** n discussion logs complete, the rest untouched. */
const logsComplete = (n: number) =>
  discussionLogs.slice(0, n).map((a) => ({
    assignmentId: a.id,
    status: AssignmentStatus.COMPLETE,
  }));

const perusallAll = (score: number) =>
  perusall.map((a) => ({ assignmentId: a.id, numericGrade: String(score) }));

const svpComplete = () => [{ assignmentId: svp1.id, status: AssignmentStatus.COMPLETE }];

describe("evaluateContract", () => {
  it("passes a student who meets every requirement", () => {
    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(4), ...svpComplete()],
      participationSessions: 0,
      absences: 2,
      now: NOW,
    });

    expect(result.met).toBe(true);
    expect(result.actionable).toEqual([]);
  });

  it("treats the absence limit as inclusive", () => {
    const base = {
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(4), ...svpComplete()],
      participationSessions: 0,
      now: NOW,
    };

    expect(evaluateContract({ ...base, absences: 2 }).met).toBe(true);
    expect(evaluateContract({ ...base, absences: 2.5 }).met).toBe(false);
  });

  it("says how many more discussion logs are needed", () => {
    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(5), ...perusallAll(4), ...svpComplete()],
      participationSessions: 0,
      absences: 0,
      now: NOW,
    });

    expect(result.met).toBe(false);
    expect(result.actionable).toContain("complete 2 more Discussion Logs items");
  });

  it("distinguishes revisable work from work not yet started", () => {
    // Three logs complete, two marked work-in-progress: reaching 7 means
    // revising the two and completing two more, not starting four from scratch.
    const progress = [
      ...logsComplete(3),
      { assignmentId: discussionLogs[3].id, status: AssignmentStatus.WORK_IN_PROGRESS },
      { assignmentId: discussionLogs[4].id, status: AssignmentStatus.WORK_IN_PROGRESS },
      ...perusallAll(4),
      ...svpComplete(),
    ];

    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress,
      participationSessions: 0,
      absences: 0,
      now: NOW,
    });

    expect(result.actionable).toContain("revise 2 work-in-progress Discussion Logs items");
    expect(result.actionable).toContain("complete 2 more Discussion Logs items");
  });

  it("reports the Perusall average against the contract threshold", () => {
    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(3), ...svpComplete()],
      participationSessions: 0,
      absences: 0,
      now: NOW,
    });

    expect(result.met).toBe(false);
    expect(result.actionable).toContain(
      "bring your Perusall Annotations average to 3.5 (currently 3.00)"
    );
  });

  it("requires every listed assignment in a group with no category rule", () => {
    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(4)],
      participationSessions: 0,
      absences: 0,
      now: NOW,
    });

    expect(result.met).toBe(false);
    expect(result.actionable).toContain("complete Stakeholder Voice Paper #1");
  });

  it("does not ask for work that is not yet due", () => {
    const future: EvaluationAssignment = { ...svp1, id: 999, name: "Final Paper", dueDate: "2026-12-01" };
    const contract = contractA();
    contract.assignments.push({ id: future.id });

    const result = evaluateContract({
      contract,
      assignments: [...allAssignments, future],
      progress: [...logsComplete(7), ...perusallAll(4), ...svpComplete()],
      participationSessions: 0,
      absences: 0,
      now: NOW,
    });

    expect(result.actionable).not.toContain("complete Final Paper");
    expect(result.informational).toContain("Final Paper is not yet due");
  });

  it("never asks a student to undo an absence", () => {
    const result = evaluateContract({
      contract: contractA(),
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(4), ...svpComplete()],
      participationSessions: 0,
      absences: 5,
      now: NOW,
    });

    expect(result.met).toBe(false);
    expect(result.actionable).toEqual([]);
    expect(result.informational.join(" ")).toContain("over the 2-absence limit");
  });

  it("counts participation sessions against the requirement", () => {
    const contract = { ...contractA(), requiredParticipationSessions: 8 };
    const result = evaluateContract({
      contract,
      assignments: allAssignments,
      progress: [...logsComplete(7), ...perusallAll(4), ...svpComplete()],
      participationSessions: 5,
      absences: 0,
      now: NOW,
    });

    expect(result.met).toBe(false);
    expect(result.actionable).toContain("participate in 3 more sessions");
  });
});

describe("absence penalties above the contract tiers", () => {
  const policy = { absencePenaltyThreshold: 6, absenceFailureThreshold: 8 };

  it("applies nothing below the first threshold", () => {
    expect(absencePenaltyFor(5.5, policy)).toBe("none");
  });

  it("reduces a letter at the first threshold", () => {
    expect(absencePenaltyFor(6, policy)).toBe("letter-reduction");
    expect(absencePenaltyFor(7.5, policy)).toBe("letter-reduction");
  });

  it("fails the course at the second", () => {
    expect(absencePenaltyFor(8, policy)).toBe("failure");
    expect(absencePenaltyFor(11, policy)).toBe("failure");
  });

  it("does nothing when the class has no policy", () => {
    expect(absencePenaltyFor(20, {})).toBe("none");
  });

  it("steps a grade down one letter", () => {
    expect(reduceGrade("A")).toBe("B");
    expect(reduceGrade("C")).toBe("D");
    expect(reduceGrade("F")).toBe("F");
  });
});

describe("evaluateStanding", () => {
  const contracts: EvaluationContract[] = [
    contractA(),
    {
      id: 2,
      grade: "B",
      assignments: allAssignments.map((a) => ({ id: a.id })),
      categoryRequirements: [
        { category: "Discussion Logs", required: 5 },
        { category: "Perusall Annotations", minAverage: 3.0 },
      ],
      maxAbsences: 3,
    },
    {
      id: 3,
      grade: "C",
      assignments: [...discussionLogs, ...perusall, svp1].map((a) => ({ id: a.id })),
      categoryRequirements: [
        { category: "Discussion Logs", required: 3 },
        { category: "Perusall Annotations", minAverage: 2.5 },
      ],
      maxAbsences: 4,
    },
  ];

  const base = {
    contracts,
    assignments: allAssignments,
    participationSessions: 0,
    now: NOW,
  };

  it("reports the highest tier met, not just the chosen one", () => {
    // Contracted for an A, but only 5 logs and a 3.0 average: that is a B.
    const standing = evaluateStanding({
      ...base,
      chosenContractId: 1,
      progress: [...logsComplete(5), ...perusallAll(3), ...svpComplete()],
      absences: 1,
    });

    expect(standing.chosen?.grade).toBe("A");
    expect(standing.chosen?.met).toBe(false);
    expect(standing.highestMet).toBe("B");
    expect(standing.effectiveGrade).toBe("B");
  });

  it("returns no tier when even the lowest is unmet", () => {
    const standing = evaluateStanding({
      ...base,
      chosenContractId: 1,
      progress: [...logsComplete(1), ...perusallAll(1)],
      absences: 0,
    });

    expect(standing.highestMet).toBeNull();
    expect(standing.effectiveGrade).toBeNull();
  });

  it("drops the earned grade a letter once absences pass the threshold", () => {
    const standing = evaluateStanding({
      ...base,
      chosenContractId: 3,
      progress: [...logsComplete(3), ...perusallAll(2.5), ...svpComplete()],
      absences: 6,
      policy: { absencePenaltyThreshold: 6, absenceFailureThreshold: 8 },
    });

    // The C contract's own limit is 4, so no tier is met on absences alone.
    expect(standing.highestMet).toBeNull();
    expect(standing.penalty).toBe("letter-reduction");
  });

  it("fails the course outright past the failure threshold", () => {
    const standing = evaluateStanding({
      ...base,
      chosenContractId: 1,
      progress: [...logsComplete(11), ...perusallAll(4), ...svpComplete()],
      absences: 8,
      policy: { absencePenaltyThreshold: 6, absenceFailureThreshold: 8 },
    });

    expect(standing.penalty).toBe("failure");
    expect(standing.effectiveGrade).toBe("F");
  });

  it("formats fractional absence totals the way Qwickly reports them", () => {
    expect(formatAbsences(7.5)).toBe("7.5");
    expect(formatAbsences(3)).toBe("3");
    expect(formatAbsences("2.00")).toBe("2");
  });
});

describe("everything is per-course", () => {
  // A second course with a completely different bargain, evaluated by the same
  // code: no PHIL 352 value may leak into the evaluator.
  const essays: EvaluationAssignment[] = Array.from({ length: 4 }, (_, i) => ({
    id: 500 + i,
    name: `Essay ${i + 1}`,
    moduleGroup: "Essays",
    scoringType: "numeric",
    dueDate: PAST,
  }));

  const otherCourseContract: EvaluationContract = {
    id: 42,
    grade: "B",
    assignments: essays.map((a) => ({ id: a.id })),
    categoryRequirements: [{ category: "Essays", required: 2, minAverage: 2.0 }],
    requiredParticipationSessions: 3,
    maxAbsences: 9,
  };

  it("uses that course's own thresholds, not PHIL 352's", () => {
    const result = evaluateContract({
      contract: otherCourseContract,
      assignments: essays,
      // Two essays at 4.0 and two past due with no grade: the zero-fill puts
      // the average at exactly the 2.0 this course requires.
      progress: essays.slice(0, 2).map((a) => ({ assignmentId: a.id, numericGrade: "4" })),
      participationSessions: 3,
      absences: 8,
      now: NOW,
    });

    // 8 absences would fail every PHIL 352 tier; here the limit is 9.
    expect(result.met).toBe(true);
    expect(result.requirements.find((r) => r.kind === "category-average")?.detail).toBe(
      "2.00 / 2.0"
    );
    expect(result.requirements.find((r) => r.kind === "absences")?.detail).toBe(
      "8 of 9 allowed"
    );
    expect(result.requirements.find((r) => r.kind === "category-count")?.detail).toBe(
      "2 of 2"
    );
  });

  it("applies each class's own absence policy", () => {
    // Generous policy: what would fail PHIL 352 is unpenalised here.
    expect(absencePenaltyFor(8, { absencePenaltyThreshold: 12, absenceFailureThreshold: 15 }))
      .toBe("none");
  });
});

describe("contract versions", () => {
  // The syllabus reserves the right to change a contract mid-semester, and it is
  // only used to reduce requirements, so a change applies to everyone on that
  // contract with no action from them.
  const v1: EvaluationContract = {
    id: 10,
    grade: "A",
    version: 1,
    assignments: discussionLogs.map((a) => ({ id: a.id })),
    categoryRequirements: [{ category: "Discussion Logs", required: 9 }],
    maxAbsences: 5,
  };
  const v2: EvaluationContract = {
    ...v1,
    id: 11,
    version: 2,
    categoryRequirements: [{ category: "Discussion Logs", required: 3 }],
  };

  const base = {
    assignments: allAssignments,
    progress: logsComplete(4),
    participationSessions: 0,
    absences: 0,
    now: NOW,
  };

  it("applies a reduced requirement to a student already on the new version", () => {
    const standing = evaluateStanding({ ...base, contracts: [v1, v2], chosenContractId: 11 });

    // v2 asks for 3 logs; four clears it.
    expect(standing.chosen?.met).toBe(true);
    expect(standing.highestMet).toBe("A");
  });

  it("gives a student still pointing at the old row the current terms", () => {
    // Nobody should be left on a superseded row, but if one is, the terms in
    // force are the reduced ones -- not the stricter ones they replaced.
    const standing = evaluateStanding({ ...base, contracts: [v1, v2], chosenContractId: 10 });

    expect(standing.chosen?.contractId).toBe(11);
    expect(standing.chosen?.met).toBe(true);
  });

  it("does not evaluate the same grade twice when versions accumulate", () => {
    const standing = evaluateStanding({ ...base, contracts: [v1, v2], chosenContractId: null });

    expect(standing.all).toHaveLength(1);
    expect(standing.all[0].contractId).toBe(11);
  });
});
