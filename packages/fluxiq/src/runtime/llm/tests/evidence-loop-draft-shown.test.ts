// What the record says about the draft the model was shown.
//
// Since 2026-09-30 the draft is always shown whole: every step, every argument,
// the full guidance, with no byte budget (`../../flow-draft/entry.ts`). The row
// still says what the decision saw, so a reader of a run can confirm it.

import { describe, expect, it, vi } from "vitest";
// This directory's barrel first, and deliberately: `runtime/loop-limits/`
// imports back into it, so reached before it this file evaluates
// `deepseek/system-prompt.ts` while the module it reads a function out of is
// still evaluating, and the suite fails to collect at all. It is the cycle
// `scripts/structure-audit/config.mjs` describes, and importing the barrel first
// is what `../../loop-limits/tests/` already does about it.
import { runAutomationStudioLlmEvidenceLoop } from "../index.ts";
import { resolveLimits } from "../loop-configuration.ts";
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../../loop-limits/index.ts";

const tools = [
  { toolId: "inspect", description: "Look at the target.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
const pressed = (index: number, value = "") => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}`, ...(value ? { value } : {}) } });
const complete = { kind: "complete", result: { flow: "..." } };
const pressing = async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true });

/** A run of `presses` presses and then a completion. */
async function run(presses: number, over: Record<string, unknown> = {}, value = "") {
  const decide = vi.fn();
  for (let index = 1; index <= presses; index += 1) decide.mockResolvedValueOnce(pressed(index, value));
  decide.mockResolvedValue(complete);
  const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 64, maxToolCalls: 64, executeTool: pressing, ...over });
  return { result, decide };
}

describe("what the record says about the draft the model was shown", () => {
  it("says the entry's size and how much guidance it carried, on every row of the decision that saw it", async () => {
    const { result } = await run(3);
    expect(result.ok).toBe(true);
    // The first decision is made before anything has been run, so it is shown no
    // draft -- which is the one thing absence may now mean.
    expect(result.trace.map((row) => row.draft?.steps)).toEqual([undefined, 1, 2, 3]);
    const third = result.trace[3]?.draft;
    expect(third).toMatchObject({ steps: 3, budget: third!.bytes });
    for (const legacy of ["unlisted", "withoutInput", "inputTooLarge", "overBudget", "budgetBelowFloor"]) expect(third).not.toHaveProperty(legacy);
    expect(third?.instructionBytes).toBeGreaterThan(1_000);
    // The size is the entry's own, not an estimate: it grows with the record.
    expect(third!.bytes).toBeGreaterThan(result.trace[1]!.draft!.bytes);
  });

  // A draft far past the 4,000 bytes it used to be held to is still shown whole.
  it("shows a long draft with large arguments whole: every step, every argument, the full telling", async () => {
    const { result, decide } = await run(40, {}, "v".repeat(2_000));
    expect(result.ok).toBe(true);
    const last = result.trace.at(-1)?.draft;
    expect(last?.steps).toBe(40);
    expect(last!.bytes).toBeGreaterThan(80_000);
    const shown = (decide.mock.calls.at(-1)![0] as { evidence: { toolId: string; value: { steps: { input: unknown }[]; instruction: string } }[] }).evidence;
    const draft = shown.find((entry) => entry.toolId === "core.flow_draft")!.value;
    expect(draft.steps.map((line) => line.input)).toEqual(Array.from({ length: 40 }, (_, index) => ({ target: `target.${index + 1}`, value: "v".repeat(2_000) })));
    expect(draft).not.toHaveProperty("format");
    expect(draft).not.toHaveProperty("omitted");
  });

  it("goes on deciding with a draft holding refused presses", async () => {
    let call = 0;
    const sometimesRefused = async () => {
      call += 1;
      return call % 3 === 0
        ? { kind: "llm_evidence_tool_execution", evidence: { page: "unchanged", refused: `press ${call}` }, effectApplied: false }
        : { kind: "llm_evidence_tool_execution", evidence: { page: `after ${call}` }, effectApplied: true };
    };
    const { result } = await run(10, { executeTool: sometimesRefused }, "v".repeat(240));
    expect(result.ok).toBe(true);
    expect(result.trace.at(-1)?.draft?.steps).toBe(10);
  });

  it("carries no draft for a loop that is not drafting at all", async () => {
    const { result } = await run(2, { draft: false });
    expect(result.ok).toBe(true);
    expect(result.trace.every((row) => row.draft === undefined)).toBe(true);
  });

  it("the live build profile carries no evidence or draft byte limit", () => {
    const decide = async () => complete;
    const live = automationStudioFlowBootstrapEvidenceLoopLimits({});
    expect(Object.keys(live.loop).sort()).toEqual(["budget", "maxIterations", "maxToolCalls", "minToolCalls"]);
    const limits = resolveLimits({ tools, decide, executeTool: pressing, ...live.loop });
    expect(limits).toBeDefined();
    for (const removed of ["maxEvidenceBytes", "maxEvidenceContextBytes", "toolEvidenceBytes", "draftBytes"]) expect(limits).not.toHaveProperty(removed);
  });
});
