// Unreadable decision replies in a loop no count ends (t1014): the loop the answer-first rounds run, which takes loop
// detection's signal. Six in a row once ended the round and the next one started with an empty evidence window (user,
// 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). Now each re-ask
// names what could not be read and where the reply parted from the schema; two in a row that failed the same way are a
// loop finding for the deciding role, steered with the model's own decision, as a judge's are (t1000); and only loop
// detection's last rung ends the round. A caller that does not take the signal has no count either (t1056).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceLoopInput
} from "../../../../index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID, automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopSignal } from "../../index.ts";

const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" }, effect: "observe" as const }];
const complete = { kind: "complete", result: { done: true } };
const usage = { inputTokens: 900, outputTokens: 560, totalTokens: 1460, estimatedCostUsd: 0.002 };
/** A reply off the schema, missing what `path` names: the same miss is the same unreadable reply again. */
const offShape = (path = "response.decision.input") => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: "content_off_shape", finishReason: "stop", contentChars: 900, usage, misses: [{ path, rule: "is required" }] });
/** Replies that fail a different way each time: never the same one again. */
const CASES = ["content_mismatched", "content_unclosed", "content_fenced", "content_prefixed", "content_trailing", "content_invalid", "content_not_object", "content_empty"] as const;
const differently = (index: number) => new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"], { case: CASES[index % CASES.length]!, finishReason: "stop", contentChars: 900, usage });
const stalledError = new Error("stalled");
/** The count of unreadable replies in a row that once ended a loop (t1056 removed it). */
const OLD_UNREADABLE_IN_A_ROW = 6;

type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const latest = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject | undefined => shownAt(decide, index).filter((entry) => entry.toolId === toolId).at(-1)?.value;

/** The loop as an answer-first round runs it: a caller that takes loop detection's signal. */
function round(decide: ReturnType<typeof vi.fn>, extra: Partial<AutomationStudioLlmEvidenceLoopInput> = {}) {
  const signals: AutomationStudioLlmLoopSignal[] = [];
  const record = automationStudioLlmLoopAttemptRecord();
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: async () => ({ seen: true }),
    maxIterations: 8, maxToolCalls: 8, dryRun: false, propagateDecisionErrors: true, attemptRecord: record,
    unusableDecisions: { stalled: () => stalledError },
    loopSignal: (signal: AutomationStudioLlmLoopSignal) => {
      signals.push(signal);
      return "end";
    },
    ...extra
  } as AutomationStudioLlmEvidenceLoopInput);
  return { ran, signals, record };
}

describe("unreadable decision replies where no count ends the round (t1014)", () => {
  it("are asked again past the old count when each fails a different way, and the round goes on to its result", async () => {
    const decide = vi.fn();
    const unreadable = OLD_UNREADABLE_IN_A_ROW + 4;
    decide.mockImplementation(async () => {
      const at = decide.mock.calls.length;
      if (at <= unreadable) throw differently(at);
      return complete;
    });
    const { ran, signals } = round(decide);

    await expect(ran).resolves.toMatchObject({ ok: true, result: { done: true } });
    expect(decide).toHaveBeenCalledTimes(unreadable + 1);
    expect(signals).toEqual([]);
    // No count is told, since none ends it; and replies that differ are no repeat.
    const feedback = latest(decide, unreadable, AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID);
    expect(feedback).toMatchObject({ code: "llm_evidence_loop.reply_unreadable", unreadableInARow: unreadable });
    expect(feedback?.maxUnreadableInARow).toBeUndefined();
    expect(String(feedback?.instruction)).not.toContain("stop this build");
    expect(latest(decide, unreadable, "core.loop_check")).toBeUndefined();
  });

  it("the same unreadable reply twice is a loop finding for the deciding role: the re-ask names the schema part, and the model is asked to decide", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => {
      if (decide.mock.calls.length <= 2) throw offShape();
      return complete;
    });
    const { ran, signals } = round(decide);

    await expect(ran).resolves.toMatchObject({ ok: true });
    const feedback = latest(decide, 2, AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID);
    expect(String(feedback?.instruction)).toContain("At fault: response.decision.input is required");
    const steer = latest(decide, 2, "core.loop_check");
    expect(steer).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "exact_repeat", repeats: 2, toolIds: [AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID] });
    expect(steer?.decide).toMatchObject({ tool: "core.loop_decision" });
    expect(String(steer?.instruction)).toContain("could not be read, each the same way");
    expect(String(steer?.instruction)).not.toContain("refused before it runs");
    // One unreadable reply was not a finding.
    expect(latest(decide, 1, "core.loop_check")).toBeUndefined();
    expect(signals).toEqual([]);
  });

  it("sent the same way on and on, climbs loop detection's ladder: only its last rung ends the round, with what it repeated on the record", async () => {
    const decide = vi.fn();
    decide.mockImplementation(async () => {
      throw offShape();
    });
    const { ran, signals, record } = round(decide);

    await expect(ran).rejects.toBe(stalledError);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "change_approach", pattern: "exact_repeat", toolIds: [AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID] });
    expect(record.data().stoppedOn).toMatchObject({ pattern: "exact_repeat", toolIds: [AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID] });
  });

  it("a reply that was read breaks the run: the same miss after it starts again from one", async () => {
    const decide = vi.fn();
    const replies: Array<"miss" | "look"> = ["miss", "look", "miss", "look", "miss"];
    decide.mockImplementation(async () => {
      const at = decide.mock.calls.length;
      const reply = replies[at - 1];
      if (reply === "miss") throw offShape();
      if (reply === "look") return { kind: "tool_call", callId: `look.${at}`, toolId: "inspect", input: { area: `a${at}` } };
      return complete;
    });
    const { ran } = round(decide);
    await expect(ran).resolves.toMatchObject({ ok: true });
    expect(shownAt(decide, decide.mock.calls.length - 1).some((entry) => entry.toolId === "core.loop_check")).toBe(false);
  });

  it("end on no count for a caller that does not take the signal either: asked again, steered, until a readable reply", async () => {
    const many = OLD_UNREADABLE_IN_A_ROW * 4;
    const decide = vi.fn();
    decide.mockImplementation(async () => {
      if (decide.mock.calls.length <= many) throw offShape();
      return complete;
    });
    const { ran } = round(decide, { loopSignal: undefined });
    await expect(ran).resolves.toMatchObject({ ok: true, result: { done: true } });
    expect(decide).toHaveBeenCalledTimes(many + 1);
    expect(latest(decide, many, "core.loop_check")).toMatchObject({ code: "llm_evidence_loop.loop_steered" });
  });
});
