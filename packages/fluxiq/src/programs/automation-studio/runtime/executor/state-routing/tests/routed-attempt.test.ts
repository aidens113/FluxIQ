import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioStateRoutedAttempt } from "../index.ts";

const failed: AutomationStudioNodeAttemptTrace = {
  attemptId: "b.attempt.2", nodeId: "b", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [],
  message: "No target resolved.",
  failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" }
};
const record = { outcome: "routed" as const, candidates: 2, matched: 1, toNodeId: "c", direction: "forward" as const, closeness: 0.8 };

describe("the attempt of a step that could not run", () => {
  it("reads skipped, exactly as before, when the Flow declared the way on", () => {
    const attempt = automationStudioStateRoutedAttempt(failed, { kind: "declared", edge: { id: "e", sourceNodeId: "b", targetNodeId: "j" } });
    expect(attempt).toEqual({ ...failed, failure: undefined, message: undefined, status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    expect(attempt).not.toHaveProperty("failure");
    expect(attempt).not.toHaveProperty("stateRouting");
  });

  it("reads state_routed with where it went when the page matched another node", () => {
    const attempt = automationStudioStateRoutedAttempt(failed, { kind: "routed", node: { id: "c", definitionId: "builtin.policy.action" }, direction: "forward", closeness: 0.8, record });
    expect(attempt).toMatchObject({ status: "succeeded", route: "state_routed", skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "c", direction: "forward" }, stateRouting: record });
    expect(attempt).not.toHaveProperty("failure");
    expect(attempt).not.toHaveProperty("message");
  });

  it("stays failed, with the record, when no way on was found or the guard stopped it", () => {
    const none = automationStudioStateRoutedAttempt(failed, { kind: "none", record: { outcome: "no_match", candidates: 3, matched: 0 } });
    expect(none).toEqual({ ...failed, stateRouting: { outcome: "no_match", candidates: 3, matched: 0 } });
    const stopped = automationStudioStateRoutedAttempt(failed, { kind: "stopped", message: "stop", record: { ...record, outcome: "guard_stopped" } });
    expect(stopped).toMatchObject({ status: "failed", failure: failed.failure, stateRouting: { outcome: "guard_stopped" } });
  });
});
