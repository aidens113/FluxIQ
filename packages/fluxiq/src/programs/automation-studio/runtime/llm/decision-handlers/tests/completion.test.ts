// What a completion's history row says about the test of the Flow.
//
// Run 18's completion 48 was accepted on an earlier "clean" verdict that the
// gate reused without replaying, and its row read `not_run` -- as though no dry
// run applied to the draft at all. A reused verdict now reads `reused_clean`
// (`../../node-tools/tests/dry-run-gate.test.ts`).
//
// And since 2026-09-30 a completion the check refuses is not tested at all: it
// is still the build's live phase, and the draft is replayed from its first
// step only once the check accepts it (`../../evidence-loop/completion-attempt.ts`).
import { describe, expect, it, vi } from "vitest";
// The loop first: `runtime/loop-limits/` imports back into the llm directory.
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const completionRows = (evidence: Shown): unknown[][] =>
  (evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as { rows: unknown[][] }).rows.filter((row) => row[1] === "completion");

const tool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };

/** A press that proposes a replayable step; the first test fails its step, the second replays it. */
const executeTool = vi.fn(async ({ callId, value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
  if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
  if (value.replay === "step") {
    const failed = callId.startsWith("dryrun.1.");
    return { kind: "llm_evidence_tool_execution", evidence: { ok: !failed }, effectApplied: !failed, resultCode: failed ? "core.replay.failed" : "core.replay.replayed" };
  }
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { page: "after" },
    effectApplied: true,
    draft: {
      actionId: "node.click",
      input: value,
      ranWith: { node: "node.click", parameters: { target: "#c1" }, consequences: [] },
      effect: "mutate",
      proposes: true,
      replay: { from: { location: "https://store.test/start" } }
    }
  };
});

describe("a completion's test in the decision history", () => {
  it("tests nothing while the check refuses, then shows the refused steps of a failed test", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.click", parameters: {}, consequences: [] }, add: true })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 3 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 4 } });
    const refusal = (code: string) => ({ ok: false as const, issueCodes: [code], feedback: { ok: false, code: "completion_refused", issues: [{ code }] } });
    const checkCompletion = vi.fn(async (result: JsonObject) => result.attempt === 2 ? refusal("recorded.first") : { ok: true as const });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [tool], decide, executeTool, checkCompletion, propagateDecisionErrors: true, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1,
      unusableDecisions: { maxConsecutive: 4, stalled: () => new Error("stalled") }
    });

    expect(result.ok).toBe(true);
    // Nothing replayed at completion 2, which the check refused; the Flow was
    // tested at 3 (its step failed) and again at 4 (clean).
    expect(executeTool.mock.calls.map(([call]) => call.callId)).toEqual(["c1", "dryrun.1.reset", "dryrun.1.1", "dryrun.2.reset", "dryrun.2.1"]);
    const rows = completionRows(shownAt(decide, 3));
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows[0])).not.toContain("dryRun");
    expect(JSON.stringify(rows[1])).toContain("\"dryRun\":[[1,\"failed\"]]");
  });
});
