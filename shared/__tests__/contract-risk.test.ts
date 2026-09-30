import { describe, it, expect } from "vitest";
import {
  evaluateStanding,
  type EvaluationAssignment,
  type EvaluationContract,
} from "../contract-evaluation";
import { assessRisk, composeRiskEmail } from "../contract-risk";
import { AssignmentStatus } from "../constants";

const NOW = new Date("2026-07-01T12:00:00Z");
const PAST = "2026-06-01";
const FUTURE = "2026-08-01";

const logs = (count: number, due: string): EvaluationAssignment[] =>
  Array.from({ length: count }, (_, i) => ({
    id: 100 + i,
    name: `Log ${i + 1}`,
    moduleGroup: "Logs",
    scoringType: "status",
    dueDate: due,
  }));

const readings = (count: number, due: string): EvaluationAssignment[] =>
  Array.from({ length: count }, (_, i) => ({
    id: 200 + i,
    name: `Reading ${i + 1}`,
    moduleGroup: "Readings",
    scoringType: "numeric",
    dueDate: due,
  }));

function contract(
  assignments: EvaluationAssignment[],
  overrides: Partial<EvaluationContract> = {}
): EvaluationContract {
  return {
    id: 1,
    grade: "B",
    assignments: assignments.map((a) => ({ id: a.id })),
    categoryRequirements: [
      { category: "Logs", required: 5 },
      { category: "Readings", minAverage: 3 },
    ],
    maxAbsences: 3,
    ...overrides,
  };
}

function risk(
  assignments: EvaluationAssignment[],
  progress: { assignmentId: number; status?: number; numericGrade?: string }[],
  absences = 0,
  contractOverrides: Partial<EvaluationContract> = {}
) {
  const c = contract(assignments, contractOverrides);
  const standing = evaluateStanding({
    contracts: [c],
    chosenContractId: c.id,
    assignments,
    progress,
    participationSessions: 0,
    absences,
    now: NOW,
  });
  return { standing, result: assessRisk(standing, absences) };
}

const complete = (a: EvaluationAssignment) => ({
  assignmentId: a.id,
  status: AssignmentStatus.COMPLETE,
});

describe("assessRisk", () => {
  it("does not flag work that is merely not due yet", () => {
    const all = [...logs(8, FUTURE), ...readings(4, FUTURE)];
    const { result } = risk(all, []);
    expect(result.level).toBeNull();
  });

  it("does not flag a student with nothing graded and nothing due", () => {
    const { result } = risk([...logs(5, PAST), ...readings(3, FUTURE)], logs(5, PAST).map(complete));
    expect(result.level).toBeNull();
  });

  it("is yellow when exactly one required item is out of reach", () => {
    const l = logs(6, PAST);
    // 4 done, 2 missed, 5 needed: one short.
    const { result } = risk(l, l.slice(0, 4).map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.level).toBe("yellow");
    expect(result.steps[0]).toContain("complete 1 more Logs item");
    expect(result.steps[0]).toContain("Log 5");
  });

  it("is red when two or more required items are out of reach", () => {
    const l = logs(6, PAST);
    const { result } = risk(l, l.slice(0, 3).map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.level).toBe("red");
  });

  it("counts pending work as still available", () => {
    // 3 done, 2 past due and missed, 3 not yet due: 5 is still reachable.
    const l = [...logs(5, PAST), ...logs(8, FUTURE).slice(5)];
    const { result } = risk(l, l.slice(0, 3).map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.level).toBeNull();
  });

  it("asks for a revision, not fresh work, when the missed item is in progress", () => {
    const l = logs(5, PAST);
    const progress = [
      ...l.slice(0, 4).map(complete),
      { assignmentId: l[4].id, status: AssignmentStatus.WORK_IN_PROGRESS },
    ];
    const { result } = risk(l, progress, 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.steps).toEqual(["revise 1 work-in-progress Logs item"]);
  });

  it("is yellow for an average below its bar that can still recover", () => {
    const r = [...readings(2, PAST), ...readings(6, FUTURE).slice(2)];
    const { result } = risk(
      r,
      [
        { assignmentId: r[0].id, numericGrade: "2" },
        { assignmentId: r[1].id, numericGrade: "2" },
      ],
      0,
      { categoryRequirements: [{ category: "Readings", minAverage: 3 }] }
    );
    expect(result.level).toBe("yellow");
    expect(result.steps[0]).toContain("raise your Readings average from 2.00 to 3.0");
  });

  it("is red when an average cannot be reached even with perfect remaining scores", () => {
    const r = readings(4, PAST);
    const { result } = risk(
      r,
      r.map((a) => ({ assignmentId: a.id, numericGrade: "2" })),
      0,
      { categoryRequirements: [{ category: "Readings", minAverage: 3 }] }
    );
    expect(result.level).toBe("red");
    expect(result.reasons.join(" ")).toContain("out of reach");
  });

  it("is red when over the contract's absence limit, and says what they still meet", () => {
    const l = logs(5, PAST);
    const { result } = risk(l, l.map(complete), 4, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.level).toBe("red");
    expect(result.overAbsenceLimit).toBe(true);
    expect(result.reasons[0]).toContain("Over the absence limit");
    expect(result.steps).toEqual([]);
  });

  it("is yellow when absences sit exactly at the limit", () => {
    const l = logs(5, PAST);
    const { result } = risk(l, l.map(complete), 3, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    expect(result.level).toBe("yellow");
    expect(result.reasons[0]).toContain("No absences to spare");
  });

  it("does not treat zero absences against a zero limit as at the limit", () => {
    const l = logs(2, PAST);
    const { result } = risk(l, l.map(complete), 0, {
      maxAbsences: 0,
      categoryRequirements: [],
    });
    expect(result.level).toBeNull();
  });

  it("highlights more than two absences independently of severity", () => {
    const l = logs(5, PAST);
    expect(risk(l, l.map(complete), 2).result.manyAbsences).toBe(false);
    expect(risk(l, l.map(complete), 3, { categoryRequirements: [] }).result.manyAbsences).toBe(true);
    expect(risk(l, l.map(complete), 2.5, { categoryRequirements: [] }).result.manyAbsences).toBe(true);
  });

  it("is red under a class absence penalty even if the contract is otherwise met", () => {
    const l = logs(5, PAST);
    const c = contract(l, { categoryRequirements: [{ category: "Logs", required: 5 }], maxAbsences: 20 });
    const standing = evaluateStanding({
      contracts: [c],
      chosenContractId: c.id,
      assignments: l,
      progress: l.map(complete),
      participationSessions: 0,
      absences: 6,
      policy: { absencePenaltyThreshold: 5 },
      now: NOW,
    });
    const assessed = assessRisk(standing, 6);
    expect(assessed.level).toBe("red");

    const email = composeRiskEmail({
      fullName: "Doe, Jamie",
      className: "PHIL 352",
      absences: 6,
      risk: assessed,
      standing,
    });
    expect(email.body).toContain("Your work currently meets your Grade B contract");
    expect(email.body).not.toContain("not meeting");
  });

  it("ignores students with no contract", () => {
    const l = logs(5, PAST);
    const standing = evaluateStanding({
      contracts: [contract(l)],
      chosenContractId: null,
      assignments: l,
      progress: [],
      participationSessions: 0,
      absences: 9,
      now: NOW,
    });
    expect(assessRisk(standing, 9).level).toBeNull();
  });

  it("lists participation as a need only for students already flagged", () => {
    const l = logs(6, PAST);
    const { result } = risk(l, l.slice(0, 4).map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
      requiredParticipationSessions: 10,
    });
    expect(result.steps).toContain("participate in 10 more sessions");

    const fine = risk(l, l.map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
      requiredParticipationSessions: 10,
    });
    expect(fine.result.level).toBeNull();
    expect(fine.result.steps).toEqual([]);
  });
});

describe("composeRiskEmail", () => {
  it("lists what the student needs to do", () => {
    const l = logs(6, PAST);
    const { standing, result } = risk(l, l.slice(0, 4).map(complete), 0, {
      categoryRequirements: [{ category: "Logs", required: 5 }],
    });
    const email = composeRiskEmail({
      fullName: "Doe, Jamie",
      className: "PHIL 352",
      absences: 0,
      risk: result,
      standing,
      signature: "Prof",
    });

    expect(email.subject).toBe("PHIL 352 — Your grade contract");
    expect(email.body).toContain("Hi Jamie,");
    expect(email.body).toContain("not meeting your Grade B contract");
    expect(email.body).toContain("- Complete 1 more Logs item");
    expect(email.body.endsWith("Prof")).toBe(true);
  });
});
