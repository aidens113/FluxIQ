// What a completion's history row says about the dry run.
//
// Run 18's completion 48 was accepted on an earlier "clean" verdict that the
// gate reused without replaying, and its row read `not_run` -- as though no dry
// run applied to the draft at all. A reused verdict now reads `reused_clean`.
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

/** A press that proposes a replayable step, and a replay in which every step replays. */
const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
  if (value.replay === "reset" || value.replay === "step") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
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

describe("a completion's dry run in the decision history", () => {
  it("says clean when it replayed, and reused_clean when the same draft was answered from that replay", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.click", parameters: {}, consequences: [] } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 2 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 3 } })
      .mockResolvedValueOnce({ kind: "complete", result: { attempt: 4 } });
    // Two different refusals, so the two completions are two rows rather than one repeated.
    const refusal = (code: string) => ({ ok: false as const, issueCodes: [code], feedback: { ok: false, code: "completion_refused", issues: [{ code }] } });
    const checkCompletion = vi.fn(async (result: JsonObject) => result.attempt === 2 ? refusal("recorded.first") : result.attempt === 3 ? refusal("recorded.second") : { ok: true as const });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [tool], decide, executeTool, checkCompletion, propagateDecisionErrors: true, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1,
      unusableDecisions: { maxConsecutive: 4, stalled: () => new Error("stalled") }
    });

    expect(result.ok).toBe(true);
    // One replay only: the reset and the step, at the first completion.
    expect(executeTool.mock.calls.map(([call]) => call.value.replay)).toEqual([undefined, "reset", "step"]);
    const rows = completionRows(shownAt(decide, 3));
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows[0])).toContain("\"dryRun\":\"clean\"");
    expect(JSON.stringify(rows[1])).toContain("\"dryRun\":\"reused_clean\"");
    expect(JSON.stringify(rows)).not.toContain("not_run");
  });
});
