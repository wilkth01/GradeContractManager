import { describe, it, expect } from "vitest";
import {
  parseContractTable,
  interpretTable,
  interpretRow,
  buildContractDrafts,
  matchTarget,
  decodeEntities,
  type InterpretationContext,
} from "../contract-import";

// The real PHIL 350 summary table, pasted exactly as it appears in the syllabus.
const SYLLABUS_TABLE = `
<h2 style="font-size:16px;color:#1a3a5c;margin:26px 0 10px;">Summary of obligations by tier</h2>
<table class="p350-table">
  <tr><th>Requirement</th><th class="ctr">A</th><th class="ctr">B</th><th class="ctr">C</th></tr>
  <tr><td>Absences allowed (of 42 sessions)</td><td class="ctr">2</td><td class="ctr">3</td><td class="ctr">4</td></tr>
  <tr><td>Hypothesis average (out of 4)</td><td class="ctr">3.5</td><td class="ctr">3</td><td class="ctr">2.5</td></tr>
  <tr><td>Discussion Logs Successfully Completed</td><td class="ctr">10 of 13</td><td class="ctr">8 of 13</td><td class="ctr">7 of 13</td></tr>
  <tr><td>WA1 Quotation Bank</td><td class="ctr">Required</td><td class="ctr">Required</td><td class="ctr">Required</td></tr>
  <tr><td>Writing Assignment 1</td><td class="ctr">Required</td><td class="ctr">Required</td><td class="ctr">Required</td></tr>
  <tr><td>WA2 Quotation Bank</td><td class="ctr">Required</td><td class="ctr">Required</td><td class="ctr">Required</td></tr>
  <tr><td>Writing Assignment 2</td><td class="ctr">Required</td><td class="ctr">Required</td><td class="ctr">Required</td></tr>
  <tr><td>Post-Writing Reflection</td><td class="ctr">Required</td><td class="ctr">&mdash;</td><td class="ctr">&mdash;</td></tr>
</table>
`;

/** A class whose assignments match the table above. */
function buildContext(): InterpretationContext {
  const assignments: InterpretationContext["assignments"] = [];
  let id = 1;

  for (let i = 1; i <= 13; i++) {
    assignments.push({ id: id++, name: `Discussion Log ${i}`, moduleGroup: "Discussion Logs" });
  }
  for (let i = 1; i <= 12; i++) {
    assignments.push({ id: id++, name: `Reading ${i}`, moduleGroup: "Hypothesis" });
  }
  for (const name of [
    "WA1 Quotation Bank",
    "Writing Assignment 1",
    "WA2 Quotation Bank",
    "Writing Assignment 2",
    "Post-Writing Reflection",
  ]) {
    assignments.push({ id: id++, name, moduleGroup: "Writing" });
  }

  return { categories: ["Discussion Logs", "Hypothesis", "Writing"], assignments };
}

describe("parseContractTable", () => {
  it("reads the grade columns and every requirement row", () => {
    const table = parseContractTable(SYLLABUS_TABLE);

    expect(table.grades).toEqual(["A", "B", "C"]);
    expect(table.rows).toHaveLength(8);
    expect(table.rows[0].label).toBe("Absences allowed (of 42 sessions)");
    expect(table.rows[0].cells).toEqual(["2", "3", "4"]);
    expect(table.warnings).toEqual([]);
  });

  it("decodes the entities a pasted table actually contains", () => {
    const table = parseContractTable(SYLLABUS_TABLE);
    const reflection = table.rows.find((r) => r.label === "Post-Writing Reflection");

    // An em dash, not a literal "&mdash;" -- the difference between "not
    // required at this tier" and an unreadable cell.
    expect(reflection?.cells).toEqual(["Required", "—", "—"]);
    expect(decodeEntities("A &amp; B &#8212; C")).toBe("A & B — C");
  });

  it("refuses markup with no table rather than inventing one", () => {
    expect(() => parseContractTable("<p>Absences: 2</p>")).toThrow(/No <table>/);
  });

  it("reports a row whose value count does not match the header", () => {
    const table = parseContractTable(
      "<table><tr><th>Requirement</th><th>A</th><th>B</th></tr>" +
        "<tr><td>Absences allowed</td><td>2</td></tr></table>"
    );
    expect(table.rows[0].cells).toEqual(["2", ""]);
    expect(table.warnings[0]).toMatch(/1 value for 2 grade columns/);
  });
});

describe("interpretRow", () => {
  const context = buildContext();

  it("reads an absence row as the absence limit, not a session count", () => {
    const table = parseContractTable(SYLLABUS_TABLE);
    const row = interpretRow(table.rows[0], context);

    // The label mentions sessions in its parenthetical; absences wins.
    expect(row.kind).toBe("absences");
    expect(row.numbers).toEqual([2, 3, 4]);
  });

  it("reads an average row and finds its module group", () => {
    const table = parseContractTable(SYLLABUS_TABLE);
    const row = interpretRow(table.rows[1], context);

    expect(row.kind).toBe("category-average");
    expect(row.category).toBe("Hypothesis");
    expect(row.confidence).toBe("exact");
    expect(row.numbers).toEqual([3.5, 3, 2.5]);
  });

  it("reads an N of M row as a category count and keeps the stated total", () => {
    const table = parseContractTable(SYLLABUS_TABLE);
    const row = interpretRow(table.rows[2], context);

    expect(row.kind).toBe("category-count");
    expect(row.category).toBe("Discussion Logs");
    expect(row.numbers).toEqual([10, 8, 7]);
    expect(row.totals).toEqual([13, 13, 13]);
  });

  it("reads a Required/dash row as a named assignment, per tier", () => {
    const table = parseContractTable(SYLLABUS_TABLE);
    const row = interpretRow(table.rows[7], context);

    expect(row.kind).toBe("assignment");
    expect(row.confidence).toBe("exact");
    expect(row.required).toEqual([true, false, false]);
    expect(
      context.assignments.find((a) => a.id === row.assignmentId)?.name
    ).toBe("Post-Writing Reflection");
  });

  it("asks rather than guesses when a plain integer row names nothing known", () => {
    const row = interpretRow(
      { label: "Widgets produced", cells: ["6", "4", "2"] },
      context
    );

    expect(row.kind).toBe("unknown");
    expect(row.warnings[0]).toMatch(/count or an average/);
  });

  it("flags an assignment row that matches nothing in the class", () => {
    const row = interpretRow(
      { label: "Capstone Portfolio", cells: ["Required", "Required", "—"] },
      context
    );

    expect(row.kind).toBe("assignment");
    expect(row.assignmentId).toBeNull();
    expect(row.warnings[0]).toMatch(/No assignment in this class matches/);
  });
});

describe("matchTarget", () => {
  const groups = [
    { key: "Hypothesis", label: "Hypothesis Annotations" },
    { key: "Discussion Logs", label: "Discussion Logs" },
  ];

  it("prefers an exact name", () => {
    expect(matchTarget("discussion logs", groups)).toEqual({
      key: "Discussion Logs",
      confidence: "exact",
    });
  });

  it("accepts containment as close, not exact", () => {
    expect(matchTarget("hypothesis", groups)).toEqual({
      key: "Hypothesis",
      confidence: "close",
    });
  });

  it("returns nothing rather than the least-bad option", () => {
    expect(matchTarget("final unessay", groups)).toEqual({ key: null, confidence: "none" });
  });
});

describe("buildContractDrafts", () => {
  const context = buildContext();

  function build() {
    const table = parseContractTable(SYLLABUS_TABLE);
    const rows = interpretTable(table, context);
    return { table, ...buildContractDrafts(table, rows, context) };
  }

  it("produces one contract per grade column", () => {
    const { drafts } = build();
    expect(drafts.map((d) => d.grade)).toEqual(["A", "B", "C"]);
  });

  it("carries each tier's own absence limit and category rules", () => {
    const { drafts } = build();
    const [a, b, c] = drafts;

    expect(a.maxAbsences).toBe(2);
    expect(b.maxAbsences).toBe(3);
    expect(c.maxAbsences).toBe(4);

    expect(a.categoryRequirements).toEqual(
      expect.arrayContaining([
        { category: "Hypothesis", minAverage: 3.5 },
        { category: "Discussion Logs", required: 10 },
      ])
    );
    expect(c.categoryRequirements).toEqual(
      expect.arrayContaining([
        { category: "Hypothesis", minAverage: 2.5 },
        { category: "Discussion Logs", required: 7 },
      ])
    );
  });

  it("pools every member of a counted group, not just the required number", () => {
    const { drafts } = build();
    const logIds = context.assignments
      .filter((a) => a.moduleGroup === "Discussion Logs")
      .map((a) => a.id);

    // "10 of 13" means all thirteen are candidates; naming ten of them would
    // instead pick which ten, which is a different bargain.
    for (const id of logIds) {
      expect(drafts[0].assignments.map((x) => x.id)).toContain(id);
    }
  });

  it("drops an assignment from the tiers where the table shows a dash", () => {
    const { drafts } = build();
    const reflection = context.assignments.find((a) => a.name === "Post-Writing Reflection")!;

    expect(drafts[0].assignments.map((x) => x.id)).toContain(reflection.id);
    expect(drafts[1].assignments.map((x) => x.id)).not.toContain(reflection.id);
    expect(drafts[2].assignments.map((x) => x.id)).not.toContain(reflection.id);
  });

  it("says nothing when the table and the class agree", () => {
    const { warnings } = build();
    expect(warnings).toEqual([]);
  });

  it("reports a stated total that the class does not actually have", () => {
    const thin: InterpretationContext = {
      categories: ["Discussion Logs"],
      assignments: [
        { id: 1, name: "Discussion Log 1", moduleGroup: "Discussion Logs" },
        { id: 2, name: "Discussion Log 2", moduleGroup: "Discussion Logs" },
      ],
    };
    const table = parseContractTable(
      "<table><tr><th>Requirement</th><th>A</th></tr>" +
        "<tr><td>Discussion Logs Successfully Completed</td><td>10 of 13</td></tr></table>"
    );
    const { warnings } = buildContractDrafts(table, interpretTable(table, thin), thin);

    expect(warnings.join(" ")).toMatch(/says 13 in Discussion Logs, but this class has 2/);
    expect(warnings.join(" ")).toMatch(/needs 10 from Discussion Logs/);
  });

  it("warns when a named assignment sits inside a group the table also counts", () => {
    const overlapping: InterpretationContext = {
      categories: ["Discussion Logs"],
      assignments: [
        { id: 1, name: "Discussion Log 1", moduleGroup: "Discussion Logs" },
        { id: 2, name: "Discussion Log 2", moduleGroup: "Discussion Logs" },
      ],
    };
    const table = parseContractTable(
      "<table><tr><th>Requirement</th><th>A</th></tr>" +
        "<tr><td>Discussion Logs Successfully Completed</td><td>1 of 2</td></tr>" +
        "<tr><td>Discussion Log 1</td><td>Required</td></tr></table>"
    );
    const { warnings } = buildContractDrafts(table, interpretTable(table, overlapping), overlapping);

    expect(warnings.join(" ")).toMatch(/The group rule wins/);
  });

  it("reads a participation row into the session requirement", () => {
    const table = parseContractTable(
      "<table><tr><th>Requirement</th><th>A</th><th>B</th></tr>" +
        "<tr><td>Participation sessions at Active or above</td><td>20</td><td>15</td></tr></table>"
    );
    const rows = interpretTable(table, context);
    expect(rows[0].kind).toBe("participation");

    const { drafts } = buildContractDrafts(table, rows, context);
    expect(drafts[0].requiredParticipationSessions).toBe(20);
    expect(drafts[1].requiredParticipationSessions).toBe(15);
  });
});
