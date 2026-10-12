// A stall the caller can still recover from runs that move instead of ending
// (`../stall-recovery.ts`, t477). Lane C round 10 (`run-mv5uu9g1-9d80deea`):
// a run of eight looks ended a candidate build while its latest revision had
// two retests left.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "find", description: "Search the page for text.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true },
  { toolId: "retest", description: "Test the latest revision.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const find = (index: number) => ({ kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `query ${index}` } });
const press = (index: number, target: string) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target } });

/** A page that never moves: finds match nothing, presses are refused, and a retest answers unsure. */
function site() {
  const result = (fields: JsonObject) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, ...fields });
  return vi.fn(async ({ toolId, value }: { callId?: string; toolId: string; value: JsonObject }) => {
    if (toolId === "find") return result({ evidence: { found: `0 matches for "${String(value.query)}"` }, effectApplied: false, resultCode: "web.inspect.succeeded", draft: { actionId: "web.find", effect: "observe", proposes: false } });
    if (toolId === "retest") return { kind: "llm_evidence_tool_execution", evidence: { ok: false, verdict: "unsure", revision: value.revision ?? null }, effectApplied: true, targetsUnchanged: false, resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" };
    return result({ evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.click", effect: "mutate", proposes: true } });
  });
}

function loop(decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof site>, recoverStall?: Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0]["recoverStall"]) {
  const stalled = vi.fn((input: { issueCodes: readonly string[] }) => Object.assign(new Error("stalled"), { issueCodes: [...input.issueCodes] }));
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool, maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { maxConsecutive: 8, stalled }, ...(recoverStall ? { recoverStall } : {})
  });
  return { ran, stalled };
}

describe("a stall the caller can recover from", () => {
  it("runs the caller's move at the eighth look in a row, shows the model why and its answer, and the build goes on", async () => {
    const decide = vi.fn();
    for (let index = 1; index <= 8; index += 1) decide.mockResolvedValueOnce(find(index));
    decide.mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();
    const recoverStall = vi.fn(() => ({ call: { toolId: "retest", input: { revision: 3, digest: "d3" } } }));

    const { ran, stalled } = loop(decide, executeTool, recoverStall);
    await expect(ran).resolves.toMatchObject({ ok: true });

    expect(recoverStall).toHaveBeenCalledWith({ issueCodes: ["llm_evidence_loop.searching_without_acting"] });
    expect(stalled).not.toHaveBeenCalled();
    // The loop made the retest itself, after the eighth look, with the caller's input.
    const calls = executeTool.mock.calls.map(([call]) => call);
    expect(calls.at(-1)).toMatchObject({ toolId: "retest", value: { revision: 3, digest: "d3" }, callId: "core.stall_recovery.8.retest" });
    // The ninth decision is shown the note and, after it, the retest's answer.
    const shown = shownAt(decide, 8);
    const note = shown.find((entry) => entry.toolId === "core.stall_recovery");
    expect(note?.value).toMatchObject({ code: "llm_evidence_loop.stall_recovered", stalledOn: ["llm_evidence_loop.searching_without_acting"], ran: { toolId: "retest" }, ranAs: "core.stall_recovery.8.retest" });
    expect(String(note?.value.instruction)).toContain("Instead of ending the build");
    expect(shown.findIndex((entry) => entry.callId === "core.stall_recovery.8.retest")).toBeGreaterThan(shown.indexOf(note!));
  });

  it("runs it at the third refused repeat in a row too, and the runs start again after it", async () => {
    const decide = vi.fn();
    // The first press runs and is refused; the next three identical ones are refused unrun, the third of them in a row a stall.
    for (let index = 1; index <= 4; index += 1) decide.mockResolvedValueOnce(press(index, "Sale banner"));
    // After the retest, two more identical refusals do not stall at once: the run started again.
    for (let index = 5; index <= 6; index += 1) decide.mockResolvedValueOnce(press(index, "Sale banner"));
    decide.mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();
    const recoverStall = vi.fn(() => ({ call: { toolId: "retest", input: { revision: 3, digest: "d3" } } }));

    const { ran, stalled } = loop(decide, executeTool, recoverStall);
    await expect(ran).resolves.toMatchObject({ ok: true });

    expect(recoverStall).toHaveBeenCalledTimes(1);
    expect(recoverStall).toHaveBeenCalledWith({ issueCodes: ["llm_evidence_loop.repeat_refused"] });
    expect(stalled).not.toHaveBeenCalled();
    // The page did not change, so the press stays refused unrun; but two refusals after the retest are a new run, not a stall.
    expect(executeTool.mock.calls.map(([call]) => call.toolId)).toEqual(["press", "retest"]);
  });

  it("ends as before when the caller has nothing left, with its reason among the stall's codes", async () => {
    const decide = vi.fn().mockImplementation(async () => find(decide.mock.calls.length + 1));
    const executeTool = site();

    const { ran, stalled } = loop(decide, executeTool, () => ({ endedBecause: "candidate.stall_retests_used" }));
    await expect(ran).rejects.toMatchObject({ issueCodes: ["llm_evidence_loop.searching_without_acting", "candidate.stall_retests_used"] });
    expect(stalled).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls.some(([call]) => call.toolId === "retest")).toBe(false);
  });

  it("never runs a tool the loop does not offer, and ends as before without a caller", async () => {
    const offTheList = vi.fn().mockImplementation(async () => find(offTheList.mock.calls.length + 1));
    const first = loop(offTheList, site(), () => ({ call: { toolId: "core.run_flow", input: {} } }));
    await expect(first.ran).rejects.toMatchObject({ issueCodes: ["llm_evidence_loop.searching_without_acting"] });

    const none = vi.fn().mockImplementation(async () => find(none.mock.calls.length + 1));
    const second = loop(none, site());
    await expect(second.ran).rejects.toMatchObject({ issueCodes: ["llm_evidence_loop.searching_without_acting"] });
  });
});
