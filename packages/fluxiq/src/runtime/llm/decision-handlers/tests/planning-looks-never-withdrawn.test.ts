// A planning loop's way forward in its notes (`../searching.ts`, `../../evidence-progress/planning-tools.ts`), with no
// look budget (page-diff D4, D11: nothing is withdrawn, so nothing is counted). The project supervisor of
// `run-mv7t07hx-fe96a174` made seven finds with new queries on an unchanged start page: none was a repeat, and the
// searching note told it to press and type.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tool = (toolId: string, effect: "observe" | "mutate"): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, inputSchema: { type: "object", properties: {} }, effect });
const look = tool("find", "observe");
const plan = tool("plan.write", "observe");
const brief = tool("plan.send", "mutate");
const PLANNING = { toolIds: ["plan.write", "plan.send"], next: () => ({ toolId: "plan.write", instruction: "Write the plan now with plan.write." }) };

/** An unchanged page: every look leaves it as it found it, with a new answer each time. */
function page() {
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => (toolId === "find"
    ? { kind: "llm_evidence_tool_execution", evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", stateDigests: { before: "s1", after: "s1" }, draft: { actionId: "web.find", effect: "observe", proposes: false } }
    : { kind: "llm_evidence_tool_execution", evidence: { ok: true, written: toolId }, effectApplied: false }));
}
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const offeredAt = (decide: { mock: { calls: unknown[][] } }, index: number): string[] => (decide.mock.calls[index]![0] as { tools: Array<{ toolId: string }> }).tools.map((entry) => entry.toolId).filter((id: string) => id !== "core.loop_decision");
const find = (index: number) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } });
const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof page>) => runAutomationStudioLlmEvidenceLoop({
  tools: [look, plan, brief], decide, executeTool, dryRun: false, draft: false,
  unusableDecisions: { stalled: () => new Error("stalled") },
  planning: PLANNING
});

describe("a planning loop in the evidence loop", () => {
  it("never withdraws a look: every look runs, the offered tools never change, and nothing is said of a budget", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(find(1)).mockResolvedValueOnce(find(2)).mockResolvedValueOnce(find(3))
      .mockResolvedValueOnce({ kind: "tool_call", callId: "plan.1", toolId: "plan.write", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = page();
    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => call.toolId)).toEqual(["find", "find", "find", "plan.write"]);
    for (const at of [0, 1, 2, 3, 4]) expect([...offeredAt(decide, at)].sort()).toEqual(["find", "plan.send", "plan.write"]);
    expect(shownAt(decide, 3).some((entry) => entry.toolId === "core.look_budget" || entry.toolId === "core.decision_check")).toBe(false);
  });

  it("with no budget, names its way forward in the searching note in place of pressing and typing", async () => {
    const decide = vi.fn();
    for (let index = 1; index <= 5; index += 1) decide.mockResolvedValueOnce(find(index));
    decide.mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    await expect(loop(decide, page())).resolves.toMatchObject({ ok: true });
    const note = shownAt(decide, 5).find((entry) => entry.toolId === "core.search_check")?.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.searching_without_acting", looksInARow: 5, next: "plan.write" });
    expect(String(note?.instruction)).toContain("Write the plan now with plan.write.");
    expect(String(note?.instruction)).not.toContain("press, type into");
  });
});
