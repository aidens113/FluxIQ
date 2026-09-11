import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph } from "../index.ts";

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.dispatch-failure",
  ownerKind: "task",
  ownerId: "task.dispatch-failure",
  name: "Dispatch failure",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
  edges: []
};
const matched = { status: "matched", candidateCount: 1, minimumConfidence: 0.5, candidateId: "confirm", confidence: 1 } as const;

describe("effect dispatch results in the attempt trace", () => {
  it("carries a failed dispatcher's failure record, message, and target resolution onto the attempt", async () => {
    const failure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("timeout");
  });

  it("keeps a successful dispatcher's target resolution", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true }, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "succeeded", targetResolution: matched });
    expect(trace.attempts[0]).not.toHaveProperty("failure");
  });

  it("leaves dispatcher results without the new fields unchanged", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false } })
    });

    expect(trace.attempts[0]).not.toHaveProperty("failure");
    expect(trace.attempts[0]).not.toHaveProperty("targetResolution");
    expect(trace.attempts[0]).not.toHaveProperty("message");
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("action_failed");
  });
});
