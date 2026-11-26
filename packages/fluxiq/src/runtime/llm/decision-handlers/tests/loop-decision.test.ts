// The model's own decision about a caught repeat (user, 2026-11-19), through the real evidence loop
// with a scripted model: the steer names the repeat, how often and what each came back with, and
// asks for one decision; each decision is carried out; each is recorded. The sites are made up.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../index.ts";
import { automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopSignal } from "../../repeat-guard/index.ts";

const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const stalledError = new Error("stalled");
const LADDER = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown; tools: ReadonlyArray<{ toolId: string }> }).evidence;
const noteAt = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject | undefined => shownAt(decide, index).filter((entry) => entry.toolId === toolId).at(-1)?.value;
const press = (index: number) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target: "Close", reason: `try ${index}` } });
const decided = (index: number, input: JsonObject) => ({ kind: "tool_call", callId: `decide.${index}`, toolId: "core.loop_decision", input });
const done = { kind: "complete", result: { done: true } };
/** A control something covers: refused every time, on a page that never moves. */
const covered = () => vi.fn(async () => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_covered", draft: { actionId: "web.click", effect: "mutate", proposes: true } }));

/** Two reworded presses (the second is caught and steered), then the scripted rest. */
function script(rest: readonly unknown[]) {
  const steps = [press(1), press(2), ...rest];
  const decide = vi.fn();
  decide.mockImplementation(async () => steps[decide.mock.calls.length - 1] ?? done);
  return decide;
}

function run(decide: ReturnType<typeof vi.fn>, extra: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) {
  const executeTool = covered();
  const signals: AutomationStudioLlmLoopSignal[] = [];
  const record = extra.attemptRecord ?? automationStudioLlmLoopAttemptRecord();
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: executeTool as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 60, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { stalled: () => stalledError },
    loopSignal: (signal: AutomationStudioLlmLoopSignal) => {
      signals.push(signal);
      return "end";
    },
    ...extra,
    attemptRecord: record
  } as AutomationStudioLlmEvidenceLoopInput);
  return { ran, executeTool, signals, record };
}

describe("a caught repeat asks the model to decide", () => {
  it("offers core.loop_decision from the first decision, and the steer names the repeat, how often, and what each came back with", async () => {
    const decide = script([]);
    await run(decide).ran;
    expect((decide.mock.calls[0]![0] as { tools: { toolId: string }[] }).tools.map((tool) => tool.toolId)).toContain("core.loop_decision");
    const steer = noteAt(decide, 2, "core.loop_check");
    expect(steer).toMatchObject({ pattern: "near_repeat", repeats: 2, toolIds: ["press"] });
    expect(String(steer?.instruction)).toContain("same call to press on the same page 2 times");
    expect(String(steer?.instruction)).toContain("your next decision is a call to core.loop_decision");
    expect(steer?.decide).toMatchObject({ tool: "core.loop_decision", cameBack: [
      { callId: "press.1", toolId: "press", came: "web.action.rejected.target_covered" },
      { callId: "press.2", toolId: "press", came: "web.action.rejected.target_covered" }
    ] });
  });

  // Every loop is offered its own decision now (t1056): no count ends a loop with no loop signal either, so it is
  // steered and decides how to go on. Only asking the person, which nobody can carry out from there, is left out.
  it("is offered where nobody can carry an ask_person out, without ask_person", async () => {
    const decide = script([]);
    await run(decide, { loopSignal: undefined }).ran.catch(() => undefined);
    expect((decide.mock.calls[0]![0] as { tools: { toolId: string }[] }).tools.map((tool) => tool.toolId)).toContain("core.loop_decision");
    const ask = noteAt(decide, 2, "core.loop_check")?.decide as { offered?: unknown; instruction?: unknown } | undefined;
    expect(ask?.offered).not.toContain("ask_person");
    expect(String(ask?.instruction)).toContain("No person can be asked from here");
  });
});

describe("each decision is carried out and recorded", () => {
  it("continue: the repeat runs again, and when it is caught again the model is asked again with the count", async () => {
    const decide = script([decided(3, { decision: "continue", why: "the list loads late" }), press(4)]);
    const { ran, executeTool, record } = run(decide);
    await ran;
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ ok: true, code: "core.loop_decision.carried_out", decision: "continue" });
    expect(noteAt(decide, 4, "core.loop_check")).toMatchObject({ pattern: "near_repeat", repeats: 3 });
    expect(record.data().decisions).toEqual([{ decision: "continue", pattern: "near_repeat", repeats: 2 }]);
  });

  it("change_approach: the repeat stays refused", async () => {
    const decide = script([decided(3, { decision: "change_approach", approach: "open the menu first" }), press(4)]);
    const { ran, executeTool, record } = run(decide);
    await ran;
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(noteAt(decide, 4, "core.repeat_check")).toMatchObject({ code: "llm_evidence_loop.repeat_refused" });
    expect(record.data().decisions).toEqual([{ decision: "change_approach", pattern: "near_repeat", repeats: 2 }]);
  });

  it("rejects obsolete escalate_model decisions with same-model feedback and does not record an action", async () => {
    const record = automationStudioLlmLoopAttemptRecord();
    record.ladder.serve(LADDER);
    const decide = script([decided(3, { decision: "escalate_model" })]);
    await run(decide, { attemptRecord: record }).ran;
    expect(record.ladder.level).toBe(0);
    expect(record.data().decisions).toBeUndefined();
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ ok: false, code: "core.loop_decision.invalid" });
    expect(String(noteAt(decide, 3, "core.loop_decision")?.instruction)).toContain("keeps its starting model");
  });

  /** An attempt that already changed approach: a repeat caught again from here on is a loop that persists, and the last resort opens. */
  const changedApproach = () => {
    const tried = automationStudioLlmLoopAttemptRecord();
    tried.decided({ decision: "change_approach", pattern: "near_repeat", repeats: 2 });
    return tried;
  };
  const ASK = { decision: "ask_person", question: "Which store should I use?", why: "the instructions name a store that does not exist, and only the person can say which they meant" };

  // The user, 2026-11-19: "it seems to be asking the user too quickly for input", and "ONLY stop and ask user for feedback if its legit
  // impossible to complete a task under the guidelines given by user". t983 (002650596) dropped this gate with the model ladder; t1000 restored it.
  it("ask_person is last: absent from the first catch's ask, and refused if called there", async () => {
    const decide = script([decided(3, ASK)]);
    const { ran, signals, record } = run(decide);
    await ran.catch(() => undefined);
    const ask = noteAt(decide, 2, "core.loop_check")?.decide as JsonObject;
    expect(ask.offered).toEqual(["continue", "change_approach", "finish_with_best"]);
    expect(String(ask.instruction)).toContain("Asking the person is a last resort, offered only once you have changed approach and the repeat still comes back");
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ ok: false, code: "core.loop_decision.ask_person_not_offered", offered: ["continue", "change_approach", "finish_with_best"] });
    expect(signals).toHaveLength(0);
    expect(record.data().decisions).toBeUndefined();
  });

  it("ask_person stays refused straight after a change_approach, before the repeat has come back", async () => {
    const decide = script([decided(3, { decision: "change_approach", approach: "open the menu first" }), decided(4, ASK)]);
    const { ran, signals, record } = run(decide);
    await ran.catch(() => undefined);
    expect(noteAt(decide, 4, "core.loop_decision")).toMatchObject({ ok: false, code: "core.loop_decision.ask_person_not_offered" });
    expect(String(noteAt(decide, 4, "core.loop_decision")?.instruction)).toContain("nothing has been repeated since you changed approach");
    expect(signals).toHaveLength(0);
    expect(record.data().decisions?.map((each) => each.decision)).toEqual(["change_approach"]);
  });

  it("ask_person joins once the model changed approach and the repeat came back, and the person is asked its own question through the loop's caller", async () => {
    const decide = script([decided(3, { decision: "change_approach", approach: "open the menu first" }), press(4), decided(5, ASK)]);
    const { ran, signals, record } = run(decide);
    await expect(ran).rejects.toBe(stalledError);
    // The repeat came back after the change, refused: its note asks for a decision again, now with the person on offer.
    expect((noteAt(decide, 4, "core.repeat_check")?.decide as JsonObject | undefined)?.offered).toEqual(["continue", "change_approach", "ask_person", "finish_with_best"]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "ask_person", question: "Which store should I use?", toolIds: ["press"] });
    expect(record.data().decisions?.map((each) => each.decision)).toEqual(["change_approach", "ask_person"]);
  });

  it("ask_person on an attempt that changed approach before is offered once a repeat is caught again", async () => {
    const decide = script([decided(3, ASK)]);
    const record = changedApproach();
    const { ran, signals } = run(decide, { attemptRecord: record });
    await expect(ran).rejects.toBe(stalledError);
    expect(noteAt(decide, 2, "core.loop_check")?.decide).toMatchObject({ offered: ["continue", "change_approach", "ask_person", "finish_with_best"] });
    expect(signals).toHaveLength(1);
    expect(record.data().decisions?.at(-1)).toEqual({ decision: "ask_person", pattern: "near_repeat", repeats: 2 });
  });

  it("ask_person needs a stated reason naming what is impossible and why, even where it is offered, and the prompt says it is only for the genuinely impossible", async () => {
    const decide = script([decided(3, { decision: "ask_person", question: "Which store should I use?" })]);
    const record = changedApproach();
    const { ran, signals } = run(decide, { attemptRecord: record });
    await ran.catch(() => undefined);
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ ok: false, code: "core.loop_decision.invalid" });
    expect(String(noteAt(decide, 3, "core.loop_decision")?.instruction)).toContain("ask_person needs why");
    expect(signals).toHaveLength(0);
    expect(record.data().decisions?.map((each) => each.decision)).toEqual(["change_approach"]);
    expect(String((noteAt(decide, 2, "core.loop_check")?.decide as JsonObject).instruction)).toContain("genuinely impossible under their instructions");
  });

  it("finish_with_best: the result goes to the completion check as the attempt's result", async () => {
    const checkCompletion = vi.fn(async () => ({ ok: true as const }));
    const decide = script([decided(3, { decision: "finish_with_best", result: { answer: "the best there is" } })]);
    const { ran, record } = run(decide, { checkCompletion } as Partial<AutomationStudioLlmEvidenceLoopInput>);
    await expect(ran).resolves.toMatchObject({ ok: true, result: { answer: "the best there is" } });
    expect(checkCompletion).toHaveBeenCalledTimes(1);
    expect((checkCompletion.mock.calls[0] as unknown[])[0]).toEqual({ answer: "the best there is" });
    expect(record.data().decisions).toEqual([{ decision: "finish_with_best", pattern: "near_repeat", repeats: 2 }]);
  });

  it("a decision missing what it must carry is answered with what is missing, and asked again", async () => {
    const decide = script([decided(3, { decision: "continue" })]);
    const { ran, record } = run(decide);
    await ran;
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ ok: false, code: "core.loop_decision.invalid" });
    expect(String(noteAt(decide, 3, "core.loop_decision")?.instruction)).toContain("continue needs why");
    expect(record.data().decisions).toBeUndefined();
  });
});

describe("what the Lab sees of a decision", () => {
  const directory = { path: "" };
  beforeEach(() => {
    directory.path = mkdtempSync(join(tmpdir(), "loop-decision-steps-"));
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory.path;
  });
  afterEach(() => {
    delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    rmSync(directory.path, { recursive: true, force: true });
  });

  it("is a step folder with the decision and the repeat it was about", async () => {
    await run(script([decided(3, { decision: "change_approach", approach: "open the menu first" })])).ran;
    const folders = readdirSync(directory.path).filter((name) => /^\d{4,}-loop_decision$/u.test(name));
    expect(folders).toHaveLength(1);
    const meta = JSON.parse(readFileSync(join(directory.path, folders[0]!, "meta.json"), "utf8")) as JsonObject;
    expect(meta).toMatchObject({ kind: "loop_decision", decision: "change_approach", pattern: "near_repeat", repeats: 2, toolIds: ["press"] });
    expect(meta).toMatchObject({ offered: ["continue", "change_approach", "finish_with_best"], askPerson: "after_change_approach", approachesChanged: 0 });
  });
});
