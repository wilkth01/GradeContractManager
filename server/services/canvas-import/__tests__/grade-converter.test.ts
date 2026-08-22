/**
 * The importer writes grades straight into the gradebook, so the conversion
 * rules are worth pinning down. These were untested before the status rename.
 */
import { describe, it, expect } from "vitest";
import { GradeConverter } from "../grade-converter";
import { AssignmentStatus } from "@shared/constants";

const converter = new GradeConverter();

describe("GradeConverter.toStatus", () => {
  it("treats empty and placeholder values as missing", () => {
    for (const value of ["", "-", "unsubmitted", "n/a", "  "]) {
      expect(converter.toStatus(value, "points")).toBe(AssignmentStatus.MISSING);
    }
  });

  it("maps percentage scores across the completion threshold", () => {
    expect(converter.toStatus("70", "percentage")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("100", "percentage")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("69", "percentage")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("1", "percentage")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("0", "percentage")).toBe(AssignmentStatus.MISSING);
  });

  it("maps letter grades", () => {
    expect(converter.toStatus("A", "letter")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("B+", "letter")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("C", "letter")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("F", "letter")).toBe(AssignmentStatus.MISSING);
  });

  it("collapses the Canvas 0-3 convention onto the three states", () => {
    // 0 and 1 both displayed as Not Submitted under the old scheme.
    expect(converter.toStatus("0", "numerical_status")).toBe(AssignmentStatus.MISSING);
    expect(converter.toStatus("1", "numerical_status")).toBe(AssignmentStatus.MISSING);
    expect(converter.toStatus("2", "numerical_status")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("3", "numerical_status")).toBe(AssignmentStatus.COMPLETE);
  });

  it("falls back to missing for an out-of-range numerical status", () => {
    expect(converter.toStatus("9", "numerical_status")).toBe(AssignmentStatus.MISSING);
    expect(converter.toStatus("abc", "numerical_status")).toBe(AssignmentStatus.MISSING);
  });

  it("reads free-text statuses", () => {
    expect(converter.toStatus("Complete", "status")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("in progress", "status")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("missing", "status")).toBe(AssignmentStatus.MISSING);
  });

  it("never returns a value outside the defined states", () => {
    const inputs = ["100", "0", "A", "F", "3", "gibberish", "partial"];
    const types = ["points", "percentage", "letter", "status", "numerical_status"];
    for (const input of inputs) {
      for (const type of types) {
        const status = converter.toStatus(input, type);
        expect(Object.values(AssignmentStatus)).toContain(status);
      }
    }
  });
});

describe("GradeConverter.toNumeric", () => {
  it("scales percentages onto the 0-4 scale", () => {
    expect(converter.toNumeric("100", "percentage")).toBe(4);
    expect(converter.toNumeric("50", "percentage")).toBe(2);
    expect(converter.toNumeric("0", "percentage")).toBe(0);
  });

  it("caps at the top of the scale", () => {
    expect(converter.toNumeric("150", "percentage")).toBe(4);
  });

  it("maps letter grades onto grade points", () => {
    expect(converter.toNumeric("A", "letter")).toBe(4.0);
    expect(converter.toNumeric("B-", "letter")).toBe(2.7);
    expect(converter.toNumeric("F", "letter")).toBe(0);
  });

  it("rescales the Canvas 0-3 convention", () => {
    expect(converter.toNumeric("3", "numerical_status")).toBe(4);
    expect(converter.toNumeric("0", "numerical_status")).toBe(0);
  });
});

describe("GradeConverter.getStatusLabel", () => {
  it("uses the shared labels", () => {
    expect(GradeConverter.getStatusLabel(AssignmentStatus.COMPLETE)).toBe(
      "Successfully Completed"
    );
    expect(GradeConverter.getStatusLabel(AssignmentStatus.WORK_IN_PROGRESS)).toBe(
      "Work-in-Progress"
    );
    expect(GradeConverter.getStatusLabel(AssignmentStatus.MISSING)).toBe("Not Submitted");
  });
});

describe("numeric_scale: columns already on the portal 0-4 scale", () => {
  it("passes a Perusall score through unchanged", () => {
    // This is the case that every other grading type got wrong: as 'points' a
    // 3.5 became 0.1, and as 'numerical_status' it became 4.0.
    expect(converter.toNumeric("3.5", "numeric_scale")).toBe(3.5);
    expect(converter.toNumeric("2.5", "numeric_scale")).toBe(2.5);
    expect(converter.toNumeric("4", "numeric_scale")).toBe(4);
    expect(converter.toNumeric("0", "numeric_scale")).toBe(0);
  });

  it("clamps above the scale and reports it", () => {
    expect(converter.toNumericDetailed("4.5", "numeric_scale")).toEqual({
      value: 4,
      clamped: true,
    });
    expect(converter.toNumericDetailed("-1", "numeric_scale")).toEqual({
      value: 0,
      clamped: true,
    });
  });

  it("does not report clamping for in-range values", () => {
    expect(converter.toNumericDetailed("3.5", "numeric_scale")).toEqual({
      value: 3.5,
      clamped: false,
    });
  });

  it("treats an unparseable value as zero without claiming it clamped", () => {
    expect(converter.toNumericDetailed("", "numeric_scale")).toEqual({
      value: 0,
      clamped: false,
    });
  });

  it("reads a 0-4 column onto a status assignment by proportion", () => {
    expect(converter.toStatus("4", "numeric_scale")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("3.5", "numeric_scale")).toBe(AssignmentStatus.COMPLETE);
    expect(converter.toStatus("2", "numeric_scale")).toBe(AssignmentStatus.WORK_IN_PROGRESS);
    expect(converter.toStatus("0", "numeric_scale")).toBe(AssignmentStatus.MISSING);
  });
});
