// The loop accruing the draft, end to end: what it appends, what it shows, and
// what an amendment decision does to it.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../llm/index.ts";

const inspect = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const };
const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const tools = [inspect, press];
const stalled = () => new Error("stalled");

const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` } });

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
  it("is shown beside the window, and survives what the window evicts", async () => {
    const page = { markup: "z".repeat(3_000) };
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(pressed(3))
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, maxEvidenceContextBytes: 6_000,
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: page, effectApplied: true })
    });
    const shown = decide.mock.calls[3]?.[0].evidence as { callId: string; toolId: string; value: unknown }[];
    const draft = shown.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: { step: number; input: unknown }[] };
    expect(draft.steps.map((step) => step.input)).toEqual([{ target: "target.1" }, { target: "target.2" }, { target: "target.3" }]);
    // The window itself could not hold all three results at this size.
    expect(shown.filter((entry) => entry.toolId === "press").length).toBeLessThan(3);
  });

  it("lets the model mark a step exploratory, and says so next time", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }] })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.disposition)).toEqual(["exploratory", "kept"]);
    expect(result.trace.some((entry) => entry.decision === "amend_draft" && entry.resultCode === "llm_evidence_loop.draft_amended")).toBe(true);
    const shown = decide.mock.calls[3]?.[0].evidence as { toolId: string; value: unknown }[];
    const draft = shown.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: { disposition: string; inResult: boolean }[] };
    expect(draft.steps.map((step) => [step.disposition, step.inResult])).toEqual([["exploratory", false], ["kept", true]]);
  });

  it("is not offered an edit before there is one to make, and stops offering them once the allowance is spent", async () => {
    const offered: boolean[] = [];
    const decide = vi.fn(async ({ decisionSchema }: { decisionSchema: JsonObject }) => {
      const variants = decisionSchema.oneOf as { properties: { kind: { const: string } } }[];
      offered.push(variants.some((variant) => variant.properties.kind.const === "amend_draft"));
      return offered.length === 1 ? pressed(1) : { kind: "amend_draft", amendments: [{ step: 1, change: offered.length % 2 ? "keep" : "drop" }] };
    });
    await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, draft: { maxAmendments: 2 },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true })
    });
    expect(offered[0]).toBe(false);
    expect(offered[1]).toBe(true);
    expect(offered[2]).toBe(true);
    expect(offered[3]).toBe(false);
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
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }] })
      .mockResolvedValueOnce(repeat)
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }] })
      .mockResolvedValueOnce(repeat)
      .mockResolvedValue({ kind: "complete", result: { flow: "..." } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 12, maxToolCalls: 12, maxStepsWithoutProgress: 3, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true }
        : { page: "looked" }
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    // The three edits landed all the same: they are progress on the draft, and
    // the loop neither counts them against the guard nor lets them clear it.
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
