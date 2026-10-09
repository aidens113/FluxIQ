import { describe, expect, it } from "vitest";
import type { AutomationStudioFactCondition, AutomationStudioFactConditionResult, AutomationStudioFactTruth } from "../fact-condition.ts";
import { automationStudioFactConditionsHold } from "../fact-conditions-hold.ts";
import { parseAutomationStudioFactConditions } from "../fact-conditions-parse.ts";

const conditions: AutomationStudioFactCondition[] = [
  { fact: "host.signedIn", op: "exists" },
  { fact: "host.dialog", op: "absent" }
];

/** A fake host answering each condition by position. */
function answers(...truths: Array<AutomationStudioFactTruth | undefined>): Array<AutomationStudioFactConditionResult | undefined> {
  return truths.map((truth, index) => (truth ? { truth, evidenceRef: `evidence-${index}`, capturedAt: 1_000 + index } : undefined));
}

describe("fact conditions", () => {
  it("hold only when every answer is true", () => {
    expect(automationStudioFactConditionsHold(conditions, answers("true", "true"))).toBe("true");
    expect(automationStudioFactConditionsHold([], [])).toBe("true");
  });

  it("never treat unknown as true, nor as false", () => {
    expect(automationStudioFactConditionsHold(conditions, answers("true", "unknown"))).toBe("unknown");
    expect(automationStudioFactConditionsHold(conditions, answers("unknown", "unknown"))).toBe("unknown");
    expect(automationStudioFactConditionsHold(conditions, answers("true"))).toBe("unknown");
    expect(automationStudioFactConditionsHold(conditions, [])).toBe("unknown");
  });

  it("are false as soon as any answer is false", () => {
    expect(automationStudioFactConditionsHold(conditions, answers("unknown", "false"))).toBe("false");
    expect(automationStudioFactConditionsHold(conditions, answers("false", "true"))).toBe("false");
  });

  it("parse stored conditions and name the malformed ones", () => {
    expect(parseAutomationStudioFactConditions(undefined, "when")).toEqual({ conditions: [], problems: [] });
    expect(parseAutomationStudioFactConditions([
      { fact: " host.count ", op: "count", value: 3 },
      { fact: "host.name", op: "equals", value: { input: "name" }, target: { ref: "t-1" } },
      { fact: "host.kind", op: "equals", value: null }
    ], "when")).toEqual({
      conditions: [
        { fact: "host.count", op: "count", value: 3 },
        { fact: "host.name", op: "equals", value: { input: "name" }, target: { ref: "t-1" } },
        { fact: "host.kind", op: "equals", value: null }
      ],
      problems: []
    });
    const bad = parseAutomationStudioFactConditions([{ fact: "", op: "exists" }, { fact: "x", op: "near" }, { fact: "x", op: "equals", value: [1] }], "when");
    expect(bad.conditions).toEqual([]);
    expect(bad.problems).toHaveLength(3);
    expect(parseAutomationStudioFactConditions({ fact: "x" }, "when").problems).toEqual(["when must be a list of fact conditions."]);
  });
});
