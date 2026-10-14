// A planning loop's look budget (`../look-withdrawal.ts`, t569) and the notes
// that name its way forward (`../searching.ts`,
// `../../evidence-progress/planning-tools.ts`). The project supervisor of
// `run-mv7t07hx-fe96a174` made seven finds with new queries on an unchanged
// start page: none was a repeat, so no redirect was ever ignored and nothing
// withdrew a look, and the searching note told it to press and type.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceLookWithdrawal } from "../look-withdrawal.ts";

const tool = (toolId: string, effect: "observe" | "mutate"): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, inputSchema: { type: "object", properties: {} }, effect });
const look = tool("find", "observe");
const plan = tool("plan.write", "observe");
const brief = tool("plan.send", "mutate");
const PLANNING = { toolIds: ["plan.write", "plan.send"], next: () => ({ toolId: "plan.write", instruction: "Write the plan now with plan.write." }) };

describe("a planning loop's look budget", () => {
  it("counts only looks, withdraws them once spent for the rest of the loop, and never a planning tool", () => {
    const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: true, planning: { toolIds: PLANNING.toolIds, lookBudget: 2 } });
    expect(looks.looked(plan)).toBe(false);
    expect(looks.looked(brief)).toBe(false);
    expect(looks.looked(look)).toBe(false);
    expect(looks.active(0)).toBe(false);
    expect(looks.looked(look)).toBe(true);
    // An action moving the epoch gives no look back: the budget is the loop's, not the epoch's.
    for (const epoch of [0, 1, 5]) {
      expect(looks.active(epoch)).toBe(true);
      expect(looks.offer([look, plan, brief], epoch).map((entry) => entry.toolId)).toEqual(["plan.write", "plan.send"]);
      expect(looks.refuses(look, {}, epoch)).toBe(true);
      expect(looks.refuses(plan, {}, epoch)).toBe(false);
      expect(looks.refusalCode(epoch)).toBe("llm_evidence_loop.look_budget_spent");
    }
    expect(looks.looked(look)).toBe(false);
  });

  it("withdraws nothing where the loop cannot refuse a decision, and keeps the redirect rule's own code without a budget", () => {
    const off = automationStudioLlmEvidenceLookWithdrawal({ enabled: false, planning: { toolIds: [], lookBudget: 0 } });
    expect(off.active(0)).toBe(false);
    const plain = automationStudioLlmEvidenceLookWithdrawal({ enabled: true });
    expect(plain.looked(look)).toBe(false);
    plain.redirectShown(1);
    expect(plain.askedAgain(2, 0)).toBe(true);
    expect(plain.refusalCode(0)).toBe("llm_evidence_loop.look_withdrawn");
  });
});

/** An unchanged page: every look leaves it as it found it, with a new answer each time. */
function page() {
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => (toolId === "find"
    ? { kind: "llm_evidence_tool_execution", evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", stateDigests: { before: "s1", after: "s1" }, draft: { actionId: "web.find", effect: "observe", proposes: false } }
    : { kind: "llm_evidence_tool_execution", evidence: { ok: true, written: toolId }, effectApplied: false }));
}
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const offeredAt = (decide: { mock: { calls: unknown[][] } }, index: number): string[] => (decide.mock.calls[index]![0] as { tools: Array<{ toolId: string }> }).tools.map((entry) => entry.toolId);
const find = (index: number) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } });
const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof page>, lookBudget?: number) => runAutomationStudioLlmEvidenceLoop({
  tools: [look, plan, brief], decide, executeTool, maxIterations: 30, maxToolCalls: 30, dryRun: false, draft: false,
  unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") },
  planning: { ...PLANNING, ...(lookBudget === undefined ? {} : { lookBudget }) }
});

describe("a planning loop in the evidence loop", () => {
  it("says the budget is spent with its way forward, and refuses a look after it unrun", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(find(1)).mockResolvedValueOnce(find(2)).mockResolvedValueOnce(find(3))
      .mockResolvedValueOnce({ kind: "tool_call", callId: "plan.1", toolId: "plan.write", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = page();
    await expect(loop(decide, executeTool, 2)).resolves.toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => call.toolId)).toEqual(["find", "find", "plan.write"]);
    expect(offeredAt(decide, 2)).toEqual(["plan.write", "plan.send"]);
    const note = shownAt(decide, 2).find((entry) => entry.toolId === "core.look_budget")?.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.look_budget_spent", lookBudget: 2, looksWithdrawn: true, next: "plan.write" });
    expect(String(note?.instruction)).toMatch(/withdrawn for the rest of it.*Write the plan now with plan\.write\.$/u);
    const refused = shownAt(decide, 3).find((entry) => entry.toolId === "core.decision_check")?.value;
    expect(refused).toMatchObject({ issueCodes: ["llm_evidence_loop.look_budget_spent"] });
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
