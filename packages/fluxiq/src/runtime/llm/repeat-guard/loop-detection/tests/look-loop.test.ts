// A round that only looks, from the recorded shape of run-mwufisf0-5535f5f5 (t1008): the model searched and
// described controls on one page that never moved, and never pressed. Before t1008 each round of the attempt was
// ended by a count -- the eighth look in a row -- and the next round started with an empty evidence window and
// looked at the same things again, four rounds in a row. A loop whose caller takes loop detection's signal
// (`loopSignal`, the answer-first rounds) is now ended by no count of its own: the run of looks is caught as a
// repeat and decided by the model, and only loop detection's ladder signals a change of approach. The site is
// made up and shares nothing with a realistic scenario.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceStallRedirect } from "../../../evidence-progress/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../../index.ts";
import { automationStudioLlmLoopAttemptRecord, automationStudioLlmLoopWatch, type AutomationStudioLlmLoopCall, type AutomationStudioLlmLoopSignal } from "../index.ts";

const tools = [
  { toolId: "find", description: "Search the page for words.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "describe", description: "Describe one element.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const stalledError = new Error("stalled");
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const noteAt = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject | undefined => shownAt(decide, index).filter((entry) => entry.toolId === toolId).at(-1)?.value;
/** The recorded run's alternation: a search, then a description of a control, each with new words, on one page. */
const look = (index: number) => (index % 2 === 0
  ? { kind: "tool_call", callId: `find.${index}`, toolId: "find", input: { query: `words ${index}` } }
  : { kind: "tool_call", callId: `describe.${index}`, toolId: "describe", input: { target: `t${index}` } });
const done = { kind: "complete", result: { done: true } };

/** A page in state `s<n>`: "Next" moves it on; a look leaves it as it was, answering something new each time. */
function site() {
  let page = 1;
  return vi.fn(async ({ toolId, value }: { toolId: string; value: JsonObject }) => {
    const before = page;
    if (toolId === "press" && value.target === "Next") page += 1;
    const pressed = toolId === "press";
    return {
      kind: "llm_evidence_tool_execution", stateDigests: { before: `s${before}`, after: `s${page}` },
      evidence: pressed ? { ok: true, page } : { found: `answer to ${JSON.stringify(value)}` },
      effectApplied: pressed, resultCode: pressed ? "web.action.succeeded" : "web.inspect.succeeded",
      draft: pressed ? { actionId: "web.click", effect: "mutate", proposes: true } : { actionId: "web.look", effect: "observe", proposes: false }
    };
  });
}

/** The loop as an answer-first round runs it: a caller that takes loop detection's signal, and figures that once ended it. */
function round(decide: ReturnType<typeof vi.fn>, extra: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) {
  const executeTool = site();
  const signals: AutomationStudioLlmLoopSignal[] = [];
  const record = automationStudioLlmLoopAttemptRecord();
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: executeTool as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"],
    maxIterations: 8, maxToolCalls: 8, dryRun: false, propagateDecisionErrors: true, attemptRecord: record,
    unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError },
    loopSignal: (signal: AutomationStudioLlmLoopSignal) => {
      signals.push(signal);
      return "end";
    },
    ...extra
  } as AutomationStudioLlmEvidenceLoopInput);
  return { ran, executeTool, signals, record };
}

describe("a round that only looks (run-mwufisf0-5535f5f5)", () => {
  it("is not ended by its eighth look: the run of looks is caught as a repeat and the model is asked to decide", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => (decide.mock.calls.length <= 8 ? look(decide.mock.calls.length) : done));
    const { ran, executeTool, signals } = round(decide);

    await expect(ran).resolves.toMatchObject({ ok: true });

    // Before t1008 the eighth look stalled the round, and nothing after it was asked.
    expect(executeTool).toHaveBeenCalledTimes(8);
    expect(decide).toHaveBeenCalledTimes(9);
    const steer = noteAt(decide, 8, "core.loop_check");
    expect(steer).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "no_progress", repeats: 8, toolIds: ["describe", "find"] });
    expect(steer?.decide).toMatchObject({ tool: "core.loop_decision" });
    expect(signals).toEqual([]);
  });

  it("says at the fifth look that a look never presses, and that the run is caught rather than stopped", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => (decide.mock.calls.length <= 5 ? look(decide.mock.calls.length) : done));
    const { ran } = round(decide);
    await ran;
    const note = noteAt(decide, 5, "core.search_check");
    expect(note).toMatchObject({ code: "llm_evidence_loop.searching_without_acting", looksInARow: 5 });
    expect(String(note?.instruction)).toContain("the run of looks is caught as a repeat, and you decide how to go on");
    expect(String(note?.instruction)).not.toContain("the searching is stopped");
  });

  it("looking on after the steer climbs loop detection's ladder: the change of approach is loop detection's, with what it repeated", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => look(decide.mock.calls.length));
    const { ran, executeTool, signals, record } = round(decide);

    await expect(ran).rejects.toBe(stalledError);

    // Steered at the eighth, steered again at the ninth, then three more looks that brought nothing.
    expect(executeTool).toHaveBeenCalledTimes(12);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "change_approach", pattern: "no_progress", toolIds: ["describe", "find"] });
    expect(record.data().stoppedOn).toMatchObject({ pattern: "no_progress", toolIds: ["describe", "find"] });
    expect(record.data().approaches).toBe(1);
  });

  it("runs past the turns, calls and steps it was configured with while it is working", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => (decide.mock.calls.length <= 12 ? { kind: "tool_call", callId: `press.${decide.mock.calls.length}`, toolId: "press", input: { target: "Next" } } : done));
    const { ran, executeTool } = round(decide);
    await expect(ran).resolves.toMatchObject({ ok: true });
    expect(executeTool).toHaveBeenCalledTimes(12);
  });

  it("keeps every figure for a caller that does not take the signal", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => look(decide.mock.calls.length));
    const { ran, executeTool } = round(decide, { loopSignal: undefined });
    await expect(ran).rejects.toBe(stalledError);
    expect(executeTool).toHaveBeenCalledTimes(8);
  });
});

/** One call as the watch is told it ran. */
const ranCall = (index: number, effect: "observe" | "mutate", after = "s1"): AutomationStudioLlmLoopCall => ({
  callId: `c.${index}`, toolId: effect === "observe" ? "find" : "press", input: { words: `w${index}` }, context: "k", stateBefore: "s1", stateAfter: after,
  effect, effectApplied: effect === "mutate", refused: false, answer: `a${index}`
});

describe("a change of approach on looks alone (0079 onwards)", () => {
  const caughtLooks = () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    for (let index = 1; index <= 2; index += 1) watch.ran(ranCall(index, "observe"));
    // As the loop does: the run of looks is caught before the call that made it is told to the detector, and that call is counted once.
    expect(watch.caught({ pattern: "no_progress", repeats: 3, toolIds: ["find"], unchanged: ["page"] })).toBeDefined();
    watch.ran(ranCall(3, "observe"));
    watch.decided("change_approach");
    return watch;
  };

  it("counts each further look that brings nothing, so the ladder's next rung comes as for a refused repeat", () => {
    const watch = caughtLooks();
    watch.ran(ranCall(4, "observe"));
    watch.ran(ranCall(5, "observe"));
    expect(watch.due()).toBeUndefined();
    watch.ran(ranCall(6, "observe"));
    expect(watch.due()).toMatchObject({ kind: "change_approach", pattern: "no_progress" });
  });

  it("takes an act as the different kind of step it is", () => {
    const watch = caughtLooks();
    watch.ran(ranCall(4, "mutate"));
    for (let index = 5; index <= 7; index += 1) watch.ran(ranCall(index, "observe"));
    expect(watch.due()).toBeUndefined();
  });
});

describe("the redirect of a loop no count ends", () => {
  it("counts down to nothing", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 5, maxStepsWithoutProgress: Number.POSITIVE_INFINITY, repeatingToolIds: ["find"], lastIssueCodes: [],
      proposableSteps: 0, completionAttempts: 0, canComplete: true, freshRoundFollows: true
    } as Parameters<typeof automationStudioLlmEvidenceStallRedirect>[0]);
    expect(note).not.toHaveProperty("maxStepsWithoutProgress");
    expect(note).not.toHaveProperty("stepsLeftBeforeStopping");
    expect(String(note.instruction)).not.toMatch(/more step\(s\) without progress|round ends|stops/u);
    expect(JSON.stringify(note)).not.toContain("null");
  });
});
