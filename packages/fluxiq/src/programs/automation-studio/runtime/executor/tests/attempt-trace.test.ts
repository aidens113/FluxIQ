import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { nodeAttemptFromResult } from "../attempt-trace.ts";

const node: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: {} };
const timeoutFailure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;

describe("nodeAttemptFromResult", () => {
  it("carries the message, structured failure, and target resolution of a failed result", () => {
    const attempt = nodeAttemptFromResult(node, 1, 2, 1, {}, {
      status: "failed",
      route: "failed",
      outputs: {},
      message: "The client did not answer.",
      failure: timeoutFailure,
      targetResolution: { status: "matched", candidateCount: 2, minimumConfidence: 0.5, candidateId: "save", confidence: 0.9 }
    });

    expect(attempt).toMatchObject({
      status: "failed",
      message: "The client did not answer.",
      failure: timeoutFailure,
      targetResolution: { status: "matched", candidateId: "save", candidateCount: 2 }
    });
    expect(attempt.transitionComparison?.status).toBe("timeout");
  });

  it("drops a failure record that does not parse, and one attached to a success", () => {
    const malformed = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "failed", failure: { ...timeoutFailure, extra: true } as never });
    expect(malformed).not.toHaveProperty("failure");
    expect(malformed.transitionComparison?.status).toBe("action_failed");

    const succeeded = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "success", failure: timeoutFailure });
    expect(succeeded).not.toHaveProperty("failure");
  });

  it("keeps a waiting result's failure record", () => {
    const waiting = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "waiting", failure: { category: "user_intervention_required", code: "web.challenge", retryable: false } });
    expect(waiting.failure).toMatchObject({ category: "user_intervention_required" });
  });

  it("leaves results without the new fields unchanged", () => {
    const attempt = nodeAttemptFromResult(node, 1, 2, 1, {}, { status: "failed", route: "failed", outputs: {} });
    expect(attempt).not.toHaveProperty("message");
    expect(attempt).not.toHaveProperty("failure");
    expect(attempt).not.toHaveProperty("targetResolution");
    expect(attempt.transitionComparison?.status).toBe("action_failed");
  });
});
