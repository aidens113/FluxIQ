import { describe, expect, it, vi } from "vitest";
import { resultVerificationDeadlineMs, resultVerificationWithinDeadline } from "../index.ts";

describe("neutral verification deadline", () => {
  it("budgets all bounded asks and preserves the default for invalid timeouts", () => {
    for (const timeout of [undefined, NaN, Infinity, -1, 0, 1, 20_000]) {
      expect(resultVerificationDeadlineMs(timeout)).toBe(120_000);
    }
    expect(resultVerificationDeadlineMs(45_000)).toBe(210_000);
  });

  it("retains the original thrown object and removes the abort listener", async () => {
    const signal = new AbortController().signal;
    const remove = vi.spyOn(signal, "removeEventListener");
    const failure = Object.freeze({ original: true });
    const outcome = await resultVerificationWithinDeadline({ signal, judge: async () => { throw failure; } });
    expect(outcome.settled).toBe(false);
    if (outcome.settled) throw new Error("test.expected_failure");
    expect(outcome.reason).toBe("threw");
    expect(outcome.error).toBe(failure);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not turn a deadline into cancellation of the original operation", async () => {
    let finish!: (value: object) => void;
    const original = new Promise<object>(resolve => { finish = resolve; });
    const bounded = resultVerificationWithinDeadline({ deadlineMs: 1, judge: () => original });
    expect(await bounded).toEqual({ settled: false, reason: "timed_out" });
    const value = Object.freeze({ completedLater: true });
    finish(value);
    expect(await original).toBe(value);
  });
});
