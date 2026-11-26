// The caller's own move runs where loop detection's ladder reaches its top (`../stall-recovery.ts`, t477;
// `../ladder-top.ts`, t1056). Lane C round 10 (`run-mv5uu9g1-9d80deea`): a run of eight looks ended a candidate build
// while its latest revision had two retests left. No count ends such a loop now: a run of looks is caught as a repeat,
// and once refusing has not stopped it the caller's move runs, and the loop goes on.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
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
    tools, decide, executeTool, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { stalled }, ...(recoverStall ? { recoverStall } : {})
  });
  return { ran, stalled };
}

describe("a stall the caller can recover from", () => {
  it("runs the caller's move once refusing has not stopped a run of looks, shows the model why and its answer, and the build goes on", async () => {
    const decide = vi.fn();
    for (let index = 1; index <= 20; index += 1) decide.mockResolvedValueOnce(find(index));
    decide.mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = site();
    const recoverStall = vi.fn(() => ({ call: { toolId: "retest", input: { revision: 3, digest: "d3" } } }));

    const { ran, stalled } = loop(decide, executeTool, recoverStall);
    await expect(ran).resolves.toMatchObject({ ok: true });

    expect(recoverStall).toHaveBeenCalled();
    expect(stalled).not.toHaveBeenCalled();
    // The loop made the retest itself, with the caller's input, and every look the model asked for still ran.
    const calls = executeTool.mock.calls.map(([call]) => call);
    const retest = calls.find((call) => call.toolId === "retest");
    expect(retest).toMatchObject({ value: { revision: 3, digest: "d3" }, callId: expect.stringMatching(/^core\.stall_recovery\.\d+\.retest$/u) });
    expect(calls.filter((call) => call.toolId === "find")).toHaveLength(20);
    // The decision after it is shown the retest's answer and the note, which rides after every result (t869) and names it.
    const after = decide.mock.calls.findIndex((_, index) => shownAt(decide, index).some((entry) => entry.toolId === "core.stall_recovery"));
    const shown = shownAt(decide, after);
    const note = shown.find((entry) => entry.toolId === "core.stall_recovery");
    expect(note?.value).toMatchObject({ code: "llm_evidence_loop.stall_recovered", ran: { toolId: "retest" }, ranAs: retest!.callId });
    expect(String(note?.value.instruction)).toContain("Core made the call in ran for you");
    expect(shown.findIndex((entry) => entry.callId === retest!.callId)).toBeGreaterThanOrEqual(0);
    expect(shown.findIndex((entry) => entry.callId === retest!.callId)).toBeLessThan(shown.indexOf(note!));
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

  /** Finds, `count` of them, then the result. */
  const looks = (count: number) => {
    const decide = vi.fn().mockImplementation(async () => decide.mock.calls.length <= count ? find(decide.mock.calls.length) : { kind: "complete", result: { done: true } });
    return decide;
  };

  it("goes on, steered, when the caller has nothing left: no count ends the loop (t1056)", async () => {
    const executeTool = site();
    const recoverStall = vi.fn(() => ({ endedBecause: "candidate.stall_retests_used" }));

    const { ran, stalled } = loop(looks(30), executeTool, recoverStall);
    await expect(ran).resolves.toMatchObject({ ok: true });
    expect(recoverStall).toHaveBeenCalled();
    expect(stalled).not.toHaveBeenCalled();
    expect(executeTool.mock.calls.some(([call]) => call.toolId === "retest")).toBe(false);
  });

  it("never runs a tool the loop does not offer, and goes on without a caller's move", async () => {
    const first = loop(looks(30), site(), () => ({ call: { toolId: "core.run_flow", input: {} } }));
    await expect(first.ran).resolves.toMatchObject({ ok: true });
    expect(first.stalled).not.toHaveBeenCalled();

    const second = loop(looks(30), site());
    await expect(second.ran).resolves.toMatchObject({ ok: true });
    expect(second.stalled).not.toHaveBeenCalled();
  });
});
