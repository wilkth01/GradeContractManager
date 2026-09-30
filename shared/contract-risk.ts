/**
 * Flags students who are falling out of compliance with the contract they chose.
 *
 * Built on evaluateStanding, so the instructor's warning list, the student's own
 * page and the progress messages all agree about what a contract requires. This
 * module only adds the judgement of how worried to be.
 *
 * Pure: no I/O.
 */
import type { Standing } from "./contract-evaluation";
import { formatAbsences } from "./contract-evaluation";
import { firstNameOf } from "./contract-messages";

export type RiskLevel = "red" | "yellow";

/** More absences than this gets called out next to a flagged student. */
export const ABSENCE_HIGHLIGHT_THRESHOLD = 2;

/** Items short at or beyond this many is red rather than yellow. */
export const RED_SHORTFALL = 2;

export interface RiskAssessment {
  /** Null when the student is compliant, or has no contract to be held to. */
  level: RiskLevel | null;
  /** Why they are flagged, for the instructor. */
  reasons: string[];
  /** What the student must do to get back into compliance. */
  steps: string[];
  /** The contract they chose. */
  contractGrade: string | null;
  /** The highest contract they currently meet, when it is not the one chosen. */
  currentlyMeets: string | null;
  overAbsenceLimit: boolean;
  /** More than ABSENCE_HIGHLIGHT_THRESHOLD absences recorded. */
  manyAbsences: boolean;
}

/**
 * How far into the danger zone a student is.
 *
 * Red: something that cannot be repaired by doing the work (over the contract's
 * absence limit, or an attendance-policy penalty), a graded average that is out
 * of reach even with top marks from here, or two or more required items missed.
 *
 * Yellow: one item missed, an average below its bar but still recoverable, or
 * absences sitting exactly at the limit so the next one breaks the contract.
 *
 * Work that is not yet due, or not yet graded for anyone, never counts against
 * a student. Mid-semester, most people have unmet requirements; only the ones
 * that are actually behind are flagged.
 */
export function assessRisk(standing: Standing, absences: number): RiskAssessment {
  const chosen = standing.chosen;
  const manyAbsences = absences > ABSENCE_HIGHLIGHT_THRESHOLD;

  if (!chosen) {
    return {
      level: null,
      reasons: [],
      steps: [],
      contractGrade: null,
      currentlyMeets: null,
      overAbsenceLimit: false,
      manyAbsences,
    };
  }

  const reasons: string[] = [];
  const steps: string[] = [];
  let shortfall = 0;
  let red = false;
  let yellow = false;
  let overAbsenceLimit = false;

  for (const req of chosen.requirements) {
    if (req.kind === "absences") {
      if (!req.met) {
        overAbsenceLimit = true;
        red = true;
        reasons.push(`Over the absence limit (${req.detail})`);
      } else if (req.atLimit) {
        yellow = true;
        reasons.push(`No absences to spare (${req.detail})`);
      }
      continue;
    }

    if (req.shortfall > 0) {
      shortfall += req.shortfall;
      reasons.push(
        req.unreachable
          ? `${req.label}: ${req.detail}, out of reach even with top marks from here`
          : `${req.label}: ${req.detail}`
      );
      if (req.unreachable) red = true;
    }
  }

  if (shortfall >= RED_SHORTFALL) red = true;
  else if (shortfall > 0) yellow = true;

  if (standing.penalty === "failure") {
    red = true;
    reasons.push("Absences trigger automatic failure under class policy");
  } else if (standing.penalty === "letter-reduction") {
    red = true;
    reasons.push("Absences trigger a one-letter reduction under class policy");
  }

  const level: RiskLevel | null = red ? "red" : yellow ? "yellow" : null;

  // Things to do are only worth listing for someone who is flagged. Participation
  // in particular is unmet for nearly everyone early on.
  if (level) {
    for (const req of chosen.requirements) steps.push(...req.catchUp);
  }

  return {
    level,
    reasons,
    steps,
    contractGrade: chosen.grade,
    currentlyMeets: standing.highestMet !== chosen.grade ? standing.highestMet : null,
    overAbsenceLimit,
    manyAbsences,
  };
}

/** One flagged student as the dashboard receives them. */
export interface AtRiskStudent {
  studentId: number;
  fullName: string;
  email: string | null;
  contractGrade: string;
  absences: number;
  manyAbsences: boolean;
  overAbsenceLimit: boolean;
  currentlyMeets: string | null;
  reasons: string[];
  steps: string[];
  emailSubject: string;
  emailBody: string;
}

export interface RiskEmailInput {
  fullName: string;
  className: string;
  absences: number;
  risk: RiskAssessment;
  standing: Standing;
  /** Optional sign-off. Nothing is invented when absent. */
  signature?: string;
}

/**
 * A draft the instructor can paste into an email.
 *
 * Wording stays neutral about submission ("complete", not "submit"), since the
 * app cannot tell work that was turned in but not graded from work never done.
 */
export function composeRiskEmail(input: RiskEmailInput): { subject: string; body: string } {
  const { risk, standing } = input;
  const first = firstNameOf(input.fullName);
  const paragraphs: string[] = [`Hi ${first},`];

  // A class attendance penalty can flag someone whose contract is otherwise met.
  paragraphs.push(
    standing.chosen?.met
      ? `I'm checking in about ${input.className}. Your work currently meets your ` +
          `Grade ${risk.contractGrade} contract, but there is an attendance issue I want to raise.`
      : `I'm checking in about ${input.className}. As of today you are not meeting your ` +
          `Grade ${risk.contractGrade} contract, and I want to help you get back on track.`
  );

  if (risk.steps.length > 0) {
    paragraphs.push(
      "To get back into compliance, you need to:\n" +
        risk.steps.map((step) => `  - ${step.charAt(0).toUpperCase()}${step.slice(1)}`).join("\n")
    );
  }

  if (risk.overAbsenceLimit) {
    const meets = risk.currentlyMeets
      ? ` On your current record you are meeting the Grade ${risk.currentlyMeets} contract.`
      : "";
    paragraphs.push(
      `You have ${formatAbsences(input.absences)} absences recorded, which is over the limit for ` +
        `the Grade ${risk.contractGrade} contract. Absences cannot be made up, so that part of ` +
        `the contract is no longer something you can fix with more work.${meets} ` +
        `Please come talk to me about your options.`
    );
  } else if (risk.manyAbsences) {
    paragraphs.push(
      `You also have ${formatAbsences(input.absences)} absences recorded, so please be careful ` +
        `with attendance from here.`
    );
  }

  if (standing.penalty === "failure") {
    paragraphs.push(
      "Under this course's attendance policy your recorded absences mean automatic failure " +
        "regardless of contract, so please see me as soon as you can."
    );
  } else if (standing.penalty === "letter-reduction") {
    paragraphs.push(
      "Under this course's attendance policy your recorded absences reduce the final grade by " +
        "one letter regardless of contract. If you have already been in touch with me about " +
        "these, you can disregard this."
    );
  }

  paragraphs.push("I'm happy to answer questions or help however I can — just reach out.");
  if (input.signature?.trim()) paragraphs.push(input.signature.trim());

  return {
    subject: `${input.className} — Your grade contract`,
    body: paragraphs.join("\n\n"),
  };
}
