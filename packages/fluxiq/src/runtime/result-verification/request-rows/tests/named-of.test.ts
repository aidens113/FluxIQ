// The named rows, read back from a judgement value (`judgement.judge.checkedRows`),
// as the repair loop holds them (live run `run-mux6naez-6c20f26e`, R3-3).
import { describe, expect, it } from "vitest";
import { automationStudioRequestRowsNamedOf } from "../index.ts";

describe("the named rows a judgement value carries", () => {
  it("reads the shape the judgement writes, by step or by node", () => {
    const value = [
      { step: 9, condition: "name", rows: [{ label: "Lumo Audio Drift Pro" }, { label: "Aurelle Echo", ids: ["B0J5MCMBAY"] }] },
      { nodeId: "node.s7", condition: "plus is present", rows: [{ label: "Kinetra Run" }] }
    ];
    expect(automationStudioRequestRowsNamedOf(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it("leaves out what is not of that shape and keeps the rest", () => {
    expect(automationStudioRequestRowsNamedOf(undefined)).toEqual([]);
    expect(automationStudioRequestRowsNamedOf({ step: 9 })).toEqual([]);
    expect(automationStudioRequestRowsNamedOf([
      { condition: "name", rows: [{ label: "No read" }] },
      { step: 9, condition: "name", rows: [{ label: "" }, 3, { label: "Kept", ids: [4, "B0J5MCMBAY"] }] },
      { step: 10, condition: "name", rows: [] }
    ])).toEqual([{ step: 9, condition: "name", rows: [{ label: "Kept", ids: ["B0J5MCMBAY"] }] }]);
  });
});
