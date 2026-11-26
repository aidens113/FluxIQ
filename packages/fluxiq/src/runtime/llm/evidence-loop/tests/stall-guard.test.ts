// A loop that has started repeating itself is steered, and never stopped by a
// count of its steps without progress.
//
// **What these pin, and why.** A loop once stopped after eight steps in a row
// that gave it nothing new (`maxStepsWithoutProgress`), and a recovery
// exploration after three. That count ended rounds and started fresh ones with
// an empty evidence window, which is the reset the user ruled out (2026-11-24:
// "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
// EVERYTHING"; t1049). So:
//
//   1. there is no setting and no default for such a count, and no stop;
//   2. what counts as progress is still what the loop *learned*, not what it
//      *ran* -- a success that answers what the last one answered is a repeat,
//      and so is a repeat the caller announces by writing the count onto its
//      own answer -- because that count is what the loop steers by;
//   3. from the third step without progress the loop tells the model plainly
//      what it keeps repeating, what its draft has in it, and what is standing
//      between that draft and a finished Flow, on every further step, with no
//      countdown; a repeat is loop detection's to catch and the model's to
//      decide, and only the result, the purse or a person's Stop end a task.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS
} from "../../../loop-limits/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID,
  automationStudioLlmEvidenceStallRedirect,
  automationStudioLlmEvidenceStillMissing
} from "../index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../evidence-loop.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../harness/index.ts";

const look = [{ toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe" as const }];
const library = [{ toolId: "run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true as const }];

/** Many more steps without progress than the count that once stopped a loop. */
const MANY = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS * 4;

/** A press that answers the same every time, on a page that never changes: no step after the first teaches the loop anything. */
const pressesNothing = () => vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pressed: "nothing changed" }, effectApplied: false }));

/** Decisions past which a loop under test has run away: a test fails on it rather than hanging the run. */
const RUNAWAY = 200;

/** Presses, each a little different so no guard refuses it as the identical call, `count` times; then `last`. */
function presses(count: number, last: JsonObject) {
  return vi.fn(async ({ iteration }: { iteration: number }) => {
    if (iteration > RUNAWAY) throw new Error("runaway: nothing ended the loop");
    return iteration <= count
      ? { kind: "tool_call", callId: `call.${iteration}`, toolId: "run_node", input: { node: "web.dom.press", attempt: iteration } }
      : last;
  });
}

/**
 * The no-progress redirections the model was shown, newest last, across every
 * decision. A redirection leaves the evidence when a newer one arrives, so no
 * decision is shown more than one; each is counted once, by its call id.
 */
function redirections(decide: { mock: { calls: unknown[][] } }): JsonObject[] {
  const seen = new Map<string, JsonObject>();
  for (const call of decide.mock.calls) {
    const evidence = (call[0] as { evidence?: ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }> } | undefined)?.evidence ?? [];
    const shown = evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID);
    expect(shown.length).toBeLessThanOrEqual(1);
    for (const entry of shown) seen.set(entry.callId, entry.value as JsonObject);
  }
  return [...seen.values()];
}

describe("no count of steps without progress", () => {
  it("is a setting the loop takes, or a check it makes", async () => {
    const decide = presses(1, { kind: "complete", result: { done: true } });
    // An old caller's figure is no longer part of the contract: a loop given one is not refused for it, nor bound by it.
    const input = { tools: library, decide, executeTool: pressesNothing(), maxIterations: 4, maxToolCalls: 4, maxStepsWithoutProgress: 1 } as unknown as AutomationStudioLlmEvidenceLoopInput;
    await expect(runAutomationStudioLlmEvidenceLoop(input)).resolves.toMatchObject({ ok: true });
  });
});

describe("a loop that makes no progress", () => {
  // The proof the brief asks for (t1049): a round on the answer-first path (a caller with a loop signal), its model
  // repeating a press that changes nothing for four times the old stop, is steered all the way and ends with its result.
  it("keeps running, steered, until its result, however many steps without progress there are", async () => {
    const decide = presses(MANY, { kind: "complete", result: { done: true } });
    const signals: unknown[] = [];

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: library, decide, executeTool: pressesNothing(), dryRun: false,
      loopSignal: (signal) => {
        signals.push(signal);
        return "continue";
      }
    });

    expect(result).toMatchObject({ ok: true });
    expect(result.accounting.iterations).toBe(MANY + 1);
    // Steered, never stopped: from the third step without progress, on each one after it.
    const notes = redirections(decide);
    expect(notes.length).toBeGreaterThanOrEqual(MANY - AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS);
    expect(notes[0]).toMatchObject({ code: "llm_evidence_loop.no_progress", stepsWithoutProgress: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS, repeatingToolIds: ["run_node"] });
    expect(Math.max(...notes.map((note) => Number(note.stepsWithoutProgress)))).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
    // No countdown, and no word of stopping: there is no stop to count down to.
    for (const note of notes) {
      expect(note).not.toHaveProperty("maxStepsWithoutProgress");
      expect(note).not.toHaveProperty("stepsLeftBeforeStopping");
      expect(String(note.instruction)).not.toMatch(/without progress (stop|and this)/u);
    }
  });

  it("keeps running, steered, until the purse ends it", async () => {
    // Each decision is asked through the real harness, as a build asks it, and reports a cent spent against a purse of
    // a quarter: the purse refusing the next decision, never a count, is what ends it.
    let asked = 0;
    const llm: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      estimateCostUsd: ({ inputTokens, outputTokens }) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000,
      runTask: async () => {
        asked += 1;
        if (asked > RUNAWAY) throw new Error("runaway: the purse never ended the loop");
        return {
          response: { kind: "evidence_tool_decision", summary: "Again.", decision: { kind: "tool_call", callId: `call.${asked}`, toolId: "run_node", input: { node: "web.dom.press", attempt: asked } } },
          usage: { inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.01 }
        };
      }
    };
    const decide = vi.fn(async ({ iteration, tools, evidence, decisionSchema, canComplete }: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]) => {
      const decision = await runAutomationStudioLlmHarness({
        taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", instructions: [],
        evidenceLoop: { iteration, tools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema: { type: "object" }, canComplete },
        provider: llm, tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, expectedOutput: "evidence_tool_decision", deniedEvidenceKeys: []
      });
      if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw new Error(`decision failed: ${decision.diagnostics.map((item) => item.code).join(",")}`);
      return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: library, decide, executeTool: pressesNothing(), dryRun: false, completionSchema: { type: "object" }, propagateDecisionErrors: true,
      budget: { maxCostUsd: 0.25 }, loopSignal: () => "continue"
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit", exhaustion: { bound: "budget", budgetBound: "cost" } });
    expect(asked).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS * 2);
    expect(redirections(decide).length).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
  });

  it("on a loop with no loop signal, runs past the old stop to its own ceiling, steered", async () => {
    const decide = presses(Number.MAX_SAFE_INTEGER, { kind: "complete", result: {} });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool: pressesNothing(), maxIterations: 48, maxToolCalls: 48, dryRun: false });

    // Not repeat_without_progress at eight: the loop's own iteration ceiling, which is a different bound.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit" });
    expect(result.accounting.iterations).toBe(48);
    expect(redirections(decide).length).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
  });

  it("counts a success that answers what the last one answered as a step without progress, and steers on it", async () => {
    const decide = presses(6, { kind: "complete", result: {} });
    // `ok: true`, so nothing about this call says it failed -- and the same bytes every time.
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, rows: ["a", "b"] }, effectApplied: false }));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48, dryRun: false });

    expect(result.ok).toBe(true);
    // The first answer is new; the five after it are not, so the redirect came at the third of them.
    expect(redirections(decide).map((note) => note.stepsWithoutProgress)).toEqual([3, 4, 5]);
  });

  it("believes a caller that says it is repeating itself, although saying so makes every repeat differ", async () => {
    let call = 0;
    const decide = presses(6, { kind: "complete", result: {} });
    // The web domain's own repeat notice writes the count onto the packet, so no two answers are the same bytes: only
    // the caller's own count can say they repeat.
    const executeTool = vi.fn(async () => {
      call += 1;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, saidAgain: call + 1 }, effectApplied: false, repeatedAnswer: call + 1 };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48, dryRun: false });

    expect(result.ok).toBe(true);
    expect(redirections(decide).map((note) => note.stepsWithoutProgress)).toEqual([3, 4, 5, 6]);
  });
});

describe("a loop that is working", () => {
  it("is neither redirected nor stopped for meeting a setback, looking again and trying another way", async () => {
    // Two steps that gathered nothing new, which is what an ordinary recovery
    // costs, and then a step that did something. The redirection fires at
    // three, so this run must see none of it.
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "run_node", input: { node: "press" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: "run_node", input: { node: "press.again" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.3", toolId: "run_node", input: { node: "press.another.way" } })
      .mockResolvedValueOnce({ kind: "complete", result: { summary: "Done." } });
    const executeTool = vi.fn()
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "blocked_by_dialog" }, effectApplied: false })
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_moved" }, effectApplied: false })
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: true, pressed: true }, effectApplied: true, draft: { actionId: "press", effect: "mutate", proposes: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48 });

    expect(result.ok).toBe(true);
    expect(redirections(decide)).toEqual([]);
  });

  it("is never redirected while the answers keep changing", async () => {
    let call = 0;
    const decide = presses(Number.MAX_SAFE_INTEGER, { kind: "complete", result: {} });
    const executeTool = vi.fn(async () => {
      call += 1;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, sawSomethingNew: call }, effectApplied: false };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit" });
    expect(result.accounting.iterations).toBe(12);
    expect(redirections(decide)).toEqual([]);
  });
});

describe("what the loop says instead of stopping", () => {
  it("names what the model already holds, what its draft has in it, and what refused the last attempt to finish, with no countdown", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 4,
      repeatingToolIds: ["web.detect_repeating_structure", "core.run_node"],
      proposableSteps: 6,
      completionAttempts: 2,
      lastIssueCodes: ["bootstrap.cannot_answer_instruction"],
      canComplete: true
    });

    expect(note).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.no_progress",
      stepsWithoutProgress: 4,
      repeatingToolIds: ["web.detect_repeating_structure", "core.run_node"],
      draftStepsSoFar: 6,
      completionAttempts: 2,
      lastCompletionIssueCodes: ["bootstrap.cannot_answer_instruction"]
    });
    expect(note).not.toHaveProperty("maxStepsWithoutProgress");
    expect(note).not.toHaveProperty("stepsLeftBeforeStopping");
    expect(String(note.instruction)).toContain("6 step(s)");
    expect(String(note.instruction)).toContain("lastCompletionIssueCodes");
    expect(String(note.instruction)).toContain("The last 4 steps told you nothing you did not already have.");
    expect(String(note.instruction)).not.toContain("more step(s) without progress");
    expect(String(note.instruction)).not.toContain("stops");
  });

  it("tells a build with nothing to propose that finishing now would produce nothing", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, repeatingToolIds: [],
      proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true
    });

    expect(note).not.toHaveProperty("lastCompletionIssueCodes");
    expect(String(note.instruction)).toContain("no step that could be proposed yet");
  });

  it("carries codes, identifiers and counts only, and stays small enough to sit beside the evidence", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 7,
      // A model's words and a page's text, offered where codes belong.
      repeatingToolIds: ["core.run_node", "I could not find the sage green kettle"],
      proposableSteps: 3, completionAttempts: 1,
      lastIssueCodes: ["bootstrap.cannot_answer_instruction", "the list had no rows in it"],
      canComplete: false
    });

    expect(note.repeatingToolIds).toEqual(["core.run_node"]);
    expect(note.lastCompletionIssueCodes).toEqual(["bootstrap.cannot_answer_instruction"]);
    expect(Buffer.byteLength(JSON.stringify(note), "utf8")).toBeLessThan(1_024);
  });
});

// **The stall is a symptom; what it circles is the cause.** On
// `run-mulum3x7-18ceeb75` the model tried to finish at iteration 20 and Core
// refused with `bootstrap.cannot_answer_instruction`: the instruction asked for
// a table and no step of the draft produced one. The spinning either side of it
// was the model circling that gap.
describe("a stalled loop is pointed at what the plan still lacks", () => {
  const cannotAnswer = {
    ok: false,
    issueCodes: ["bootstrap.cannot_answer_instruction"],
    feedback: { code: "bootstrap.cannot_answer_instruction" },
    answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false, issueCode: "bootstrap.cannot_answer_instruction" as const }
  };

  it("keeps naming a refused completion's gap after tool calls, which is when the model needs it", async () => {
    // Press (progress), try to finish (refused: no records), then inspect the
    // same thing over and over -- the live run's shape after iteration 20 --
    // and, twelve inspections on, finish.
    const decide = vi.fn(async ({ iteration }: { iteration: number }) => iteration === 1
      ? { kind: "tool_call", callId: "call.1", toolId: "run_node", input: { node: "web.dom.press" } }
      : iteration === 2
        ? { kind: "complete", result: { summary: "Put the kettles in the cart." } }
        : iteration < 15
          ? { kind: "tool_call", callId: `call.${iteration}`, toolId: "run_node", input: { node: "web.dom.inspect", attempt: iteration } }
          : { kind: "complete", result: { summary: "Gave up." } });
    const executeTool = vi.fn(async (call: { value: JsonObject }) => call.value.node === "web.dom.press"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pressed: true }, effectApplied: true, draft: { actionId: "web.dom.press", effect: "mutate" as const, proposes: true } }
      : { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, inspected: "the cart" }, effectApplied: false, draft: { actionId: "web.dom.inspect", effect: "observe" as const, proposes: false } });
    let checks = 0;

    await runAutomationStudioLlmEvidenceLoop({
      tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48,
      checkCompletion: async () => (checks += 1) === 1 ? cannotAnswer : { ok: true },
      unusableDecisions: { stalled: () => new Error("stalled") }
    });

    const notes = redirections(decide);
    expect(notes.length).toBeGreaterThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS - AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS);
    // Every one of them, not only the first: the refusal is carried until the
    // model tries to finish again.
    for (const note of notes) {
      expect(note).toMatchObject({ stillMissing: "record_producer", lastCompletionIssueCodes: ["bootstrap.cannot_answer_instruction"], completionAttempts: 1 });
      // It leads with the gap and never tells the model to finish over it.
      expect(String(note.instruction).startsWith("Your last attempt to finish was refused because the instruction asks for a set of records")).toBe(true);
      expect(String(note.instruction)).not.toContain("complete now");
    }
  });

  it("reads a gap only where the completion check found one", () => {
    expect(automationStudioLlmEvidenceStillMissing(undefined)).toBeUndefined();
    expect(automationStudioLlmEvidenceStillMissing(cannotAnswer.answerability)).toBe("record_producer");
    // Records asked for and a step that returns them: nothing missing.
    expect(automationStudioLlmEvidenceStillMissing({ recordsRequested: true, recordProducerPresent: true, recordStorePresent: false })).toBeUndefined();
    // A step that only saves them answers too.
    expect(automationStudioLlmEvidenceStillMissing({ recordsRequested: true, recordProducerPresent: false, recordStorePresent: true })).toBeUndefined();
    // No records asked for, so none can be missing.
    expect(automationStudioLlmEvidenceStillMissing({ recordsRequested: false, recordProducerPresent: false, recordStorePresent: false })).toBeUndefined();
  });

  it("stays small, codes and counts only, with the gap named", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 7, repeatingToolIds: ["core.run_node", "web.detect_repeating_structure"],
      proposableSteps: 6, completionAttempts: 3, lastIssueCodes: ["bootstrap.cannot_answer_instruction"], canComplete: true,
      answerability: cannotAnswer.answerability
    });

    expect(note.stillMissing).toBe("record_producer");
    expect(String(note.instruction).endsWith("Do the missing step.")).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(note), "utf8")).toBeLessThan(1_536);
  });
});
