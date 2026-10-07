// A rerun that changed nothing is recorded and answered as unchanged, and a
// rerun whose argument changed but whose result did not is told so and is no
// progress (`../amendment.ts`, `../rerun-result.ts`).
//
// Live run `run-mux6naez-6c20f26e` (lane C, round 3, R3-2): decision 0037 reran
// step 5 exactly as it stood; the history row said "unchanged", yet the
// decision's row and answer said `applied` with `draftState: "changed"` (the
// rerun's step took a new id). The model then alternated near-identical
// condition lists, and six reruns read the same 13 rows -- their answers
// differing only in the read's command id and timings -- before any guard fired.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [{ toolId: "core.run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const read = (where: string) => ({ node: "web.output.dom-extract_list", parameters: { list: "results", where } });

/** A results page: every read keeps the same three rows whatever its condition, with a fresh command id and timings each time. */
function resultsPage() {
  let capture = 0;
  return vi.fn(async ({ value }: { toolId: string; value: JsonObject }) => {
    const before = `page.${(capture += 1)}`;
    const after = `page.${(capture += 1)}`;
    if (typeof value.node !== "string") return { kind: "llm_evidence_tool_execution", stateDigests: { before, after }, evidence: { ok: true, code: "core.replay.replayed" }, effectApplied: true, resultCode: "core.replay.replayed", draft: { actionId: "core.replay", effect: "mutate", proposes: false } };
    return {
      kind: "llm_evidence_tool_execution",
      stateDigests: { before, after },
      evidence: { ok: true, node: value.node, status: "succeeded", read: { commandId: `cmd-${capture}`, startedAt: `2026-10-06T00:00:0${capture % 10}Z`, finishedAt: `2026-10-06T00:00:0${capture % 10}Z`, firstRows: [{ name: "one" }, { name: "two" }, { name: "three" }] } },
      effectApplied: true,
      resultCode: "web.inspect.succeeded",
      draft: { actionId: "web.output.dom-extract_list", effect: "observe", proposes: true }
    };
  });
}

const loop = (decide: ReturnType<typeof vi.fn>) => runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: resultsPage(), maxIterations: 20, maxToolCalls: 40, dryRun: false });
const complete = { kind: "complete", result: { done: true } };

describe("a rerun that changed nothing", () => {
  it("is recorded and answered unchanged: the decision's row and the rerun's row say draftState unchanged, nothing applied", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "read.1", toolId: "core.run_node", input: read("price < 50"), add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { parameters: { where: "price < 50" } } }] })
      .mockResolvedValue(complete);

    const result = await loop(decide);

    const rows = (result as unknown as { trace: ReadonlyArray<JsonObject & { progress?: JsonObject; draftChange?: JsonObject }> }).trace.filter((row) => row.iteration === 2);
    const amend = rows.find((row) => row.decision === "amend_draft")!;
    expect(amend).toMatchObject({ resultCode: "llm_evidence_loop.draft_rerun", resultReason: "rerun_changed_nothing", amended: 0 });
    expect(amend.progress).toMatchObject({ draftState: "unchanged" });
    expect(amend.draftChange).toMatchObject({ appliedCount: 0 });
    const call = rows.find((row) => row.decision === "tool_call" && String(row.callId).startsWith("rerun.1") && row.resultCode === "web.inspect.succeeded")!;
    expect(call.progress).toMatchObject({ draftState: "unchanged" });
  });

  it("whose condition changed but whose rows did not is told the result is the same, and counts as no progress", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "read.1", toolId: "core.run_node", input: read("price < 50"), add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { parameters: { where: "price < 40" } } }] })
      .mockResolvedValue(complete);

    await loop(decide);

    const told = shownAt(decide, 2).find((entry) => entry.toolId === "core.rerun_result")?.value;
    expect(told).toMatchObject({ ok: false, code: "llm_evidence_loop.rerun_same_result", step: 1 });
    expect(String(told?.instruction)).toContain("made no difference to what step 1 found");
    const progress = shownAt(decide, 2).find((entry) => entry.toolId === "core.no_progress")?.value;
    expect(progress === undefined || JSON.stringify(progress).includes("stepsWithoutProgress")).toBe(true);
  });

  it("is not told when the rerun found something else", async () => {
    let reads = 0;
    const executeTool = vi.fn(async ({ value }: { toolId: string; value: JsonObject }) => {
      reads += 1;
      if (typeof value.node !== "string") return { kind: "llm_evidence_tool_execution", stateDigests: { before: `p${reads}`, after: `p${reads}x` }, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed", draft: { actionId: "core.replay", effect: "mutate", proposes: false } };
      return { kind: "llm_evidence_tool_execution", stateDigests: { before: `p${reads}`, after: `p${reads}x` }, evidence: { ok: true, read: { firstRows: Array.from({ length: reads }, (_, index) => ({ name: `row ${index}` })) } }, effectApplied: true, resultCode: "web.inspect.succeeded", draft: { actionId: "web.output.dom-extract_list", effect: "observe", proposes: true } };
    });
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "read.1", toolId: "core.run_node", input: read("price < 50"), add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { parameters: { where: "price < 40" } } }] })
      .mockResolvedValue(complete);

    await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxIterations: 20, maxToolCalls: 40, dryRun: false });

    expect(shownAt(decide, 2).find((entry) => entry.toolId === "core.rerun_result")).toBeUndefined();
  });
});
