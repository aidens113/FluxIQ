// A condition says how Core read its tested value on a few kept and left-out
// rows (t511). Live run `run-mv6qr7fk-77f30b49`: a bound left out
// "£72k – £80k per annum" on a number nobody showed the judges, and a bare
// pattern kept a row on the "rust" inside "Trust".
import { readAutomationStudioRecordNumber } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_READINGS_PER_SIDE, automationStudioResultConditionReadings } from "../condition-readings.ts";
import { automationStudioResultTextMatch } from "../text-match.ts";

describe("a bound says the number it compared", () => {
  it("on kept and left-out rows, as the number reader reads each value", () => {
    const lines = automationStudioResultConditionReadings({
      condition: { field: "salary", atLeast: 70000 },
      column: "salary",
      kept: [{ label: "Platform Engineer", value: "£85,000 – £100,000 a year" }],
      leftOut: [{ label: "Systems Engineer", value: "£72k – £80k per annum" }, { label: "Analyst", value: "Competitive" }]
    });
    expect(lines).toEqual([
      `kept "Platform Engineer": salary read as ${readAutomationStudioRecordNumber("£85,000 – £100,000 a year")} from "£85,000 – £100,000 a year"`,
      `left out "Systems Engineer": salary read as ${readAutomationStudioRecordNumber("£72k – £80k per annum")} from "£72k – £80k per annum"`,
      `left out "Analyst": salary read as no number from "Competitive"`
    ]);
  });

  it("says at most a few rows on each side", () => {
    const cells = Array.from({ length: 9 }, (_, index) => ({ label: `Row ${index}`, value: `${index * 10} units` }));
    const lines = automationStudioResultConditionReadings({ condition: { field: "size", atMost: 50 }, column: "size", kept: cells, leftOut: cells });
    expect(lines).toHaveLength(2 * AUTOMATION_STUDIO_RESULT_READINGS_PER_SIDE);
  });

  it("says nothing for a presence test", () => {
    expect(automationStudioResultConditionReadings({ condition: { field: "badge", is: "present" }, column: "badge", kept: [{ label: "A", value: "x" }], leftOut: [] })).toEqual([]);
  });
});

describe("a text test says the part of the text it found", () => {
  it("on a kept row, naming the longer word a match sits inside", () => {
    const lines = automationStudioResultConditionReadings({
      condition: { field: "title", matches: "Rust" },
      column: "title",
      kept: [{ label: "Trust & Safety Engineer", value: "Trust & Safety Engineer" }, { label: "Rust Developer", value: "Rust Developer" }],
      leftOut: [{ label: "Go Engineer", value: "Go Engineer" }]
    });
    expect(lines).toEqual([
      `kept "Trust & Safety Engineer": title "Trust & Safety Engineer" matched "rust" inside the word "Trust" (matches "Rust")`,
      `kept "Rust Developer": title "Rust Developer" matched "Rust" (matches "Rust")`
    ]);
  });

  it("on a left-out row for a negated test: the part that left it out", () => {
    const lines = automationStudioResultConditionReadings({
      condition: { field: "pay", matches: ["(a day|Up to)"], not: true },
      column: "pay",
      kept: [{ label: "A", value: "£90,000 a year" }],
      leftOut: [{ label: "B", value: "Up to £95,000 a year" }]
    });
    expect(lines).toEqual([`left out "B": pay "Up to £95,000 a year" matched "Up to" (matches "(a day|Up to)")`]);
  });

  it("finds a literal test case-blind, and the entry of a list that held", () => {
    expect(automationStudioResultTextMatch({ field: "name", contains: ["case", "ear tips"] }, "Spare Ear Tips")).toBe(`"Ear Tips" (contains "ear tips")`);
    expect(automationStudioResultTextMatch({ field: "name", contains: "case" }, "Bookcase oak")).toBe(`"case" inside the word "Bookcase" (contains "case")`);
    expect(automationStudioResultTextMatch({ field: "name", contains: "lamp" }, "Desk chair")).toBeUndefined();
  });
});
