import { describe, expect, it } from "vitest";
import { automationStudioCouldNotRun, automationStudioNotShownAttempt } from "../index.ts";

const failed = (category: string, stage = "target_resolution") => ({ status: "failed" as const, failure: { category, code: "x", retryable: false, stage } as never });

describe("a step that cannot run", () => {
  it("is one whose target was not found", () => {
    expect(automationStudioCouldNotRun(failed("target_not_found"))).toBe(true);
  });

  it("is not one whose target was ambiguous, whose action failed, or that a layer covered", () => {
    expect(automationStudioCouldNotRun(failed("target_ambiguous"))).toBe(false);
    expect(automationStudioCouldNotRun(failed("unexpected_state", "execution"))).toBe(false);
    expect(automationStudioCouldNotRun({ status: "succeeded" })).toBe(false);
  });

  it("includes the attempt synthesized when a readiness gate did not hold", () => {
    const attempt = automationStudioNotShownAttempt({ id: "n", definitionId: "builtin.policy.action" }, "n.attempt.1", 5);
    expect(attempt).toMatchObject({ attemptId: "n.attempt.1", nodeId: "n", status: "failed", route: "failed", startedAt: 5, finishedAt: 5, failure: { category: "target_not_found", code: "executor.ready_state.not_shown", stage: "target_resolution" } });
    expect(automationStudioCouldNotRun(attempt)).toBe(true);
  });
});
