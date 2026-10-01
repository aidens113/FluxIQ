import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function step(position: number, actionId: string, input: Record<string, string>, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...over };
}

type Entry = {
  code: string;
  format?: string;
  steps: { step: number; actionId: string; input?: unknown; inputTooLarge?: boolean; inResult: boolean; disposition: string; changed: string; replayed?: string; runs?: string; settings?: unknown }[];
  unlisted?: number;
  omitted?: string[];
  instruction: string;
};

const value = (steps: readonly AutomationStudioFlowDraftStep[]): Entry => automationStudioFlowDraftEntry({ steps })!.value as Entry;

describe("the draft entry a decision is shown", () => {
  // The failure this exists for: the evidence window kept the newest result
  // of each tool, so five presses under one tool id left one visible and the
  // built Flow kept none of the dismissals the build had actually performed.
  it("lists every changing action, however many share one action id", () => {
    const steps = [
      step(1, "press", { target: "target.1" }),
      step(2, "press", { target: "target.4" }),
      step(3, "press", { target: "target.9" }),
      step(4, "enter", { target: "target.2", value: "earbuds" }),
      step(5, "press", { target: "target.7" })
    ];
    const entry = automationStudioFlowDraftEntry({ steps });
    expect(entry?.callId).toBe(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
    const shown = entry?.value as Entry;
    expect(shown.steps.map((listed) => listed.step)).toEqual([1, 2, 3, 4, 5]);
    expect(shown.steps.every((listed) => listed.inResult)).toBe(true);
    expect(shown.steps[2]?.input).toEqual({ target: "target.9" });
    expect(shown).not.toHaveProperty("format");
  });

  // The standing decision of 2026-09-30: the draft is always shown whole. No
  // byte budget, no packed rows, no shorter guidance, no argument withheld or
  // replaced by a marker, no oldest step counted instead of listed.
  it("is the full draft however long it is: every step, every argument, the full guidance", () => {
    const steps = Array.from({ length: 200 }, (_, index) => step(index + 1, index % 2 ? "enter" : "press", { target: `target.${index}`, value: "v".repeat(2_000) }));
    const shown = value(steps);
    expect(shown.steps).toHaveLength(200);
    expect(shown.steps.map((listed) => listed.step)).toEqual(steps.map((listed) => listed.position));
    expect(shown.steps.every((listed, index) => JSON.stringify(listed.input) === JSON.stringify(steps[index]!.input))).toBe(true);
    expect(shown.steps.some((listed) => listed.inputTooLarge)).toBe(false);
    expect(shown).not.toHaveProperty("format");
    expect(shown).not.toHaveProperty("unlisted");
    expect(shown).not.toHaveProperty("omitted");
    expect(shown.instruction).toBe(value([step(1, "press", { target: "t" })]).instruction);
    expect(Buffer.byteLength(JSON.stringify(shown), "utf8")).toBeGreaterThan(400_000);
  });

  it("carries an argument of any size whole, never a marker in its place", () => {
    const shown = value([step(1, "enter", { value: "y".repeat(50_000) })]);
    expect(shown.steps[0]?.input).toEqual({ value: "y".repeat(50_000) });
    expect(shown.steps[0]?.inputTooLarge).toBeUndefined();
  });

  it("tells the model how to correct the draft and how to repeat an act per listed item", () => {
    const { instruction } = value([step(1, "press", { target: "t" })]);
    expect(instruction).toContain("amend_draft");
    expect(instruction).toMatch(/every item of a list[^.]*repeat/u);
    // Every result is shown: nothing tells the model a result may have left.
    expect(instruction).not.toMatch(/still shown|no longer shown|evicted|omitted/u);
  });

  it("preserves every non-default value on a step line", () => {
    const special = step(1, "press", { target: "target.1" }, {
      resultCode: "action.refused",
      effectApplied: false,
      disposition: "exploratory",
      replayed: { step: 1, actionId: "press", status: "changed" },
      routing: { kind: "optional" },
      settings: { attempts: 2 }
    });
    expect(value([special]).steps[0]).toEqual({
      step: 1,
      actionId: "press",
      input: { target: "target.1" },
      resultCode: "action.refused",
      changed: "no",
      // A step that did not work is shown as that, whatever it was called.
      disposition: "did_not_work",
      inResult: false,
      replayed: "changed",
      runs: "optional: the Flow carries on when this fails",
      settings: { attempts: 2 }
    });
  });

  it("says which steps the result will not contain, rather than leaving them out", () => {
    const steps = [
      step(1, "press", { target: "target.1" }, { disposition: "exploratory" }),
      step(2, "press", { target: "target.4" }, { disposition: "dropped" }),
      step(3, "press", { target: "target.9" }, { effectApplied: false, resultCode: "web.action.rejected.target_unobserved" })
    ];
    expect(value(steps).steps.map((listed) => [listed.disposition, listed.inResult, listed.changed])).toEqual([
      ["exploratory", false, "yes"],
      ["dropped", false, "yes"],
      // Not `kept`: listed so under an instruction that said every step had
      // worked, a refused press read as one still to drop or confirm.
      ["did_not_work", false, "no"]
    ]);
  });

  it("is nothing at all when the loop only looked", () => {
    expect(automationStudioFlowDraftEntry({ steps: [step(1, "inspect", {}, { effect: "observe" })] })).toBeUndefined();
    expect(automationStudioFlowDraftEntry({ steps: [] })).toBeUndefined();
  });
});
