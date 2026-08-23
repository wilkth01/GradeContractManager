import { describe, it, expect } from "vitest";
import { composeContractMessage, firstNameOf } from "../contract-messages";
import { evaluateStanding, type EvaluationContract, type EvaluationAssignment } from "../contract-evaluation";
import { AssignmentStatus } from "../constants";

describe("firstNameOf", () => {
  it("handles both name orders the roster uses", () => {
    expect(firstNameOf("Bowens Jr., William")).toBe("William");
    expect(firstNameOf("William Bowens")).toBe("William");
    expect(firstNameOf("Carroll-Kaplan, Hunter W")).toBe("Hunter");
  });

  it("falls back rather than guessing on odd input", () => {
    expect(firstNameOf("Cher")).toBe("Cher");
    expect(firstNameOf("")).toBe("");
  });
});

const logs: EvaluationAssignment[] = Array.from({ length: 8 }, (_, i) => ({
  id: 100 + i,
  name: `Discussion Log ${i + 1}`,
  moduleGroup: "Discussion Logs",
  scoringType: "status",
  dueDate: "2026-06-01",
}));

const contracts: EvaluationContract[] = [
  { id: 1, grade: "A", assignments: logs.map(a => ({ id: a.id })),
    categoryRequirements: [{ category: "Discussion Logs", required: 7 }], maxAbsences: 2 },
  { id: 2, grade: "B", assignments: logs.map(a => ({ id: a.id })),
    categoryRequirements: [{ category: "Discussion Logs", required: 5 }], maxAbsences: 3 },
  { id: 3, grade: "C", assignments: logs.map(a => ({ id: a.id })),
    categoryRequirements: [{ category: "Discussion Logs", required: 3 }], maxAbsences: 4 },
];

const NOW = new Date("2026-07-01T12:00:00Z");

function standingWith(completed: number, absences: number, policy = {}) {
  return evaluateStanding({
    contracts,
    chosenContractId: 1,
    assignments: logs,
    progress: logs.slice(0, completed).map(a => ({
      assignmentId: a.id,
      status: AssignmentStatus.COMPLETE,
    })),
    participationSessions: 0,
    absences,
    policy,
    now: NOW,
  });
}

describe("composeContractMessage", () => {
  const options = { className: "PHIL 352", absences: 1 };

  it("greets by first name and states the verdict", () => {
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Bowens Jr., William" },
      standingWith(5, 1),
      options
    );

    expect(msg.body).toContain("Hi William,");
    expect(msg.body).toContain("not yet meeting your Grade A contract");
    expect(msg.body).toContain("you are earning a B");
  });

  it("lists the easiest tier first", () => {
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standingWith(2, 0),
      options
    );

    const c = msg.body.indexOf("C contract:");
    const b = msg.body.indexOf("B contract:");
    const a = msg.body.indexOf("A contract:");
    expect(c).toBeGreaterThan(-1);
    expect(c).toBeLessThan(b);
    expect(b).toBeLessThan(a);
  });

  it("says a tier is already met rather than listing nothing", () => {
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standingWith(8, 0),
      options
    );

    expect(msg.body).toContain("You are already there.");
  });

  it("never tells a student to submit work, only to complete it", () => {
    // Three states cannot distinguish submitted-but-ungraded from never
    // started, so the wording must not assume.
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standingWith(1, 0),
      options
    );

    expect(msg.body.toLowerCase()).not.toContain("submit");
  });

  it("explains an absence penalty without asking the student to fix it", () => {
    const standing = standingWith(8, 6, {
      absencePenaltyThreshold: 6,
      absenceFailureThreshold: 8,
    });
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standing,
      { ...options, absences: 6 }
    );

    expect(msg.body).toContain("reduces the final grade by one letter");
    expect(msg.body).not.toContain("bring your absences");
  });

  it("warns plainly at the failure threshold", () => {
    const standing = standingWith(8, 9, {
      absencePenaltyThreshold: 6,
      absenceFailureThreshold: 8,
    });
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standing,
      { ...options, absences: 9 }
    );

    expect(msg.body).toContain("automatic failure");
    expect(msg.body).not.toContain("you are earning");
  });

  it("uses the instructor's own intro and sign-off when given", () => {
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standingWith(5, 1),
      { ...options, intro: "Last week of the term.", signature: "Best,\nProf. Wilk" }
    );

    expect(msg.body).toContain("Last week of the term.");
    expect(msg.body.trimEnd().endsWith("Prof. Wilk")).toBe(true);
  });

  it("does not invent a signature when none is given", () => {
    const msg = composeContractMessage(
      { studentId: 1, fullName: "Test Student" },
      standingWith(5, 1),
      options
    );

    expect(msg.body).not.toContain("Prof.");
    expect(msg.body).not.toContain("Best,");
  });
});
