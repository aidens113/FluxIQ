// A call put into the Flow with an act whose step only reads: the read stays in
// the Flow without the act, and the model is told `act_on_a_read` in the answer
// to that same call, by `../amendment.ts`. Lane B (run-mw43nq03-285153fa, step
// 0019) sent a read with act a1, the act was dropped without a word, and the
// model sent it again as an amendment that was refused (step 0022).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const read = { toolId: "read", description: "Read a list.", inputSchema: { type: "object" }, effect: "observe" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const pressed = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };
const listed = { kind: "llm_evidence_tool_execution", evidence: { ok: true, rows: 2 }, effectApplied: true, draft: { actionId: "web.dom.extract_list", proposes: true, effect: "observe" } };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const feedbackAt = (decide: { mock: { calls: unknown[][] } }, index: number) =>
  (decide.mock.calls[index]![0] as { evidence: Shown }).evidence.find((entry) => entry.toolId === "core.amendment_check")?.value;

const run = async (decisions: JsonObject[], results: JsonObject[]) => {
  const decide = vi.fn();
  for (const decision of decisions) decide.mockResolvedValueOnce(decision);
  decide.mockResolvedValueOnce(complete);
  const executeTool = vi.fn();
  for (const result of results) executeTool.mockResolvedValueOnce(result);
  const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go, read], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled } });
  return { result, decide };
};

describe("an act sent with a call whose step only reads", () => {
  it("keeps the read in the Flow without the act, and says act_on_a_read in the answer to that call", async () => {
    const { result, decide } = await run(
      [{ kind: "tool_call", callId: "call.1", toolId: "go", input: { target: "#open" }, add: true }, { kind: "tool_call", callId: "call.2", toolId: "read", input: {}, add: true, act: "a1" }],
      [pressed, listed]
    );
    expect(result.steps.map((step) => [step.position, step.disposition, step.acts])).toEqual([[1, "kept", undefined], [2, "kept", undefined]]);
    const told = feedbackAt(decide, 2);
    expect(told).toMatchObject({ code: "llm_evidence_loop.draft_amendments_refused", refused: [{ step: 2, reason: "act_on_a_read" }] });
    expect(JSON.stringify(told)).toContain("Step 2 only reads, so the act was not recorded on it");
  });

  it("leaves a press with its act as before: claimed, and nothing told", async () => {
    const { result, decide } = await run([{ kind: "tool_call", callId: "call.1", toolId: "go", input: { target: "#add" }, add: true, act: "a1" }], [pressed]);
    expect(result.steps.map((step) => [step.position, step.disposition, step.acts])).toEqual([[1, "kept", ["a1"]]]);
    expect(feedbackAt(decide, 1)).toBeUndefined();
  });
});
