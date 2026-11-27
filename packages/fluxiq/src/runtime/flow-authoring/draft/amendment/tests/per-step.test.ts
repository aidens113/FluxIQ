// A decision's edits are atomic per step, not per decision (t1069). The way-to-a-page guard puts a
// stranding drop back and says so; the drops on other steps still apply (answer-first `dropped-act`).
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

const HOME = "https://example.test/";
const LIST = "https://example.test/list/";

function step(n: number, page: string, kind: "press" | "read" = "press"): AutomationStudioFlowDraftStep {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: kind === "read" ? "extract_list" : "press", input: { n },
    effect: kind === "read" ? "observe" : "mutate", effectApplied: true, ...(kind === "read" ? { proposes: true } : {}),
    disposition: "kept", replay: { from: { location: page } }
  };
}

describe("a decision whose edits are refused on one step only", () => {
  it("puts back a stranding drop and still applies the drops on other steps", () => {
    // 1 home, 2 and 3 on home, 4 goes to the list (the only way to 5's page), 5 reads the list.
    const draft = [step(1, HOME), step(2, HOME), step(3, HOME), step(4, HOME), step(5, LIST, "read")];
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "drop" }, { step: 4, change: "drop" }, { step: 3, change: "drop" }]);
    expect(report.refused).toEqual([{ step: 4, reason: "strands_a_step", strands: 5 }]);
    expect(report.applied).toBe(2);
    expect(draft.map((entry) => entry.disposition)).toEqual(["kept", "dropped", "dropped", "kept", "kept"]);
  });

  it("applies none of the edits on a step that has one refused, and all of those on another", () => {
    const draft = [step(1, HOME), step(2, HOME), step(3, HOME)];
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 9, change: "drop" }, { step: 2, change: "drop" }, { step: 2, change: "keep", act: "a1" }]);
    expect(report.refused.map((entry) => entry.reason)).toEqual(["no_such_step"]);
    expect(report.applied).toBeGreaterThanOrEqual(1);
  });

  it("leaves no trace of a struck drop on another step: the toggle's on half is not taken out", () => {
    const draft = [step(1, HOME), step(2, HOME), step(3, HOME)];
    draft[0]!.toggle = { key: "t940", to: "off" };
    draft[2]!.toggle = { key: "t940", to: "on" };
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }, { step: 1, change: "repeat", over: 99 }]);
    expect(report.applied).toBe(0);
    expect(report.refused.length).toBeGreaterThan(0);
    expect(draft.map((entry) => entry.disposition)).toEqual(["kept", "kept", "kept"]);
    expect(draft[2]!.cancels).toBeUndefined();
  });

  it("leaves no trace of a struck keep on another step: the opener it brought stays out", () => {
    const draft = [step(1, HOME), step(2, HOME), step(3, LIST, "read")];
    draft[1]!.disposition = "dropped";
    draft[2]!.disposition = "taken";
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "keep" }, { step: 3, change: "repeat", over: 99 }]);
    expect(report.applied).toBe(0);
    expect(draft.map((entry) => entry.disposition)).toEqual(["kept", "dropped", "taken"]);
  });
});

