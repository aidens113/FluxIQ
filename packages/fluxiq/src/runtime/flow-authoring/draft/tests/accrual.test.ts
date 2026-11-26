// The loop accruing the draft, end to end: what it appends, what it shows, and
// what an amendment decision does to it.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../llm/index.ts";

const inspect = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const };
const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const tools = [inspect, press];
const stalled = () => new Error("stalled");

const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` }, add: true });

describe("the draft a build accrues", () => {
  it("keeps every action it took, with the argument it was given, in order", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.look", toolId: "inspect", input: { scope: "results" } })
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(pressed(3))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8,
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true }
        : { page: "looked" }
    });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => [step.position, step.actionId, step.input])).toEqual([
      [1, "press", { target: "target.1" }],
      [2, "inspect", { scope: "results" }],
      [3, "press", { target: "target.2" }],
      [4, "press", { target: "target.3" }]
    ]);
  });

  // Three presses share one tool id, so the window keeps one of their results.
  // The draft is placed beside the window, so all three are in front of the
  // model when it writes the Flow -- which is the whole point of it.
  it("is shown beside every result, each whole", async () => {
    const page = { markup: "z".repeat(3_000) };
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(pressed(3))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: page, effectApplied: true })
    });
    const shown = decide.mock.calls[3]?.[0].evidence as { callId: string; toolId: string; value: unknown }[];
    const draft = shown.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: { step: number; input: unknown }[] };
    expect(draft.steps.map((step) => step.input)).toEqual([{ target: "target.1" }, { target: "target.2" }, { target: "target.3" }]);
    // Every result is shown too, in call order: nothing is evicted.
    expect(shown.filter((entry) => entry.toolId === "press").map((entry) => entry.value)).toEqual([page, page, page]);
  });

  // Where the framework drafts the Flow, a step is taken out with drop (`../amendment/edits/`): exploratory is the old grammar's.
  it("lets the model take a step out of the Flow, and says so next time", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.disposition)).toEqual(["dropped", "kept"]);
    expect(result.trace.some((entry) => entry.decision === "amend_draft" && entry.resultCode === "llm_evidence_loop.draft_amended")).toBe(true);
    const shown = decide.mock.calls[3]?.[0].evidence as { toolId: string; value: unknown }[];
    const draft = shown.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: { disposition: string; inResult: boolean }[] };
    expect(draft.steps.map((step) => [step.disposition, step.inResult])).toEqual([["dropped", false], ["kept", true]]);
  });

  // The schema sits in the head of the request, so it stays as it was (t869): an edit asked before there is one to make, or once the allowance is spent, is refused.
  // No count of edits withdraws amending (t1056): editing the draft is the authoring, and the purse bounds it.
  it("offers an edit on every decision, with no allowance of edits to spend, and the schema unchanged", async () => {
    const offered: boolean[] = [];
    const decide = vi.fn(async ({ decisionSchema }: { decisionSchema: JsonObject }) => {
      const variants = decisionSchema.oneOf as { properties: { kind: { const: string } } }[];
      offered.push(variants.some((variant) => variant.properties.kind.const === "amend_draft"));
      if (offered.length > 21) throw new Error("script exhausted");
      return offered.length === 1 ? pressed(1) : { kind: "amend_draft", amendments: [{ step: 1, change: offered.length % 2 ? "keep" : "drop" }] };
    });
    const { trace } = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled }, draft: {},
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(new Set(offered)).toEqual(new Set([true]));
    // The press, then twenty edits, none refused as not on offer for an allowance spent.
    expect(trace[0]?.decision).toBe("tool_call");
    expect(trace.some((row) => row.resultCode === "llm_evidence_loop.amend_not_offered")).toBe(false);
  });

  // A live build alternated a repeated request with an edit for sixteen calls.
  // Each edit landed, each landing cleared the no-progress guard, and the guard
  // therefore never saw two repeats in a row: the build ran to its iteration
  // limit having gathered nothing new since its eleventh call.
  it("does not let an edit launder a request the loop answered from what it held", async () => {
    const repeat = { kind: "tool_call", callId: "call.look.again", toolId: "inspect", input: { scope: "results" } };
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.look", toolId: "inspect", input: { scope: "results" } })
      .mockResolvedValueOnce(repeat)
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "drop" }] })
      .mockResolvedValueOnce(repeat)
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }] })
      .mockResolvedValueOnce(repeat)
      .mockResolvedValue({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 12, maxToolCalls: 12, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true }
        : { page: "looked" }
    });
    // No count of steps without progress ends it (t1049): the model goes on to finish.
    expect(result).toMatchObject({ ok: true });
    // The edits landed all the same: they are progress on the draft, and the
    // loop neither counts them as steps without progress nor lets them clear the count.
    expect(result.steps[0]?.disposition).toBe("kept");
    expect(result.trace.filter((entry) => entry.decision === "amend_draft")).toHaveLength(2);
  });

  it("takes a state digest either side of each action when the caller offers one", async () => {
    let taken = 0;
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 4, maxToolCalls: 4,
      captureStateDigest: () => `digest.${(taken += 1) > 1 ? "after" : "before"}`,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(taken).toBe(2);
    expect(result.steps[0]).toMatchObject({ stateBefore: "digest.before", stateAfter: "digest.after" });
  });

  it("records a call whose digest could not be taken as the failure it is", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 4, maxToolCalls: 4, minToolCalls: 0, unusableDecisions: { stalled },
      captureStateDigest: () => { throw new Error("the host went away"); },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(result.steps[0]).toMatchObject({ actionId: "press", effectApplied: false, resultCode: "llm_evidence_loop.tool_failed" });
    expect(result.steps[0]?.stateBefore).toBeUndefined();
  });

  it("keeps the record when the draft is turned off, and shows nothing", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 4, maxToolCalls: 4, draft: false,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(result.steps).toHaveLength(1);
    const shown = decide.mock.calls[1]?.[0].evidence as { toolId: string }[];
    expect(shown.some((entry) => entry.toolId === "core.flow_draft")).toBe(false);
  });
});
