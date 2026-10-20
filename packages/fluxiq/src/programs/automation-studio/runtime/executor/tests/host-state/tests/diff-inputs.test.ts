// The state diff is given the attempt's inputs, as its captures are (job rerun
// round 4). A loop pass reaches its own row only through its `item` input, so a
// diff called without it placed every pass's control in the row the step was
// recorded on, and a reset's exactly correct undo of a pass's act was refused.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../../../../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../../contracts.ts";
import { enrichAttemptWithHostState } from "../../../host-state.ts";
import { automationStudioRunState } from "../../../run-state.ts";

const node: AutomationStudioFlowNode = { id: "reserve", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.reserve" } };
const page = (id: string): AutomationStudioHostStateSnapshotRef => ({ stateSnapshotId: id, stateRef: `${id}@reserve.attempt.2`, capturedAt: 1, summary: { page: id } });

function attempt(inputs: Record<string, JsonValue>): AutomationStudioNodeAttemptTrace {
  return { attemptId: "reserve.attempt.2", nodeId: node.id, definitionId: node.definitionId, startedAt: 1, status: "succeeded", inputs, outputs: {}, effects: [] };
}

function host() {
  const told: Array<{ inputs?: Readonly<Record<string, JsonValue>> }> = [];
  const hostRuntime: NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]> = {
    capabilities: ["state-snapshot", "state-diff"],
    captureStateSnapshot: () => page("after"),
    inspectStateDiff: (input) => {
      told.push(input);
      return { changed: true };
    }
  };
  return { told, options: { hostRuntime } as AutomationStudioGraphExecutionOptions };
}

describe("the state diff's inputs", () => {
  it("are the attempt's own, a loop pass's row among them", async () => {
    const { told, options } = host();
    const inputs = { item: { title: "Emma", author: "Jane Austen" } };
    const enriched = await enrichAttemptWithHostState(node, attempt(inputs), options, page("before"), [], automationStudioRunState());

    expect(told).toHaveLength(1);
    expect(told[0]?.inputs).toEqual(inputs);
    expect(enriched.stateRefs?.stateDiff).toEqual({ changed: true });
  });

  it("are given even when empty, so a host sees no row rather than a missing field", async () => {
    const { told, options } = host();
    await enrichAttemptWithHostState(node, attempt({}), options, page("before"), [], automationStudioRunState());

    expect(told[0]?.inputs).toEqual({});
  });
});
