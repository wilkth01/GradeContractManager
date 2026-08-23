/**
 * Composes the per-student grade contract update message.
 *
 * The body is generated from the same evaluation that drives the student's own
 * page, so a message can never tell a student something different from what
 * they see when they log in.
 *
 * Pure: no I/O, no Canvas, no formatting decisions that depend on a browser.
 */
import type { Standing, ContractResult } from "./contract-evaluation";
import { formatAbsences } from "./contract-evaluation";

export interface MessageRecipient {
  studentId: number;
  fullName: string;
}

export interface MessageOptions {
  className: string;
  /** Optional paragraph after the greeting, e.g. a deadline reminder. */
  intro?: string;
  /** Optional sign-off. Defaults to nothing rather than inventing a name. */
  signature?: string;
  /** Absence total, already imported. */
  absences: number;
}

export interface ComposedMessage {
  studentId: number;
  studentName: string;
  subject: string;
  body: string;
}

/**
 * First name from a stored full name, handling both "Last, First" and
 * "First Last". Falls back to the whole string rather than guessing wrong.
 */
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";

  if (trimmed.includes(",")) {
    const after = trimmed.split(",")[1]?.trim() ?? "";
    return after.split(/\s+/)[0] || trimmed;
  }
  return trimmed.split(/\s+/)[0];
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "revise 2 items, complete 1 more item, and reach a 3.5 average." */
function joinNeeds(items: string[]): string {
  if (items.length === 0) return "You are already there.";
  if (items.length === 1) return sentenceCase(items[0]) + ".";
  return sentenceCase(items.slice(0, -1).join(", ") + ", and " + items[items.length - 1]) + ".";
}

function currentStandingLines(standing: Standing, absences: number): string[] {
  const lines: string[] = [];
  const chosen = standing.chosen;

  if (chosen) {
    for (const req of chosen.requirements) {
      if (req.kind === "absences") continue; // reported separately below
      lines.push(`  ${req.label}: ${req.detail}${req.met ? " \u2713" : ""}`);
    }
  }

  lines.push(`  Absences: ${formatAbsences(absences)}`);
  return lines;
}

function needsBlock(results: ContractResult[]): string {
  // Easiest tier first, so a student who is behind sees the reachable goal
  // before the aspirational one.
  return [...results]
    .reverse()
    .map((result) => {
      const needs = joinNeeds(result.actionable);
      const notes = result.informational.length
        ? `\n    (Note: ${result.informational.join("; ")}.)`
        : "";
      return `  ${result.grade} contract:\n    ${needs}${notes}`;
    })
    .join("\n\n");
}

function penaltyNote(standing: Standing, absences: number): string {
  if (standing.penalty === "failure") {
    return (
      `\nOn absences: I have you recorded at ${formatAbsences(absences)}. Under this course's ` +
      `attendance policy that means automatic failure regardless of contract, so please come ` +
      `see me as soon as you can so we can talk about where things stand.\n`
    );
  }
  if (standing.penalty === "letter-reduction") {
    return (
      `\nOn absences: I have you recorded at ${formatAbsences(absences)}. Under this course's ` +
      `attendance policy that reduces the final grade by one letter regardless of contract. ` +
      `If you have already been in touch with me about these, you can disregard this.\n`
    );
  }
  return "";
}

/**
 * Compose one student's update.
 *
 * Wording is deliberately neutral about submission state ("complete N more"
 * rather than "submit N more"), because the app tracks three states and cannot
 * tell submitted-but-ungraded work apart from work never started. Telling a
 * student to submit something they already turned in is the failure mode worth
 * avoiding.
 */
export function composeContractMessage(
  recipient: MessageRecipient,
  standing: Standing,
  options: MessageOptions
): ComposedMessage {
  const first = firstNameOf(recipient.fullName);
  const intro = options.intro?.trim();

  const verdict = standing.chosen
    ? standing.chosen.met
      ? `You are currently meeting your Grade ${standing.chosen.grade} contract.`
      : `You are not yet meeting your Grade ${standing.chosen.grade} contract.`
    : "You have not selected a grade contract yet.";

  const earning =
    standing.penalty === "failure"
      ? ""
      : standing.effectiveGrade
        ? ` On your current record you are earning a ${standing.effectiveGrade}.`
        : " On your current record you are not yet meeting any contract in this class.";

  const sections = [
    `Hi ${first},`,
    intro ? intro : `This is your grade contract update for ${options.className}.`,
    verdict + earning,
    "Your current totals:\n" + currentStandingLines(standing, options.absences).join("\n"),
    "What you need to reach each contract level:\n\n" + needsBlock(standing.all),
  ];

  const note = penaltyNote(standing, options.absences);
  if (note) sections.push(note.trim());

  sections.push("I'm happy to answer questions or help however I can \u2014 just reach out.");
  if (options.signature?.trim()) sections.push(options.signature.trim());

  return {
    studentId: recipient.studentId,
    studentName: recipient.fullName,
    subject: `${options.className} \u2014 Grade Contract Update`,
    body: sections.join("\n\n"),
  };
}
