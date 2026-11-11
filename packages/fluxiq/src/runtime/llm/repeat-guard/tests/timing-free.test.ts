// How long a node waits is no part of what it asks (`../timing-free.ts`), in
// both repeat keys: the guard's (`../outcomes.ts`) and the loop detector's
// (`../loop-detection/detector.ts`). Run-mwc6ut8u-52e3c1b3 (R6): a press refused
// `same_result` was sent again thirteen times with only its wait bound changed.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmLoopAttemptRecord, automationStudioLlmLoopDetector, type AutomationStudioLlmLoopCall } from "../loop-detection/index.ts";
import { automationStudioLlmEvidenceRepeatGuard, type AutomationStudioLlmEvidenceCallOutcome } from "../outcomes.ts";
import { automationStudioLlmEvidenceTimingFree } from "../timing-free.ts";

/** A node that declares one timing parameter, and one that declares none. */
const timingOf = (node: string): readonly string[] | undefined => (node === "example.press" ? ["waitMs"] : undefined);
const pressInput = (waitMs?: number): JsonObject => ({ node: "example.press", parameters: { target: { handle: "t3" }, ...(waitMs === undefined ? {} : { waitMs }) }, consequences: [] });

/** The press from `s1` that ends on `s2`, as the guard records it. */
const pressed = (callId: string, waitMs?: number, over: Partial<AutomationStudioLlmEvidenceCallOutcome> = {}): AutomationStudioLlmEvidenceCallOutcome => ({
  callId, toolId: "core.run_node", input: pressInput(waitMs), stateBefore: "s1", stateAfter: "s2",
  effect: "mutate", proposes: true, effectApplied: true, refused: false, resultCode: "example.pressed", ...over
});

describe("what a node call asks, its wait taken out", () => {
  it("takes out only the parameters the node declares as timing, and only from a node call", () => {
    expect(automationStudioLlmEvidenceTimingFree("core.run_node", pressInput(12_000), timingOf)).toEqual({ asks: pressInput(), timing: '{"waitMs":12000}' });
    expect(automationStudioLlmEvidenceTimingFree("core.run_node", pressInput(), timingOf)).toEqual({ asks: pressInput() });
    const other = { node: "example.other", parameters: { waitMs: 5 } };
    expect(automationStudioLlmEvidenceTimingFree("core.run_node", other, timingOf)).toEqual({ asks: other });
    expect(automationStudioLlmEvidenceTimingFree("example.tool", { node: "example.press", parameters: { waitMs: 5 } }, timingOf).timing).toBeUndefined();
    expect(automationStudioLlmEvidenceTimingFree("core.run_node", pressInput(5), undefined)).toEqual({ asks: pressInput(5) });
    // What a call really ran with names its parameters only; the call as written names the node.
    expect(automationStudioLlmEvidenceTimingFree("core.run_node", { parameters: { target: "x", waitMs: 5 } }, timingOf, "example.press")).toEqual({ asks: { parameters: { target: "x" } }, timing: '{"waitMs":5}' });
  });
});

describe("the repeat guard", () => {
  it("refuses a press that ended where it ended before, sent again with only its wait changed", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard({ timingOf });
    guard.recorded(pressed("p1"));
    guard.seen("s1");
    guard.recorded(pressed("p2", 8_000));
    guard.seen("s1");
    for (const waitMs of [undefined, 8_000, 13_000]) expect(guard.blocks("core.run_node", pressInput(waitMs))?.outcome, String(waitMs)).toBe("same_result");
    // The note says a changed wait is no new call only where the call carried one.
    expect(guard.blocks("core.run_node", pressInput(13_000))?.timingLeftOut).toBe(true);
    expect(guard.blocks("core.run_node", pressInput())?.timingLeftOut).toBeUndefined();
    // Another control is another call.
    expect(guard.blocks("core.run_node", { ...pressInput(), parameters: { target: { handle: "t4" } } })).toBeUndefined();
  });

  it("keeps the wait in the key of a node that declares none", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard({ timingOf: () => undefined });
    guard.recorded(pressed("p1"));
    guard.seen("s1");
    guard.recorded(pressed("p2"));
    guard.seen("s1");
    expect(guard.blocks("core.run_node", pressInput())?.outcome).toBe("same_result");
    expect(guard.blocks("core.run_node", pressInput(13_000))).toBeUndefined();
  });

  it("runs a call that timed out again with another wait, and refuses it with the same one", () => {
    for (const timedOut of [
      { failure: { category: "timeout" as const, code: "example.timeout", retryable: false, stage: "execution" as const } },
      { resultCode: "example.action.timed_out" },
      { resultReason: "timeout" }
    ]) {
      const guard = automationStudioLlmEvidenceRepeatGuard({ timingOf });
      guard.recorded(pressed("p1", 2_000, { stateAfter: "s1", effectApplied: false, refused: true, ...timedOut }));
      const label = JSON.stringify(timedOut);
      expect(guard.blocks("core.run_node", pressInput(2_000))?.outcome, label).toBe("failed");
      expect(guard.blocks("core.run_node", pressInput(10_000)), label).toBeUndefined();
      expect(guard.blocks("core.run_node", pressInput()), label).toBeUndefined();
    }
  });

  it("refuses a call that failed for another reason whatever its wait", () => {
    const guard = automationStudioLlmEvidenceRepeatGuard({ timingOf });
    guard.recorded(pressed("p1", 2_000, { stateAfter: "s1", effectApplied: false, refused: true, resultCode: "example.action.rejected.target_disabled" }));
    expect(guard.blocks("core.run_node", pressInput(10_000))?.outcome).toBe("failed");
  });
});

describe("the loop detector", () => {
  const refusedPress = (index: number, waitMs: number): AutomationStudioLlmLoopCall => ({
    callId: `c${index}`, toolId: "core.run_node", input: pressInput(waitMs), ranAs: { parameters: { target: { fingerprint: "f" }, waitMs } },
    effect: "mutate", effectApplied: false, refused: true, stateBefore: "s1", stateAfter: "s1"
  });

  it("finds a near repeat in the same press sent with only its wait changed", () => {
    const watching = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord(), timingOf });
    expect(watching.ran(refusedPress(1, 2_000), true).finding).toBeUndefined();
    expect(watching.ran(refusedPress(2, 9_000), true).finding?.pattern).toBe("near_repeat");
    expect(watching.repeating("core.run_node", pressInput(15_000), undefined, "s1")?.pattern).toBe("near_repeat");
  });

  it("keeps the wait as part of the call where no timing is declared", () => {
    const watching = automationStudioLlmLoopDetector({ record: automationStudioLlmLoopAttemptRecord() });
    expect(watching.ran(refusedPress(1, 2_000), true).finding).toBeUndefined();
    expect(watching.ran(refusedPress(2, 9_000), true).finding).toBeUndefined();
  });
});
