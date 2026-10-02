// A rerun replaces the step it names only once the rerun has worked.
//
// It used to withdraw the step first and run second, so a rerun that failed
// left the draft with neither: the step that had worked was gone and the one
// that replaced it had not happened. Where that step was the navigation to the
// start location, the Flow could no longer reach its first page, and the build
// was refused `bootstrap.cannot_reach_start_location` for it.
//
// Where the model authors its draft (the default since 2026-09-30), a rerun
// that worked takes the replaced step's place: its position, its being in the
// Flow, its acts and its routing, and every statement naming the old step names
// it (audit A1, cause 5a; `run-muog33va-96469cb2` orphaned a repeat nine times).

import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceRerunReplaced } from "../rerun-replacement.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";

const go = { toolId: "go", description: "Go somewhere.", inputSchema: { type: "object" }, effect: "mutate" as const };
const completed = { kind: "complete", result: { flow: "ready" } };
const stalled = () => new Error("stalled");
const ran = (effectApplied: boolean) => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: effectApplied }, effectApplied,
  draft: { actionId: "web.browser.navigate", proposes: effectApplied }
});
// The first call is added to the Flow as it runs; the rerun corrects it.
const decisions = () => vi.fn()
  .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "go", input: { url: "https://shop.test/" }, add: true })
  .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { url: "https://shop.test/audio" } }] })
  .mockResolvedValueOnce(completed);

describe("a rerun and the step it replaces", () => {
  it("keeps the original when the rerun's action did not take effect", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(false));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.steps.map((step) => [step.id, step.disposition, step.effectApplied])).toEqual([["d1", "kept", true], ["d2", "taken", false]]);
  });

  it("keeps the original when the rerun threw", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockRejectedValueOnce(new Error("page gone"));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "kept"], ["d2", "taken"]]);
    expect(result.steps[1]).toMatchObject({ effectApplied: false });
  });

  it("withdraws the original once the rerun worked, and the rerun stands in its place", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(true));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled } });

    // In the Flow as the original was, and at its position; the original stays listed behind it, withdrawn.
    expect(result.steps.map((step) => [step.id, step.disposition, step.position])).toEqual([["d2", "kept", 1], ["d1", "dropped", 2]]);
    expect(result.steps[0]?.input).toMatchObject({ url: "https://shop.test/audio" });
  });

  it("under the transcript rule, appends the rerun kept and drops the original, as recorded builds did", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(true));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, draftAuthoring: "transcript", unusableDecisions: { stalled } });

    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "dropped"], ["d2", "kept"]]);
  });
});

describe("a rerun taking the replaced step's place", () => {
  const step = (id: string, position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
    ({ id, position, iteration: position, actionId: "node", input: {}, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", ...over });

  it("carries the routing, and every statement naming the old step names the rerun", () => {
    // d15 lists the rows, d16 acts on each (repeat over d15), and d15 is rerun as d17.
    const steps = [
      step("d15", 1, { effect: "observe" }),
      step("d16", 2, { routing: { kind: "repeat", through: "d16", over: "d15" } }),
      step("d17", 3, { effect: "observe", disposition: "taken" })
    ];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.position, entry.disposition])).toEqual([["d17", 1, "kept"], ["d15", 2, "dropped"], ["d16", 3, "kept"]]);
    expect(steps[2]!.routing).toEqual({ kind: "repeat", through: "d16", over: "d17" });
  });

  it("carries the acts onto a rerun that changes something", () => {
    const steps = [step("d1", 1, { acts: ["a1"] }), step("d2", 2, { disposition: "taken" })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.disposition, entry.acts])).toEqual([["d2", "kept", ["a1"]], ["d1", "dropped", undefined]]);
  });

  // Live run 36: a1 named on a listing rode every later rerun of that listing,
  // and the completion check judged the listing as the act 24 times running.
  it("does not carry an act onto a rerun that only reads, and leaves it on neither step", () => {
    const steps = [step("d10", 1, { effect: "observe", acts: ["a1"] }), step("d11", 2, { effect: "observe", disposition: "taken" })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.disposition, entry.acts])).toEqual([["d11", "kept", undefined], ["d10", "dropped", undefined]]);
  });

  // The same rule where the act is named on the call itself (`../../evidence-loop.ts`):
  // a read run with act is added, and names no act.
  it("records no act on a read run with act, and records it on a press", async () => {
    const list = { toolId: "list", description: "List rows.", inputSchema: { type: "object" }, effect: "observe" as const };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "list", input: {}, act: "a1" })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "go", input: { url: "https://shop.test/" }, act: "a1" })
      .mockResolvedValueOnce(completed);
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.list", proposes: true } })
      .mockResolvedValueOnce(ran(true));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [list, go], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((entry) => [entry.id, entry.effect, entry.disposition, entry.acts])).toEqual([["d1", "observe", "kept", undefined], ["d2", "mutate", "kept", ["a1"]]]);
  });

  it("leaves a rerun of a step that was not in the Flow out of it too", () => {
    const steps = [step("d1", 1, { disposition: "taken" }), step("d2", 2, { disposition: "taken" })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.disposition])).toEqual([["d2", "taken"], ["d1", "dropped"]]);
  });
});
