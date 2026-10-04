import { describe, expect, it } from "vitest";
import { automationStudioUnresolvedFailedAttempt } from "../unresolved-failed-attempt.ts";

const failed = (nodeId: string) => ({ nodeId, status: "failed" });
const succeeded = (nodeId: string) => ({ nodeId, status: "succeeded" });

describe("unresolved recovery cause", () => {
  it("ignores a healed node without changing its history", () => {
    const attempts = [failed("coupon"), succeeded("coupon")];
    expect(automationStudioUnresolvedFailedAttempt(attempts)).toBeUndefined();
    expect(attempts).toEqual([failed("coupon"), succeeded("coupon")]);
  });
  it("keeps an earlier unresolved other node when the newest failure recovered", () => {
    const unresolved = failed("action");
    expect(automationStudioUnresolvedFailedAttempt([unresolved, failed("coupon"), succeeded("coupon")])).toBe(unresolved);
  });
  it("keeps the latest failure that follows a success", () => {
    const latest = failed("action");
    expect(automationStudioUnresolvedFailedAttempt([failed("action"), succeeded("action"), latest])).toBe(latest);
  });
  it("retains unknown until an actual success supersedes it", () => {
    const unknown = { nodeId: "action", status: "unknown" };
    expect(automationStudioUnresolvedFailedAttempt([unknown, { nodeId: "action", status: "skipped" }])).toBe(unknown);
    expect(automationStudioUnresolvedFailedAttempt([unknown, succeeded("action")])).toBeUndefined();
  });
  it("retains a result refutation after earlier action success", () => {
    const refuted = failed("result-verification");
    expect(automationStudioUnresolvedFailedAttempt([succeeded("action"), refuted])).toBe(refuted);
  });
  it("does not group unnamed attempts as one node", () => {
    const unnamed = { status: "failed" };
    expect(automationStudioUnresolvedFailedAttempt([unnamed, { status: "succeeded" }])).toBe(unnamed);
  });
  it("answers nothing for empty or successful history", () => {
    expect(automationStudioUnresolvedFailedAttempt([])).toBeUndefined();
    expect(automationStudioUnresolvedFailedAttempt([succeeded("action")])).toBeUndefined();
  });
});
