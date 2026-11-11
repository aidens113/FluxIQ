// A run's attempts govern every node of a graph run (W3, t899, F1). A run's
// overrides frame raises the floor every node gets, whatever a Flow or a node
// declares; with no frame the floor is Core's default of four, as it always was.
// Runs in one process each read their own frame.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "./fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../runtime/run-overrides/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY, AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS, automationStudioNodeRetryPolicy, runAutomationStudioGraph } from "../index.ts";

function actionNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, ...parameterValues } };
}

function flowOf(nodes: AutomationStudioFlowNode[], metadata?: AutomationStudioFlowDocument["metadata"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.run-attempts", ownerKind: "routine", ownerId: "routine.test", name: "Run attempts", createdAt: 1, updatedAt: 1, nodes, edges: [], ...(metadata ? { metadata } : {}) };
}

/** Lets other queued work run, so two runs' attempts interleave. */
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Runs a one-node Flow whose node always fails with a transient fault; counts its dispatches and records its waits. */
async function alwaysFailing(flow: AutomationStudioFlowDocument = flowOf([actionNode("act")])): Promise<{ calls: number; waits: number[] }> {
  let calls = 0;
  const waits: number[] = [];
  await runAutomationStudioGraph(flow, {
    delay: async (ms) => { waits.push(ms);
      await yieldTurn(); },
    effectDispatcher: () => {
      calls += 1;
      throw Object.assign(new Error("Service Unavailable"), { status: 503 });
    }
  });
  return { calls, waits };
}

const under = <T>(frame: AutomationStudioRunOverrides, fn: () => T): T => runWithAutomationStudioRunOverrides(frame, fn);

describe("a graph run's attempts per node come from the run", () => {
  it("attempts an always-failing node four times with no frame, as before", async () => {
    const { calls, waits } = await alwaysFailing();
    expect(calls).toBe(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts);
    expect(calls).toBe(4);
    expect(waits).toEqual([250, 1_000, 2_000]);
  });

  it("gives two concurrent runs their own attempts, however their attempts interleave", async () => {
    const [seven, five] = await Promise.all([
      under({ nodeAttempts: 7 }, () => alwaysFailing()),
      under({ nodeAttempts: 5 }, () => alwaysFailing())
    ]);
    expect(seven.calls).toBe(7);
    expect(five.calls).toBe(5);
    // The default's waits, the last repeated for the attempts past them.
    expect(seven.waits).toEqual([250, 1_000, 2_000, 2_000, 2_000, 2_000]);
  });

  it("holds a run's attempts over a Flow that declares fewer", async () => {
    const declared = flowOf([actionNode("act", { retry: { maxAttempts: 2 } })], { retry: { maxAttempts: 3 } });
    expect((await under({ nodeAttempts: 6 }, () => alwaysFailing(declared))).calls).toBe(6);
  });

  it("waits longer in all at one node when the run attempts more, scaled with its attempts", async () => {
    // Ten attempts, thirty seconds apart, want 270 s of waiting. The per-node
    // allowance sized for four attempts (60 s) would leave the last six attempts
    // with no wait at all; scaled to ten attempts it is 60 s x 9 / 3 = 180 s.
    const { calls, waits } = await under({ nodeAttempts: 10, retryWaits: { backoffMs: [30_000] } }, () => alwaysFailing());
    expect(calls).toBe(10);
    expect(waits.reduce((total, wait) => total + wait, 0)).toBe(AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS * 3);
  });

  it("takes the run's own per-node allowance when it gives one", async () => {
    const { waits } = await under({ nodeAttempts: 10, retryWaits: { backoffMs: [30_000], perNodeMs: 90_000 } }, () => alwaysFailing());
    expect(waits.reduce((total, wait) => total + wait, 0)).toBe(90_000);
  });
});

describe("the policy a node runs under, as the run sets its floor", () => {
  const node = actionNode("act");

  it("is the default itself with no frame, or with a frame that asks for nothing", () => {
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, {})).toBe(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY);
    expect(under({}, () => automationStudioNodeRetryPolicy(flowOf([node]), node, {}))).toBe(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY);
  });

  it("never lowers the default floor", () => {
    expect(under({ nodeAttempts: 2 }, () => automationStudioNodeRetryPolicy(flowOf([node]), node, {})).maxAttempts).toBe(4);
  });

  it("honours a run's attempts past the 25 a document may declare", () => {
    const declared = actionNode("act", { retry: { maxAttempts: 30 } });
    expect(under({ nodeAttempts: 101 }, () => automationStudioNodeRetryPolicy(flowOf([declared]), declared, {})).maxAttempts).toBe(101);
    expect(automationStudioNodeRetryPolicy(flowOf([declared]), declared, {}).maxAttempts).toBe(25);
  });

  it("is never cut below the run's attempts by the run's per-action allowance", () => {
    expect(under({ nodeAttempts: 9 }, () => automationStudioNodeRetryPolicy(flowOf([node]), node, { recoveryBudget: { maxRetriesPerAction: 2 } })).maxAttempts).toBe(9);
  });

  it("keeps a Call Subflow container at one attempt, its child steps keeping the floor", () => {
    const container: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow" };
    expect(under({ nodeAttempts: 9 }, () => automationStudioNodeRetryPolicy(flowOf([container]), container, {})).maxAttempts).toBe(1);
  });

  it("takes the run's waits unless the node or Flow declares its own", () => {
    const frame = { nodeAttempts: 5, retryWaits: { backoffMs: [100, 200] } };
    expect(under(frame, () => automationStudioNodeRetryPolicy(flowOf([node]), node, {}))).toEqual({ maxAttempts: 5, backoffMs: [100, 200] });
    const attemptsOnly = actionNode("act", { retry: { maxAttempts: 6 } });
    expect(under(frame, () => automationStudioNodeRetryPolicy(flowOf([attemptsOnly]), attemptsOnly, {}))).toEqual({ maxAttempts: 6, backoffMs: [100, 200] });
    const ownWaits = actionNode("act", { retry: { maxAttempts: 6, backoffMs: [5] } });
    expect(under(frame, () => automationStudioNodeRetryPolicy(flowOf([ownWaits]), ownWaits, {}))).toEqual({ maxAttempts: 6, backoffMs: [5] });
  });
});
