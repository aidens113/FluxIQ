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

    // In the Flow as the original was, and at its position; the original stays listed at the end, withdrawn, as the rerun's receipt.
    expect(result.steps.map((step) => [step.id, step.disposition, step.position, step.replacedBy])).toEqual([["d2", "kept", 1, undefined], ["d1", "dropped", 2, "d2"]]);
    expect(result.steps[0]?.input).toMatchObject({ url: "https://shop.test/audio" });
  });

  it("under the transcript rule, appends the rerun kept and drops the original, as recorded builds did", async () => {
    const executeTool = vi.fn().mockResolvedValueOnce(ran(true)).mockResolvedValueOnce(ran(true));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide: decisions(), executeTool, maxIterations: 6, maxToolCalls: 6, draftAuthoring: "transcript", unusableDecisions: { stalled } });

    expect(result.steps.map((step) => [step.id, step.disposition, step.replacedBy])).toEqual([["d1", "dropped", undefined], ["d2", "kept", undefined]]);
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
    expect(steps.map((entry) => [entry.id, entry.position, entry.disposition])).toEqual([["d17", 1, "kept"], ["d16", 2, "kept"], ["d15", 3, "dropped"]]);
    expect(steps[1]!.routing).toEqual({ kind: "repeat", through: "d16", over: "d17" });
  });

  // Read-list design (S2): a do-while names its last step twice, as through and
  // as while; a rerun of that step moves both, or the loop's check is a step
  // the Flow no longer has.
  it("moves a do-while's through and while both onto the rerun of its last step", () => {
    const steps = [
      step("d1", 1, { effect: "observe", routing: { kind: "repeat", through: "d2", while: "d2", most: 9 } }),
      step("d2", 2),
      step("d3", 3, { disposition: "taken" })
    ];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[1], { takesItsPlace: true });
    expect(steps.map((entry) => entry.id)).toEqual(["d1", "d3", "d2"]);
    expect(steps[0]!.routing).toEqual({ kind: "repeat", through: "d3", while: "d3", most: 9 });
  });

  // Live run `run-musp474o-e0ed7432`: the listing at 6 was rerun with a fixed
  // where, and its withdrawn attempt was listed just after the rerun -- so the
  // old listing became step 7 and the Confirm step 8. The model then reran
  // "step 7" with the fixed where three times, each refused changes_nothing,
  // and the round stopped. A rerun takes the replaced step's number and no
  // other number changes: the attempt moves to the end, linked to its rerun.
  it("keeps every other step's number: the attempt it replaced moves to the end, linked to the rerun", () => {
    const steps = [
      step("d5", 1),
      step("d6", 2, { effect: "observe" }),
      step("d7", 3, { routing: { kind: "repeat", through: "d7", over: "d6" } }),
      step("d18", 4, { effect: "observe", disposition: "taken" })
    ];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[1], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.position, entry.disposition, entry.replacedBy])).toEqual([
      ["d5", 1, "kept", undefined],
      ["d18", 2, "kept", undefined],
      ["d7", 3, "kept", undefined],
      ["d6", 4, "dropped", "d18"]
    ]);
    expect(steps[2]!.routing).toEqual({ kind: "repeat", through: "d7", over: "d18" });
  });

  // t244: a re-authored Flow's carried steps (`f<n>`) must each run in the build
  // before the Flow can be tested whole, and a rerun is a new step with an id of
  // its own. It stands for what the step it replaced stood for, so the written
  // Flow keeps that node -- its id and what state routing recorded on it.
  it("stands for the step it replaced, and for what that step stood for", () => {
    const signatures = { before: { page: "p1" }, after: { page: "p2" } };
    const steps = [step("f1", 1, { routeSignatures: signatures }), step("d1", 2, { disposition: "taken" })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.disposition, entry.standsFor])).toEqual([["d1", "kept", "f1"], ["f1", "dropped", undefined]]);
    expect(steps[0]!.routeSignatures).toEqual(signatures);
    // Rerun again: the newest still stands for the node the first was carried from.
    steps.push(step("d2", 3, { disposition: "taken" }));
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.find((entry) => entry.id === "d2")).toMatchObject({ disposition: "kept", standsFor: "f1", routeSignatures: signatures });
  });

  it("keeps a rerun's own route signatures over the ones it replaced", () => {
    const own = { before: { page: "fresh" } };
    const steps = [step("f1", 1, { routeSignatures: { before: { page: "old" } } }), step("d1", 2, { disposition: "taken", routeSignatures: own })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps[0]!.routeSignatures).toEqual(own);
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

  // D phase 2: the places on the named route a step said it is on
  // (`../../../flow-draft/step.ts`, `places`). Unlike an act, a read can be on
  // a place -- the listing on the Friends page is on it -- so a rerun of a read
  // keeps them too, and the withdrawn attempt keeps none, so it is never
  // counted on the route.
  it.each(["mutate", "observe"] as const)("carries the places onto a rerun that %s, and leaves none on the attempt", (effect) => {
    const steps = [step("d1", 1, { effect, places: ["r1", "r2"] }), step("d2", 2, { effect, disposition: "taken" })];
    automationStudioLlmEvidenceRerunReplaced(steps, steps[0], { takesItsPlace: true });
    expect(steps.map((entry) => [entry.id, entry.disposition, entry.places])).toEqual([["d2", "kept", ["r1", "r2"]], ["d1", "dropped", undefined]]);
  });
});
