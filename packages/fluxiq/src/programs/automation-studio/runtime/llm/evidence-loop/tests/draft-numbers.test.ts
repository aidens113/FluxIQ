// The draft a decision reads numbers its steps exactly as amendments resolve
// them, after every call -- a look included (`../../../flow-draft/entry.ts`).
//
// Live run `run-mup2i28c-6c7fc209`: decisions 4 and 5 were shown the same draft
// entry (`2b1151de...`), because the look decision 4 ran held step 5 but was
// not listed. The model numbered past what it could see, and `5 add a2` landed
// on the look.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const lookTool = { toolId: "look", description: "Look.", inputSchema: { type: "object" }, effect: "observe" as const };
const stalled = () => new Error("stalled");
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };
const looked = { kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "p" }, draft: { actionId: "web.snapshot", proposes: false } };
type Line = { step: number; disposition: string };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const draftAt = (decide: { mock: { calls: unknown[][] } }, index: number): Line[] =>
  (((decide.mock.calls[index]![0] as { evidence: Shown }).evidence.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: Line[] } | undefined)?.steps ?? []);

describe("the draft each decision reads", () => {
  it("lists the look the last call took, at the number an amendment would name it by", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "#a" }, add: true })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c2", toolId: "look", input: {} })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "add", act: "a1" }] })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const executeTool = vi.fn().mockResolvedValueOnce(worked).mockResolvedValueOnce(looked);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [press, lookTool], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(draftAt(decide, 1).map((line) => line.step)).toEqual([1]);
    // Decision 3 reads the look as step 2, the number its amendment resolves to.
    expect(draftAt(decide, 2)).toMatchObject([{ step: 1 }, { step: 2, disposition: "look" }]);
    expect(result.steps.map((step) => step.position)).toEqual([1, 2]);
    // And `2 add a1` on it is refused, not recorded as the look doing a1.
    expect(result.steps[1]?.acts).toBeUndefined();
    expect(result.trace.find((row) => row.decision === "amend_draft")?.amendmentsRefused).toMatchObject([{ step: 2, reason: "not_a_kept_step" }]);
  });
});
