// A loop that has started repeating itself is redirected, and then stopped,
// long before its iterations run out.
//
// **What these pin, and why they are worth pinning.** Every no-progress guard
// was held to `maxIterations`, and on a Lab creation run `maxIterations` *is*
// the call budget, so no guard could fire before the calls did. Every stall
// therefore arrived as an exhaustion, the ending said "it ran out of turns",
// and the only lever anybody reached for was a bigger budget -- which buys more
// repetition. `run-mulum3x7-18ceeb75` (2026-09-28) spent 22 of 34 paid
// decisions on answers it already held, had 14 of its 48 calls left, and
// produced no Flow.
//
// Three properties keep that from coming back, and each has a test here:
//
//   1. the guard is a fraction of the iterations, never all of them, at every
//      call count the Lab uses;
//   2. what counts as progress is what the loop *learned*, not what it *ran* --
//      a success that answers what the last one answered is a repeat, and so is
//      a repeat the caller announces by writing the count onto its own answer,
//      which is the one kind the bytes cannot see;
//   3. reaching the guard is the last resort. Well before it, the loop changes
//      what it is asking for: it tells the model plainly that it already holds
//      this, what its draft has in it, and what is standing between that draft
//      and a finished Flow.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS,
  automationStudioFlowBootstrapEvidenceLoopLimits
} from "../../../loop-limits/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID,
  automationStudioLlmEvidenceStallRedirect,
  automationStudioLlmEvidenceStillMissing
} from "../index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";

const look = [{ toolId: "inspect", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe" as const }];
const library = [{ toolId: "run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true as const }];

/** A decision that asks for the same tool forever, so the loop's own guards are the only thing that can end it. */
function asksForever(toolId: string) {
  let call = 0;
  return vi.fn(async () => {
    call += 1;
    return { kind: "tool_call", callId: `call.${call}`, toolId, input: { attempt: call } };
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

describe("a guard that can actually fire", () => {
  it("is a fraction of the iterations at every call count a live build is given, never all of them", () => {
    // The defect in one assertion. Before this, `maxConsecutiveUnusableDecisions`
    // was `min(24, maxIterations)`, so a 26-call build got 24 and a 48-call
    // build got 24 -- and with the loop spending one iteration per decision,
    // neither could reach it before the budget ended the run.
    for (const maxCallsPerRun of [26, 48, 64]) {
      const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun });
      expect(limits.loop.maxIterations).toBe(maxCallsPerRun);
      expect(limits.maxConsecutiveUnusableDecisions).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
      expect(limits.maxConsecutiveUnusableDecisions).toBeLessThan(limits.loop.maxIterations / 3);
    }
  });

  it("redirects strictly before it stops, so stopping is never the loop's first answer to a stall", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS)
      .toBeLessThan(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
  });
});

describe("a loop told the same thing over and over", () => {
  it("stops on the guard at a fraction of its iterations, having redirected the model first", async () => {
    const decide = asksForever("inspect");
    // One refusal, the same every time: the shape of four of the live run's
    // `no_repeating_structure` answers.
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "nothing_repeats" }, effectApplied: false }));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: look, decide, executeTool, maxIterations: 48, maxToolCalls: 48 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    // Eight of forty-eight. The ending is the guard, not the ceiling, and the
    // run kept forty of its calls.
    expect(result.accounting.iterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
    // Five redirections before the stop: one for each step from the third to
    // the seventh. The model was told five times over, in plain words, before
    // anything was taken away from it.
    const notes = redirections(decide);
    expect(notes).toHaveLength(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS - AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS);
    expect(notes[0]).toMatchObject({
      code: "llm_evidence_loop.no_progress",
      stepsWithoutProgress: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_REDIRECT_AT_STEPS_WITHOUT_PROGRESS,
      repeatingToolIds: ["inspect"]
    });
    // It counts down, so a model reading two of them can see which way it is going.
    expect(notes.map((note) => note.stepsLeftBeforeStopping)).toEqual([5, 4, 3, 2, 1]);
  });

  it("counts a success that answers what the last one answered, which is how the live run's whole tail escaped", async () => {
    const decide = asksForever("inspect");
    // `ok: true`, so nothing about this call says it failed -- and 8,960 bytes
    // that are the same 8,960 bytes every time, which is what
    // `run-mulum3x7-18ceeb75` spent its last ten decisions on.
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, rows: ["a", "b"] }, effectApplied: false }));

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: look, decide, executeTool, maxIterations: 48, maxToolCalls: 48 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    // The guard plus the first call, which is a repeat of nothing: an answer is
    // only ever a repeat of one the same tool already gave.
    expect(result.accounting.iterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS + 1);
  });

  it("believes a caller that says it is repeating itself, although saying so makes every repeat differ", async () => {
    let call = 0;
    const decide = asksForever("inspect");
    // The web domain's own repeat notice, which counts from 2 and writes the
    // count onto the packet. Every answer here succeeds and no two are the same
    // bytes, so neither the `ok: false` test nor the byte comparison can see
    // this: only the caller's own count can.
    const executeTool = vi.fn(async () => {
      call += 1;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, saidAgain: call + 1 }, effectApplied: false, repeatedAnswer: call + 1 };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: look, decide, executeTool, maxIterations: 48, maxToolCalls: 48 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.iterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
  });

  it("does not hold a rerun's identical result to be progress, however the model asked for it", async () => {
    // The live run's tail exactly: amend with a `rerun`, which is deliberately
    // never a repeat because the model has just said to run it again, and then
    // the rerun answering what it answered last time. The amendment used to
    // clear nothing and the rerun used to clear everything, so the pair could
    // be repeated forever. Now the amendment still clears nothing and the
    // identical answer counts.
    // One press that worked, so the draft has a step worth proposing and
    // amendments stay on offer, then an inspection, then that inspection asked
    // for again and again. A rerun withdraws the step it replaces and the new
    // one is appended, so the position the model names climbs by one each time
    // -- which is the draft working as designed, not part of what is under test.
    let inspectedAt = 2;
    const decide = vi.fn(async ({ iteration }: { iteration: number }) => {
      if (iteration === 1) return { kind: "tool_call", callId: "call.1", toolId: "run_node", input: { node: "web.dom.press" } };
      if (iteration === 2) return { kind: "tool_call", callId: "call.2", toolId: "run_node", input: { node: "web.dom.inspect" } };
      const step = inspectedAt;
      inspectedAt += 1;
      return { kind: "amend_draft", amendments: [{ step, change: "rerun", input: { node: "web.dom.inspect" } }] };
    });
    const executeTool = vi.fn(async (call: { value: JsonObject }) => call.value.node === "web.dom.press"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pressed: true }, effectApplied: true, draft: { actionId: "web.dom.press", effect: "mutate" as const, proposes: true } }
      : { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, inspected: "the same list" }, effectApplied: false, draft: { actionId: "web.dom.inspect", effect: "observe" as const, proposes: false } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48 });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    // Far short of forty-eight. Before this the pair laundered every repeat --
    // the amendment cleared nothing, the identical rerun cleared everything --
    // and the count never rose above one for nine decisions together.
    expect(result.accounting.iterations).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS + 3);
    expect(redirections(decide).length).toBeGreaterThan(0);
  });
});

describe("a loop that is working", () => {
  it("is neither redirected nor stopped for meeting a setback, looking again and trying another way", async () => {
    // Two steps that gathered nothing new, which is what an ordinary recovery
    // costs, and then a step that did something. The redirection fires at
    // three, so this run must see none of it -- the reason three was wrong as a
    // *stop* is exactly the reason it has to be right as a *nudge*.
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

  it("keeps going for as long as the answers keep changing", async () => {
    let call = 0;
    const decide = asksForever("inspect");
    const executeTool = vi.fn(async () => {
      call += 1;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, sawSomethingNew: call }, effectApplied: false };
    });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: look, decide, executeTool, maxIterations: 12, maxToolCalls: 12 });

    // The ceiling, not the guard: a loop that learns something every call is
    // never redirected and never stopped early, however long it goes on.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.iteration_limit" });
    expect(result.accounting.iterations).toBe(12);
    expect(redirections(decide)).toEqual([]);
  });
});

describe("what the loop says instead of stopping", () => {
  it("names what the model already holds, what its draft has in it, and what refused the last attempt to finish", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 4,
      maxStepsWithoutProgress: 8,
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
      maxStepsWithoutProgress: 8,
      stepsLeftBeforeStopping: 4,
      repeatingToolIds: ["web.detect_repeating_structure", "core.run_node"],
      draftStepsSoFar: 6,
      completionAttempts: 2,
      lastCompletionIssueCodes: ["bootstrap.cannot_answer_instruction"]
    });
    // The whole point of the entry: the draft it has, and the one thing between
    // that draft and a Flow.
    expect(String(note.instruction)).toContain("6 step(s)");
    expect(String(note.instruction)).toContain("lastCompletionIssueCodes");
    expect(String(note.instruction)).toContain("4 more step(s) without progress");
  });

  it("tells a build with nothing to propose that finishing now would produce nothing", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [],
      proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true
    });

    expect(note).not.toHaveProperty("lastCompletionIssueCodes");
    expect(String(note.instruction)).toContain("no step that could be proposed yet");
  });

  it("carries codes, identifiers and counts only, and stays small enough to sit beside the evidence", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 7, maxStepsWithoutProgress: 8,
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
// was the model circling that gap. The refusal was said once -- and the next
// tool call reset the only counter the redirection read it from, so every later
// redirection would have been silent about the one thing that mattered.
describe("a stalled loop is pointed at what the plan still lacks", () => {
  const cannotAnswer = {
    ok: false,
    issueCodes: ["bootstrap.cannot_answer_instruction"],
    feedback: { code: "bootstrap.cannot_answer_instruction" },
    answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false, issueCode: "bootstrap.cannot_answer_instruction" as const }
  };

  it("keeps naming a refused completion's gap after tool calls, which is when the model needs it", async () => {
    // Press (progress), try to finish (refused: no records), then inspect the
    // same thing over and over -- the live run's shape after iteration 20.
    const decide = vi.fn(async ({ iteration }: { iteration: number }) => iteration === 1
      ? { kind: "tool_call", callId: "call.1", toolId: "run_node", input: { node: "web.dom.press" } }
      : iteration === 2
        ? { kind: "complete", result: { summary: "Put the kettles in the cart." } }
        : { kind: "tool_call", callId: `call.${iteration}`, toolId: "run_node", input: { node: "web.dom.inspect", attempt: iteration } });
    const executeTool = vi.fn(async (call: { value: JsonObject }) => call.value.node === "web.dom.press"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pressed: true }, effectApplied: true, draft: { actionId: "web.dom.press", effect: "mutate" as const, proposes: true } }
      : { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, inspected: "the cart" }, effectApplied: false, draft: { actionId: "web.dom.inspect", effect: "observe" as const, proposes: false } });

    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: library, decide, executeTool, maxIterations: 48, maxToolCalls: 48,
      checkCompletion: async () => cannotAnswer,
      unusableDecisions: { stalled: () => new Error("stalled") }
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    const notes = redirections(decide);
    expect(notes.length).toBeGreaterThan(0);
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
      stepsWithoutProgress: 7, maxStepsWithoutProgress: 8, repeatingToolIds: ["core.run_node", "web.detect_repeating_structure"],
      proposableSteps: 6, completionAttempts: 3, lastIssueCodes: ["bootstrap.cannot_answer_instruction"], canComplete: true,
      answerability: cannotAnswer.answerability
    });

    expect(note.stillMissing).toBe("record_producer");
    expect(String(note.instruction)).toContain("Do the missing step. 1 more step(s) without progress");
    expect(Buffer.byteLength(JSON.stringify(note), "utf8")).toBeLessThan(1_536);
  });
});
