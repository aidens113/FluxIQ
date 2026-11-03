import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS, automationStudioResultVerificationWithinDeadline } from "../deadline.ts";

// The bound that let the empty-result exemption go.
//
// A verification reached from an empty result entered provider resolution and
// never came back on 2026-09-20 (t024). The cause was never named, so the guard
// is not a fix for one promise: it is a deadline over all of them, and these
// assertions are about what a caller that must record something about every
// finished run needs from it -- it always answers, it never throws, and it says
// which of the three things happened.

const never = () => new Promise<string>(() => undefined);

describe("automationStudioResultVerificationWithinDeadline", () => {
  it("answers the judgement's own value when it settles in time", async () => {
    expect(await automationStudioResultVerificationWithinDeadline({ judge: async () => "judged" })).toEqual({ settled: true, value: "judged" });
  });

  it("ends a judgement that never settles, rather than waiting on it", async () => {
    // Mutation: await the judgement directly. This test then never returns,
    // which is exactly what the live run did.
    expect(await automationStudioResultVerificationWithinDeadline({ deadlineMs: 15, judge: never })).toEqual({ settled: false, reason: "timed_out" });
  });

  it("returns a throw in the same shape as a deadline, never as a rejection", async () => {
    // An escaped rejection here is how a finished run ends up with no
    // verification record at all. Mutation: let the error propagate, and this
    // fails with the error instead of asserting on it.
    const bounded = await automationStudioResultVerificationWithinDeadline({ judge: async () => { throw new Error("resolution failed"); } });
    expect(bounded.settled).toBe(false);
    expect(bounded.settled === false ? bounded.reason : undefined).toBe("threw");
    expect(bounded.settled === false ? (bounded.error as Error).message : undefined).toBe("resolution failed");
  });

  it("ends on the caller's cancellation as well as on its own clock", async () => {
    const controller = new AbortController();
    const bounded = automationStudioResultVerificationWithinDeadline({ deadlineMs: 60_000, signal: controller.signal, judge: never });
    controller.abort();
    expect(await bounded).toEqual({ settled: false, reason: "aborted" });
  });

  it("ends immediately on a signal that was already aborted", async () => {
    expect(await automationStudioResultVerificationWithinDeadline({ deadlineMs: 60_000, signal: AbortSignal.abort(), judge: never }))
      .toEqual({ settled: false, reason: "aborted" });
  });

  it("takes a default deadline, so a caller that names none is still bounded", async () => {
    // Mutation: treat an absent `deadlineMs` as no bound. The judgement below
    // then races nothing and this test never returns.
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS).toBeGreaterThan(0);
    const bounded = await automationStudioResultVerificationWithinDeadline({ deadlineMs: undefined, judge: async () => "judged" });
    expect(bounded).toEqual({ settled: true, value: "judged" });
  });
});
