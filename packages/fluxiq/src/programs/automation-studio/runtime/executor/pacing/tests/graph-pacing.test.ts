// What a graph run waits for on its own account (t378): a Wait node's pause,
// the wait after a hinted refusal with the time already passed credited, and a
// node's pace between starts, authored or learned from a hint.
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.pacing", ownerKind: "routine", ownerId: "routine.test", name: "Pacing", createdAt: 1, updatedAt: 1, nodes, edges };
}

function act(metadata?: JsonObject): AutomationStudioFlowNode {
  return { id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.act" }, ...(metadata ? { metadata } : {}) };
}

/** Start, a list, a For Each over it whose body is `act`, then End. */
function loopOver(items: number[], node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return flowOf([
    { id: "start", definitionId: "builtin.control.start" },
    { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: items } },
    { id: "each", definitionId: "builtin.control.for-each" },
    node,
    { id: "end", definitionId: "builtin.control.end" }
  ], [edge("start", "success", "list"), edge("list", "success", "each"), edge("list", "value", "each", "items"), edge("each", "body", "act"), edge("act", "success", "each"), edge("each", "done", "end")]);
}

/** A page's "slow down, try again in a moment": retryable, not acted, with the wait it asked for. */
const slowDown = (retryAfterMs: number): AutomationStudioFailureRecord => ({ category: "action_failed", code: "test.slow_down", retryable: true, stage: "execution", effect: "unacted", retryAfterMs });

/** A clock that only moves when the run waits or a dispatch takes time, and the waits it was asked for. */
function simulated(start = 10_000) {
  const clock = { t: start, waits: [] as number[] };
  const options: Partial<AutomationStudioGraphExecutionOptions> = { now: () => clock.t, delay: async (ms) => { clock.waits.push(ms); clock.t += ms; } };
  return { clock, options };
}

/** Each dispatch takes a second; the calls named in `refusals` are refused with the given hint. */
function dispatcher(clock: { t: number }, refusals: Record<number, number>) {
  const calls = { count: 0 };
  const dispatch: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = () => {
    calls.count += 1;
    clock.t += 1_000;
    const hint = refusals[calls.count];
    return hint === undefined ? { status: "success", route: "success", outputs: { ok: true } } : { status: "failed", route: "failed", outputs: {}, failure: slowDown(hint) };
  };
  return { calls, dispatch };
}

describe("a Wait node pauses and the run goes on", () => {
  const waitFlow = flowOf([
    { id: "wait", definitionId: "builtin.timing.wait", parameterValues: { duration: 2, unit: "seconds" } },
    { id: "end", definitionId: "builtin.control.end" }
  ], [edge("wait", "success", "end")]);

  it("sleeps its duration, settles succeeded and reaches the node after it", async () => {
    const { clock, options } = simulated();
    const trace = await runAutomationStudioGraph(waitFlow, { ...options, startNodeId: "wait" });

    expect(trace.status).toBe("succeeded");
    expect(trace.parked).toBeUndefined();
    expect(trace.attempts.map((attempt) => [attempt.nodeId, attempt.status])).toEqual([["wait", "succeeded"], ["end", "succeeded"]]);
    expect(trace.attempts[0]?.pause).toEqual({ requestedMs: 2_000, waitedMs: 2_000 });
    expect(trace.attempts[0]?.outputs.durationMs).toBe(2_000);
    expect(clock.waits).toEqual([2_000]);
  });

  it("is held to the run's deadline, and says the pause was cut short", async () => {
    const { clock, options } = simulated();
    const trace = await runAutomationStudioGraph(waitFlow, { ...options, startNodeId: "wait", deadlineAt: clock.t + 500 });

    expect(trace.attempts[0]?.pause).toEqual({ requestedMs: 2_000, waitedMs: 500, bounded: true });
    expect(clock.waits).toEqual([500]);
  });

  it("ends cancelled when the run is cancelled during the pause", async () => {
    const controller = new AbortController();
    const trace = await runAutomationStudioGraph(waitFlow, { startNodeId: "wait", signal: controller.signal, delay: async () => { controller.abort(); } });

    expect(trace.status).toBe("cancelled");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["wait"]);
  });
});

describe("the wait after a hinted refusal counts the time already passed", () => {
  it("waits only what is left of the hint once the failed attempt's after-action snapshot is counted", async () => {
    const { clock, options } = simulated();
    const { calls, dispatch } = dispatcher(clock, { 1: 5_500 });
    // The refused attempt's after-action snapshot takes 3 s, as lane D measured 2.7-4.6 s.
    const hostRuntime = { captureStateSnapshot: (input: { point: string }) => { if (input.point === "after_action" && calls.count === 1) clock.t += 3_000; return undefined; } } as unknown as NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
    const trace = await runAutomationStudioGraph(flowOf([act()], []), { ...options, effectDispatcher: dispatch, hostRuntime });

    expect(trace.status).toBe("succeeded");
    expect(clock.waits).toEqual([2_500]);
    expect(trace.attempts[1]?.retry).toMatchObject({ attemptNumber: 2, backoffMs: 2_500, hintedWaitMs: 5_500, creditedMs: 3_000 });
    expect(trace.defence?.entries[0]).toMatchObject({ hintedWaitMs: 5_500, waitedMs: 2_500 });
  });
});

describe("a node's pace between starts", () => {
  it("holds each pass of an authored pace to the least time since the last start", async () => {
    const { clock, options } = simulated();
    const { dispatch } = dispatcher(clock, {});
    const trace = await runAutomationStudioGraph(loopOver([1, 2, 3], act({ paceMs: 4_000 })), { ...options, effectDispatcher: dispatch });
    const acts = trace.attempts.filter((attempt) => attempt.nodeId === "act");

    expect(trace.status).toBe("succeeded");
    expect(clock.waits).toEqual([3_000, 3_000]);
    expect(acts.map((attempt) => attempt.pace)).toEqual([{ inForceMs: 4_000, waitedMs: 0 }, { inForceMs: 4_000, waitedMs: 3_000 }, { inForceMs: 4_000, waitedMs: 3_000 }]);
    expect(trace.pace).toEqual([{ nodeId: "act", paceMs: 4_000, authoredMs: 4_000, raisedCount: 0, waitedMs: 6_000 }]);
  });

  it("is learned from a hinted refusal, grows on the next one, and the trace keeps it", async () => {
    const { clock, options } = simulated();
    // Pass 2's first press and pass 3's first press are refused with a 2 s hint.
    const { dispatch } = dispatcher(clock, { 2: 2_000, 4: 2_000 });
    const trace = await runAutomationStudioGraph(loopOver([1, 2, 3, 4], act()), { ...options, effectDispatcher: dispatch });
    const acts = trace.attempts.filter((attempt) => attempt.nodeId === "act");

    expect(trace.status).toBe("succeeded");
    expect(acts.map((attempt) => attempt.status)).toEqual(["succeeded", "failed", "succeeded", "failed", "succeeded", "succeeded"]);
    // retry, pace, retry, pace: the retries of one arrival are never paced on top of their own wait.
    expect(clock.waits).toEqual([2_000, 1_000, 2_000, 2_000]);
    expect(acts[1]?.pace).toEqual({ inForceMs: 0, waitedMs: 0, raisedToMs: 2_000 });
    expect(acts[3]?.pace).toEqual({ inForceMs: 2_000, waitedMs: 1_000, raisedToMs: 3_000 });
    expect(acts[5]?.pace).toEqual({ inForceMs: 3_000, waitedMs: 2_000 });
    expect(trace.pace).toEqual([{ nodeId: "act", paceMs: 3_000, learnedMs: 3_000, raisedCount: 2, waitedMs: 3_000 }]);
  });

  it("leaves a node with no pace and no hint unpaced, and the trace says nothing of pace", async () => {
    const { clock, options } = simulated();
    const { dispatch } = dispatcher(clock, {});
    const trace = await runAutomationStudioGraph(loopOver([1, 2], act({ paceMs: "fast" })), { ...options, effectDispatcher: dispatch });

    expect(clock.waits).toEqual([]);
    expect(trace.pace).toBeUndefined();
    expect(trace.attempts.some((attempt) => attempt.pace)).toBe(false);
  });
});
