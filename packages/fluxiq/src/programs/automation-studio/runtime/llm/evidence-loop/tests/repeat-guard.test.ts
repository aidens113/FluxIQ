// A call that already failed or changed nothing on this same page is refused
// unrun, the model is told why, and three such refusals in a row stall the
// round (`../../repeat-guard/`, `../../decision-handlers/refused-repeat.ts`).
// The shapes are live runs: t227's `run-muq310ht-ab80eed0` reran one list read
// eight times on an unchanged page and pressed the cookie banner's close button
// twenty times, each refused.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "../../evidence-loop.ts";

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
    // t262's wording (`../../draft-amendment-feedback.ts`): the identical request was not sent, and the model
    // is told to inspect the result it already has rather than to take a listing's rows as right.
    expect(JSON.stringify(feedback)).toContain("identical request was not sent again");
    expect(JSON.stringify(feedback)).toContain("only if it actually returned the intended rows");
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
    // `25 keep act a1` seven times, each refused `already_in_flow` in the run -- `act_already_named` since lane D's F36, which
    // tells the model the name stands: the first is a refusal, the next three are repeats of it.
    const keep = { kind: "amend_draft", amendments: [{ step: 1, change: "keep", act: "a1" }] };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "press.1", toolId: "press", input: { target: "Next" }, add: true, act: "a1" })
      .mockResolvedValue(keep);
    const executeTool = site();

    await expect(loop(decide, executeTool)).rejects.toBe(stalledError);
    expect(decide).toHaveBeenCalledTimes(5);
    const feedback = shownAt(decide, 2).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "act_already_named" }] });
  });
});

/**
 * `run-musr9pv3-f4bf6256`'s friend requests: a list read and a Confirm press
 * that repeats over its rows. A part run replays the read (applied: a read ran)
 * and checks the press, which declares a lasting effect, without pressing it (`verified`),
 * with no page states, as the live part runs reported none. `pressing` makes the
 * replayed press act instead.
 */
function requests(pressing = false) {
  const from = { location: "https://circleway.test/requests" };
  return vi.fn(async ({ toolId, value }: { callId: string; toolId: string; value: JsonObject }) => {
    if (value.replay === "step" && toolId === "read") return { kind: "llm_evidence_tool_execution", evidence: { ok: true, code: "core.replay.replayed", rows: 3 }, effectApplied: true, resultCode: "core.replay.replayed" };
    if (value.replay === "verify") return { kind: "llm_evidence_tool_execution", evidence: { ok: true, code: "core.replay.verified" }, effectApplied: false, resultCode: "core.replay.verified" };
    if (value.replay === "step") return { kind: "llm_evidence_tool_execution", evidence: { ok: true, code: "core.replay.replayed" }, effectApplied: true, resultCode: "core.replay.replayed" };
    const states = { stateDigests: { before: "s1", after: "s1" } };
    if (toolId === "read") return { kind: "llm_evidence_tool_execution", ...states, evidence: { rows: 3 }, effectApplied: true, resultCode: "web.inspect.succeeded", draft: { actionId: "web.read", effect: "observe", proposes: true, ranWith: { list: "requests" }, replay: { from } } };
    return { kind: "llm_evidence_tool_execution", ...states, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: "Confirm", ...(pressing ? {} : { consequences: ["social_connection"] }) }, replay: { from } } };
  });
}

/** The completion check refuses the plan every time, as `flow_bootstrap.completion_refused` did from 0071 to 0182. */
const refusingPlan = () => ({ ok: false as const, issueCodes: ["flow_draft.repeat_not_after_its_source"], feedback: { code: "flow_bootstrap.completion_refused" } });
const partRun = (index: number) => ({ kind: "tool_call", callId: `part.${index}`, toolId: "core.run_flow", input: { from: 1, to: 2 } });
const builtDraft = [
  { kind: "tool_call", callId: "read.1", toolId: "read", input: { list: "requests" }, add: true },
  { kind: "tool_call", callId: "press.1", toolId: "press", input: { target: "Confirm" }, add: true }
];
const partLoop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof requests>) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 40, maxToolCalls: 40, propagateDecisionErrors: true, checkCompletion: refusingPlan,
  unusableDecisions: { maxConsecutive: 30, stalled: () => stalledError }
});
const replays = (executeTool: ReturnType<typeof requests>) => executeTool.mock.calls.filter(([call]) => (call as { value: JsonObject }).value.replay !== undefined);

describe("an identical call on an unchanged draft and page (run-musr9pv3-f4bf6256)", () => {
  it("the same passing part run, sent again and again between refused completions: run once, refused unrun after, and the round stalls", async () => {
    // Live (0066-0182): run_flow {from: 15, to: 16}, complete, run_flow, run_flow, complete ... to the 64-decision bound.
    const cycle = [partRun(0), complete, partRun(0)];
    const decide = vi.fn();
    for (const decision of builtDraft) decide.mockResolvedValueOnce(decision);
    decide.mockImplementation(async () => { const next = cycle[(decide.mock.calls.length - 3) % cycle.length]!; return next.kind === "tool_call" ? { ...next, callId: `d${decide.mock.calls.length}` } : next; });
    const executeTool = requests();

    await expect(partLoop(decide, executeTool)).rejects.toBe(stalledError);

    // One part run reached the target (its read and its checked press); the next two were refused unrun, and the
    // completion refused again over the same draft was the third in a row.
    expect(replays(executeTool).map(([call]) => [call.callId, call.value.replay])).toEqual([["d3.1", "step"], ["d3.2", "verify"]]);
    expect(decide).toHaveBeenCalledTimes(7);
    const note = shownAt(decide, 5).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(note).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_refused", toolId: "core.run_flow", sameAsCall: "d3", then: { outcome: "same_draft", resultCode: "core.run_flow.ran" }, refusedInARow: 1 });
    expect(String(note?.instruction)).toContain("unchanged draft");
    expect(String(note?.instruction)).toContain("change the draft first");
  });

  it("runs the same part again once the draft has changed, and when the run pressed something", async () => {
    const decide = vi.fn();
    for (const decision of [...builtDraft, partRun(1), { kind: "amend_draft", amendments: [{ step: 2, change: "optional" }] }, partRun(2), complete]) decide.mockResolvedValueOnce(decision);
    decide.mockResolvedValue(complete);
    const executeTool = requests();
    await expect(partLoop(decide, executeTool)).rejects.toBe(stalledError);
    expect(replays(executeTool)).toHaveLength(4);
    expect(shownAt(decide, 5).some((entry) => entry.toolId === "core.repeat_check")).toBe(false);

    const pressed = vi.fn();
    for (const decision of [...builtDraft, partRun(1), partRun(2), partRun(3)]) pressed.mockResolvedValueOnce(decision);
    pressed.mockResolvedValue(complete);
    const pressing = requests(true);
    await expect(partLoop(pressed, pressing)).rejects.toBe(stalledError);
    expect(replays(pressing)).toHaveLength(6);
  });
});

// A rerun that changes nothing, sent again and again (`../../repeat-guard/outcomes.ts`,
// `../../decision-handlers/amendment.ts`, `../../decision-handlers/refused-repeat.ts`).
//
// Live run `run-muwaobm2-882cadd9` (lane A, round 0), iterations 17-24: step 14
// was rerun as the quantity field, then as the Spain press
// `{node: dom-click, parameters: {target: {handle: t958}}}` beside `add` or
// `keep` act a1.origin -- the same two decisions, A and B, alternating
// A A B B A B. Every rerun reset the page and replayed six clicks before the
// press; the merged argument was identical each time, the act part was refused
// `act_already_named` (repeated), and the Flow's signature never changed. The
// history showed each as "applied: 1, rerun: 14" with no refused part, an
// applied rerun counted as progress, and the build ran into its purse.
//
// Nothing page-keyed caught it: every reset reloads the page, and the web
// domain's state digest moved with each reload (the rerun answers differ only in
// `[frame 10]`, `[frame 11]`, `[frame 12]`), so no rerun ever started on a page
// the guard had seen. The executor here gives every call a fresh digest, as that
// run's did.
const historyRows = (evidence: ReadonlyArray<{ toolId: string; value: JsonObject }>): unknown[][] => (evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as { rows: unknown[][] }).rows;
/** The history's amendment row made at `iteration`, whether alone or grouped with others. */
const amendmentRow = (rows: unknown[][], iteration: number): unknown[] | undefined => rows.find((row) => row[1] === "amendment" && (Array.isArray(row[0]) ? row[0].includes(iteration) : row[0] === iteration));

const nodeTools = [
  { toolId: "core.run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true },
  { toolId: "look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const }
];
const quantity = { node: "web.output.dom-type", parameters: { target: { handle: "t964" }, text: "3", submit: false }, consequences: [] };
const spain = { node: "web.output.dom-click", parameters: { target: { handle: "t958" } }, consequences: [] };
// Decision A (0052, 0060, 0084) and decision B (0068, 0076, 0092).
const decisionA = { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: spain }, { step: 1, change: "add", act: "a1.origin" }] };
const decisionB = { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: spain }, { step: 1, change: "keep", act: "a1.origin" }] };

/** The item page: every call finds and leaves a page digested afresh, as a reload moved the live run's digest. */
function itemPage() {
  let capture = 0;
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    const before = `page.${(capture += 1)}`;
    const after = `page.${(capture += 1)}`;
    if (toolId === "look") return { kind: "llm_evidence_tool_execution", stateDigests: { before, after }, evidence: { ok: true, controls: 12 }, effectApplied: false, resultCode: "web.inspect.succeeded", draft: { actionId: "web.look", effect: "observe", proposes: false } };
    const node = String(value.node);
    const pressed = node === "web.output.dom-click";
    // A press on a control the page does not have: refused, the page as it was.
    if (pressed && (value.parameters as { target?: { handle?: string } } | undefined)?.target?.handle === "gone") {
      return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: before }, evidence: { ok: false, node, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: node, effect: "mutate", proposes: true } };
    }
    return {
      kind: "llm_evidence_tool_execution",
      stateDigests: { before, after },
      evidence: { ok: true, node, status: "succeeded", pageChanged: true, ...(pressed ? { choice: "This press chose \"Spain\"" } : { control: "Quantity" }) },
      effectApplied: true,
      resultCode: "web.action.succeeded",
      draft: { actionId: node, effect: "mutate", proposes: true }
    };
  });
}

const rerunLoop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof itemPage>, stalled = true) => runAutomationStudioLlmEvidenceLoop({
  tools: nodeTools, decide, executeTool, maxIterations: 30, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: stalled,
  ...(stalled ? { unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError } } : {})
});

/** Iteration 1 is the quantity typed and added (as step 14 stood at 17); then the live run's A A B B A B, then completing. */
const liveShape = () => vi.fn()
  .mockResolvedValueOnce({ kind: "tool_call", callId: "type-quantity", toolId: "core.run_node", input: quantity, add: true, act: "a1.quantity" })
  .mockResolvedValueOnce(decisionA)
  .mockResolvedValueOnce(decisionA)
  .mockResolvedValueOnce(decisionB)
  .mockResolvedValueOnce(decisionB)
  .mockResolvedValueOnce(decisionA)
  .mockResolvedValueOnce(decisionB)
  .mockResolvedValue({ kind: "complete", result: { done: true } });

const clicks = (executeTool: ReturnType<typeof itemPage>): number => executeTool.mock.calls.filter(([call]) => call.value.node === "web.output.dom-click").length;

describe("a rerun that changed nothing, sent again", () => {
  it("records each amendment's refused parts, held ones included, and marks the reruns that changed nothing", async () => {
    const decide = liveShape();
    const executeTool = itemPage();

    await rerunLoop(decide, executeTool).catch(() => undefined);

    // Decision 4 (B, first sent) was shown the history of 1-3.
    const rows = historyRows(shownAt(decide, 3));
    // 2 (as 18): the rerun took the quantity step's place with the press, so the Flow changed.
    const first = amendmentRow(rows, 2)!;
    expect(first[6]).toBe("yes");
    expect(JSON.stringify(first[7])).toContain("\"rerun\":1");
    // 3 (as 19): the same decision again. The press replaced an identical press with the same result, and its held
    // `add act a1.origin` was refused: the row says so and reads as no change, not "applied".
    const second = amendmentRow(rows, 3)!;
    expect(second[5]).toBe("act_already_named");
    expect(second[6]).toBe("no");
    expect(second[7]).toMatchObject({ applied: 0, refused: [[1, "act_already_named", expect.any(Boolean)]], rerun: 1 });
    expect(second[8]).toBe(2);
  });

  it("refuses the identical decision unrun once it changed nothing, and stalls the round at the third no-change decision in a row", async () => {
    const decide = liveShape();
    const executeTool = itemPage();

    await expect(rerunLoop(decide, executeTool)).rejects.toBe(stalledError);

    // A ran twice and B once, each a press; B sent again (as 21) was refused before its rerun ran, so no reset, no replay
    // and no press -- and A (as 22) and B (as 23) were never asked for.
    expect(clicks(executeTool)).toBe(3);
    expect(decide).toHaveBeenCalledTimes(5);
    const rows = historyRows(shownAt(decide, 4));
    expect(amendmentRow(rows, 4)?.[6]).toBe("no");
  });

  it("tells the model the refused decision was not run, and why", async () => {
    // A, A, then A again: the third A is refused unrun, and the model is told so before it is asked again.
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "type-quantity", toolId: "core.run_node", input: quantity, add: true, act: "a1.quantity" })
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = itemPage();

    await expect(rerunLoop(decide, executeTool)).resolves.toMatchObject({ ok: true });

    expect(clicks(executeTool)).toBe(2);
    const note = shownAt(decide, 4).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(note).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome: "same_amendment" }, refusedInARow: 2 });
    expect(String(note?.instruction)).toContain("none of it was run: no reset, no replay, no press");
    const refused = amendmentRow(historyRows(shownAt(decide, 4)), 4)!;
    expect(refused[5]).toBe("llm_evidence_loop.repeat_refused");
    expect(refused[6]).toBe("no");
    expect(refused[8]).toBe(2);
  });

  it("ends the round as repeat_without_progress where no stall is configured", async () => {
    const decide = liveShape();
    const executeTool = itemPage();

    const result = await rerunLoop(decide, executeTool, false);

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(clicks(executeTool)).toBe(3);
  });

  it("never loops: the live run's two decisions, sent without end (the purse ended it live), stop at the limit after three presses", async () => {
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "type-quantity", toolId: "core.run_node", input: quantity, add: true, act: "a1.quantity" });
    decide.mockImplementation(async () => (decide.mock.calls.length % 2 === 0 ? decisionA : decisionB));
    const executeTool = itemPage();

    const result = await rerunLoop(decide, executeTool, false);

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(clicks(executeTool)).toBeLessThanOrEqual(3);
    expect(decide.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("refuses unrun the identical decision whose rerun did not work on this same draft, even after a look moved the page, and says so", async () => {
    // Sent straight again, it is refused `changes_nothing` on the page it left (`../rerun-request.ts`); after a look, only the draft key catches it.
    const gone = { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { node: "web.output.dom-click", parameters: { target: { handle: "gone" } } } }] };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "type-quantity", toolId: "core.run_node", input: quantity, add: true, act: "a1.quantity" })
      .mockResolvedValueOnce(gone)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "look-1", toolId: "look", input: {} })
      .mockResolvedValueOnce(gone)
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = itemPage();

    await expect(rerunLoop(decide, executeTool)).resolves.toMatchObject({ ok: true });

    // The failed press ran once; the same decision on the same draft was refused before its reset, replay and press.
    expect(clicks(executeTool)).toBe(1);
    const note = shownAt(decide, 4).find((entry) => entry.toolId === "core.repeat_check")?.value;
    expect(note).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome: "same_amendment", resultCode: "web.action.rejected.target_unobserved", rerunFailed: true } });
    expect(String(note?.instruction)).toContain("its rerun did not work");
  });

  it("still runs the same rerun once the draft has changed since it changed nothing", async () => {
    // A, A (no change), then a new step typed and added, then A again: the draft is no longer the one A left, so A runs.
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "type-quantity", toolId: "core.run_node", input: quantity, add: true, act: "a1.quantity" })
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "type-note", toolId: "core.run_node", input: { ...quantity, parameters: { target: { handle: "t970" }, text: "gift" } }, add: true })
      .mockResolvedValueOnce(decisionA)
      .mockResolvedValue({ kind: "complete", result: { done: true } });
    const executeTool = itemPage();

    await expect(rerunLoop(decide, executeTool)).resolves.toMatchObject({ ok: true });
    expect(clicks(executeTool)).toBe(3);
  });
});
