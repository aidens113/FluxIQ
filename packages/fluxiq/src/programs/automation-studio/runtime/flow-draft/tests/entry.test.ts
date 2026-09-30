import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function step(position: number, actionId: string, input: Record<string, string>, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...over };
}

describe("the draft entry a decision is shown", () => {
  // The failure this exists for: the evidence window keeps the newest result
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
    const entry = automationStudioFlowDraftEntry({ steps, maxBytes: 4_000 });
    expect(entry?.callId).toBe(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
    const value = entry?.value as { steps: { step: number; actionId: string; input?: unknown; inResult: boolean }[] };
    expect(value.steps.map((listed) => listed.step)).toEqual([1, 2, 3, 4, 5]);
    expect(value.steps.every((listed) => listed.inResult)).toBe(true);
    expect(value.steps[2]?.input).toEqual({ target: "target.9" });
    expect(value).not.toHaveProperty("format");
  });

  it("packs a complete draft before withholding any bounded input", () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1, "press", {
      target: `target.${index}`,
      note: "x".repeat(40)
    }));
    const ordinary = automationStudioFlowDraftEntry({ steps, maxBytes: 100_000 })!.value;
    const budget = Buffer.byteLength(JSON.stringify(ordinary), "utf8") - 1;
    const packed = automationStudioFlowDraftEntry({ steps, maxBytes: budget })!.value as PackedEntry;

    expect(packed.format).toBe("step_rows_v1");
    expect(packed.fields).toEqual([
      "step", "actionId", "input", "resultCode", "changed",
      "disposition", "inResult", "replayed", "runs", "settings"
    ]);
    expect(Buffer.byteLength(JSON.stringify(packed), "utf8")).toBeLessThanOrEqual(budget);
    expect(packed.steps).toHaveLength(12);
    expect(packed.steps.every((line) => line[2] !== null)).toBe(true);
    expect(packed).not.toHaveProperty("omitted");
    expect(automationStudioFlowDraftEntry({ steps, maxBytes: budget })!.value).toEqual(packed);
  });

  it("preserves every non-default value in a self-describing row", () => {
    const special = step(1, "press", { target: "target.1" }, {
      resultCode: "action.refused",
      effectApplied: false,
      disposition: "exploratory",
      replayed: { step: 1, actionId: "press", status: "changed" },
      routing: { kind: "optional" },
      settings: { attempts: 2 }
    });
    const steps = [special, ...Array.from({ length: 11 }, (_, index) => step(index + 2, "press", { target: `target.${index + 2}`, note: "x".repeat(40) }))];
    const ordinary = automationStudioFlowDraftEntry({ steps, maxBytes: 100_000 })!.value;
    const packed = automationStudioFlowDraftEntry({
      steps,
      maxBytes: Buffer.byteLength(JSON.stringify(ordinary), "utf8") - 1
    })!.value as PackedEntry;

    expect(packed.format).toBe("step_rows_v1");
    expect(packed.steps[0]).toEqual([
      1,
      "press",
      { target: "target.1" },
      "action.refused",
      "no",
      // A step that did not work is shown as that, whatever it was called.
      "did_not_work",
      false,
      "changed",
      "optional: the Flow carries on when this fails",
      { attempts: 2 }
    ]);
  });

  it("uses the minimal instruction once packed input withholding begins", () => {
    const steps = Array.from({ length: 5 }, (_, index) => step(index + 1, "press", { value: "x".repeat(500) }));
    const value = automationStudioFlowDraftEntry({ steps, maxBytes: 3_107 })!.value as PackedEntry;
    const minimal = (automationStudioFlowDraftEntry({ steps, maxBytes: 1 })!.value as Entry).instruction;

    expect(value.format).toBe("step_rows_v1");
    expect(value.steps.map((line) => line[2] !== null)).toEqual([false, true, true, true, true]);
    expect(value.instruction).toBe(minimal);
    expect(Buffer.byteLength(JSON.stringify(value), "utf8")).toBeLessThanOrEqual(3_107);
  });

  it("says which steps the result will not contain, rather than leaving them out", () => {
    const steps = [
      step(1, "press", { target: "target.1" }, { disposition: "exploratory" }),
      step(2, "press", { target: "target.4" }, { disposition: "dropped" }),
      step(3, "press", { target: "target.9" }, { effectApplied: false, resultCode: "web.action.rejected.target_unobserved" })
    ];
    const value = automationStudioFlowDraftEntry({ steps, maxBytes: 4_000 })?.value as { steps: { disposition: string; inResult: boolean; changed: string }[] };
    expect(value.steps.map((listed) => [listed.disposition, listed.inResult, listed.changed])).toEqual([
      ["exploratory", false, "yes"],
      ["dropped", false, "yes"],
      // Not `kept`: listed so under an instruction that said every step had
      // worked, a refused press read as one still to drop or confirm.
      ["did_not_work", false, "no"]
    ]);
  });

  it("drops arguments before it drops steps, oldest first, and counts what it could not list", () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1, "press", { target: `target.${index}`, note: "x".repeat(40) }));
    const trimmed = automationStudioFlowDraftEntry({ steps, maxBytes: 900 })?.value as Entry;
    const lines = stepLines(trimmed);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.at(-1)?.step).toBe(12);
    // Whatever had to go, the newest steps keep their arguments and no listed
    // step is missing from the middle of the run.
    expect(lines.map((listed) => listed.step)).toEqual([...lines].map((listed) => listed.step).sort((left, right) => left - right));
    const listedFrom = lines[0]!.step;
    expect(trimmed.unlisted ?? 0).toBe(listedFrom - 1);
  });

  it("is nothing at all when the loop only looked", () => {
    expect(automationStudioFlowDraftEntry({ steps: [step(1, "inspect", {}, { effect: "observe" })], maxBytes: 4_000 })).toBeUndefined();
    expect(automationStudioFlowDraftEntry({ steps: [], maxBytes: 4_000 })).toBeUndefined();
  });

  it("leaves out an argument too large to carry rather than cutting it in half, and says it did", () => {
    const value = automationStudioFlowDraftEntry({ steps: [step(1, "enter", { value: "y".repeat(900) })], maxBytes: 4_000 })?.value as { steps: { input?: unknown; inputTooLarge?: boolean }[] };
    expect(value.steps[0]?.input).toBeUndefined();
    expect(value.steps[0]?.inputTooLarge).toBe(true);
    expect(value).not.toHaveProperty("format");
  });

  it.each([1_711, 1_343])("shortens the object instruction before suppressing a bounded input or oversized marker at %i bytes", (maxBytes) => {
    const steps = [
      step(1, "enter", { value: "b".repeat(400) }),
      step(2, "enter", { value: "o".repeat(900) })
    ];
    const full = automationStudioFlowDraftEntry({ steps, maxBytes: 100_000 })!.value as Entry;
    const value = automationStudioFlowDraftEntry({ steps, maxBytes })!.value as {
      format?: string;
      steps: { input?: unknown; inputTooLarge?: boolean }[];
      instruction: string;
    };

    expect(value).not.toHaveProperty("format");
    expect(value.steps[0]?.input).toEqual({ value: "b".repeat(400) });
    expect(value.steps[1]?.inputTooLarge).toBe(true);
    expect(value.instruction.length).toBeLessThan(full.instruction.length);
    expect(Buffer.byteLength(JSON.stringify(value), "utf8")).toBeLessThanOrEqual(maxBytes);
  });

  it("preserves a rejected oldest input and bounded newest input before withholding either", () => {
    const steps = [
      step(1, "enter", { value: "o".repeat(900) }),
      step(2, "enter", { value: "b".repeat(400) })
    ];
    const value = automationStudioFlowDraftEntry({ steps, maxBytes: 1_711 })!.value as {
      steps: { input?: unknown; inputTooLarge?: boolean }[];
    };

    expect(value.steps[0]?.inputTooLarge).toBe(true);
    expect(value.steps[1]?.input).toEqual({ value: "b".repeat(400) });
  });

  // The instruction is a fixed thousand bytes that every draft pays for, so on
  // a long exploration it competes for room with the record it is guidance
  // about. The record wins: the amend_draft schema states the grammar again,
  // and nothing else states what the build ran.
  it("tells the instruction shorter before it drops a step", () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1, "press", { target: `target.${index}` }));
    const roomy = automationStudioFlowDraftEntry({ steps, maxBytes: 8_000 })?.value as Entry;
    const tight = automationStudioFlowDraftEntry({ steps, maxBytes: 1_600 })?.value as Entry;
    expect(stepLines(tight).map((listed) => listed.step)).toEqual(stepLines(roomy).map((listed) => listed.step));
    expect(tight.unlisted).toBeUndefined();
    expect(tight.instruction.length).toBeLessThan(roomy.instruction.length);
    // Shortened, not dropped: what the model cannot act without survives every
    // telling, and the entry names the guidance it is no longer carrying.
    expect(tight.instruction).toContain("amend_draft");
    expect(tight.omitted?.join(" ")).toContain("guidance");
    // Every budget from what the whole draft costs down to what one step costs:
    // a step is never dropped while there is a shorter way to say the same
    // instruction, and there is always at least one step.
    const shortest = (automationStudioFlowDraftEntry({ steps, maxBytes: 1 })?.value as Entry).instruction;
    for (let maxBytes = 2_500; maxBytes >= 400; maxBytes -= 50) {
      const value = automationStudioFlowDraftEntry({ steps, maxBytes })?.value as Entry;
      const lines = stepLines(value);
      expect(lines.length).toBeGreaterThan(0);
      if (lines.length < steps.length) expect(value.instruction).toBe(shortest);
    }
  });

  it("counts the oldest steps it could not list once the telling is as short as it goes", () => {
    const steps = Array.from({ length: 40 }, (_, index) => step(index + 1, "press", { target: `target.${index}` }));
    const value = automationStudioFlowDraftEntry({ steps, maxBytes: 900 })?.value as Entry;
    const lines = stepLines(value);
    expect(lines.at(-1)?.step).toBe(40);
    expect(lines.length).toBeLessThan(40);
    expect(value.unlisted).toBe(40 - lines.length);
    // Contiguous from the oldest it could list: the middle of a run is never
    // quietly missing.
    expect(lines.map((listed) => listed.step)).toEqual(Array.from({ length: lines.length }, (_, index) => 40 - lines.length + index + 1));
  });

  // A budget too small for the least honest entry is still not a reason to show
  // the model nothing: nothing reads as "this build has not done anything yet",
  // and a model that thinks it has no draft amends by guess.
  it("is still a draft when the budget cannot hold one", () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1, "press", { target: `target.${index}`, note: "x".repeat(200) }));
    const entry = automationStudioFlowDraftEntry({ steps, maxBytes: 1 });
    expect(entry?.callId).toBe(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
    const value = entry?.value as Entry;
    expect(stepLines(value).map((listed) => listed.step)).toEqual([12]);
    expect(value.unlisted).toBe(11);
    expect(value.instruction).toContain("amend_draft");
    expect(value.omitted?.join(" ")).toContain("argument");
    expect(value.omitted?.join(" ")).toContain("guidance");
  });

  it("keeps an oversized newest input distinguishable in the least-entry fallback", () => {
    const oversized = automationStudioFlowDraftEntry({
      steps: [step(1, "enter", { value: "o".repeat(900) })],
      maxBytes: 1
    })!.value as { steps: { input?: unknown; inputTooLarge?: boolean }[] };
    const bounded = automationStudioFlowDraftEntry({
      steps: [step(1, "enter", { value: "b" })],
      maxBytes: 1
    })!.value as { steps: { input?: unknown; inputTooLarge?: boolean }[] };

    expect(oversized.steps[0]).toMatchObject({ inputTooLarge: true });
    expect(oversized.steps[0]?.input).toBeUndefined();
    expect(bounded.steps[0]?.input).toBeUndefined();
    expect(bounded.steps[0]?.inputTooLarge).toBeUndefined();
  });
});

type Entry = {
  format?: string;
  steps: ({ step: number; input?: unknown } | unknown[])[];
  unlisted?: number;
  omitted?: string[];
  instruction: string;
};

type PackedEntry = {
  format: "step_rows_v1";
  fields: string[];
  steps: unknown[][];
  unlisted?: number;
  omitted?: string[];
  instruction: string;
};

function stepLines(value: Entry): { step: number; input?: unknown }[] {
  if (value.format === "step_rows_v1") {
    return (value.steps as unknown[][]).map((line) => ({
      step: line[0] as number,
      ...(line[2] !== null ? { input: line[2] } : {})
    }));
  }
  return value.steps as { step: number; input?: unknown }[];
}
