// A call that already failed or changed nothing on this same page is refused
// unrun, the model is told why, and three such refusals in a row stall the
// round (`../../repeat-guard/`, `../../decision-handlers/refused-repeat.ts`).
// The shapes are live runs: t227's `run-muq310ht-ab80eed0` reran one list read
// eight times on an unchanged page and pressed the cookie banner's close button
// twenty times, each refused.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [
  { toolId: "read", description: "Read the list in view.", inputSchema: { type: "object" }, effect: "observe" as const },
  // As `core.run_node`: each call says its own effect, so a refused press moves the attempt epoch and the repeat policy runs it again.
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const stalledError = new Error("stalled");
const press = (index: number, target: string) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target } });
const complete = { kind: "complete", result: { done: true } };

/**
 * A page in state `s<n>`. "Next" moves it on; "X" is a covered close button,
 * refused every time; "Busy" is rate limited the first `busy` times; a read
 * reports the page unchanged and proposes its step, as a list read does.
 */
function site(busy = 0) {
  let page = 1;
  let busyLeft = busy;
  const result = (fields: JsonObject, before: number) => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: `s${before}`, after: `s${page}` }, ...fields });
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    const before = page;
    if (toolId === "read") return result({ evidence: { rows: 3 }, effectApplied: true, resultCode: "web.inspect.succeeded", draft: { actionId: "web.read", effect: "observe", proposes: true } }, before);
    const click = { draft: { actionId: "web.click", effect: "mutate", proposes: true } };
    if (value.target === "Next") { page += 1; return result({ evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click }, before); }
    if (value.target === "Busy" && busyLeft > 0) { busyLeft -= 1; return result({ evidence: { ok: false, code: "rate_limited" }, effectApplied: false, resultCode: "web.action.rejected.rate_limited", ...click }, before); }
    if (value.target === "Busy") { page += 1; return result({ evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", ...click }, before); }
    return result({ evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet", ...click }, before);
  });
}

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof site>) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError }
});

describe("a call already tried on this same page", () => {
  it("the cookie close button pressed again and again: run once, refused unrun after, and the round stalls at the third refusal", async () => {
    const decide = vi.fn().mockImplementation(async () => press(decide.mock.calls.length, "X"));
    const executeTool = site();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);

    // Twenty in the live run; here one ran, three were refused, and the round stalled.
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledTimes(4);
    const note = shownAt(decide, 2).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(note).toMatchObject({
      ok: false, code: "llm_evidence_loop.repeat_refused", toolId: "press", sameAsCall: "press.1",
      then: { outcome: "failed", resultCode: "web.action.rejected.target_unobserved", resultReason: "handle_not_in_packet" },
      refusedInARow: 1, maxRefusedInARow: 3
    });
    expect(String(note?.instruction)).toContain("on this exact page");
  });

  it("t227's list read rerun eight times on an unchanged page: the same argument runs once, then is refused, and the round stalls", async () => {
    const rerun = { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { where: "price < 50" } }] };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "read.1", toolId: "read", input: { list: "results" }, add: true })
      .mockResolvedValue(rerun);
    const executeTool = site();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);

    expect(executeTool.mock.calls.map(([call]) => call.value)).toEqual([{ list: "results" }, { list: "results", where: "price < 50" }]);
    expect(decide).toHaveBeenCalledTimes(5);
    const feedback = shownAt(decide, 3).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "changes_nothing" }] });
    expect(JSON.stringify(feedback)).toContain("running it again changes nothing");
  });

  it("is let through when its outcome said to try again later: a rate-limited press", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press(1, "Busy"))
      .mockResolvedValueOnce(press(2, "Busy"))
      .mockResolvedValueOnce(press(3, "Busy"))
      .mockResolvedValueOnce(complete);
    const executeTool = site(2);

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(3);
  });

  it("is let through once the page has changed", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(press(1, "X"))
      .mockResolvedValueOnce(press(2, "Next"))
      .mockResolvedValueOnce(press(3, "X"))
      .mockResolvedValueOnce(complete);
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => call.value.target)).toEqual(["X", "Next", "X"]);
  });

  it("does not count refusals apart from each other as in a row", async () => {
    // X refused, X refused as a repeat, Next moves the page, X runs, X refused as a repeat, complete.
    const decide = vi.fn()
      .mockResolvedValueOnce(press(1, "X"))
      .mockResolvedValueOnce(press(2, "X"))
      .mockResolvedValueOnce(press(3, "Next"))
      .mockResolvedValueOnce(press(4, "X"))
      .mockResolvedValueOnce(press(5, "X"))
      .mockResolvedValueOnce(complete);
    const executeTool = site();

    await expect(loop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(executeTool.mock.calls.map(([call]) => call.value.target)).toEqual(["X", "Next", "X"]);
  });

  it("run 36: the same refused amendment sent again and again stalls the round at the third repeat", async () => {
    // `25 keep act a1` seven times, each refused `already_in_flow`: the first is a refusal, the next three are repeats of it.
    const keep = { kind: "amend_draft", amendments: [{ step: 1, change: "keep", act: "a1" }] };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "press.1", toolId: "press", input: { target: "Next" }, add: true, act: "a1" })
      .mockResolvedValue(keep);
    const executeTool = site();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);
    expect(decide).toHaveBeenCalledTimes(5);
    const feedback = shownAt(decide, 2).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "already_in_flow" }] });
  });
});
