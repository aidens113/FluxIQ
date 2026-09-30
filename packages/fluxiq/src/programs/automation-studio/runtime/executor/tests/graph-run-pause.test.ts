// The executor's run-control checkpoint in graph-run.ts: a run is held only
// between two steps, resumes at the node it held before, and takes the same
// path it would have taken unpaused.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AutomationStudioRunController } from "../../run-control/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../index.ts";

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.pausable",
  ownerKind: "task",
  ownerId: "task.pausable",
  name: "Pausable",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "open", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "open" } } },
    { id: "search", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "search" } } },
    { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "read" } } }
  ],
  edges: [
    { id: "open.search", sourceNodeId: "open", targetNodeId: "search", sourcePortId: "success" },
    { id: "search.read", sourceNodeId: "search", targetNodeId: "read", sourcePortId: "success" }
  ]
};

type Dispatch = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

function recordingDispatcher(dispatched: string[], onDispatch?: (elementId: string) => void): Dispatch {
  return (effect) => {
    const elementId = String((effect.payload as { parameters?: { elementId?: unknown } }).parameters?.elementId);
    dispatched.push(elementId);
    onDispatch?.(elementId);
    return { status: "success", route: "success", outputs: { clicked: elementId } };
  };
}

/** Waits until the run is held: each turn lets the executor reach its next await. */
async function untilHeld(run: AutomationStudioRunController): Promise<void> {
  for (let turn = 0; turn < 200 && run.snapshot().state !== "paused"; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(run.snapshot().state).toBe("paused");
}

function shape(trace: Awaited<ReturnType<typeof runAutomationStudioGraph>>) {
  return { status: trace.status, attempts: trace.attempts.map((attempt) => [attempt.nodeId, attempt.status, attempt.route]) };
}

describe("pausing a run between steps", () => {
  it("holds before the first step it reaches, dispatches nothing while held, and goes on when resumed", async () => {
    const dispatched: string[] = [];
    const run = new AutomationStudioRunController({ projectId: "p", runId: "r" });
    run.pause();
    const running = runAutomationStudioGraph(flow, { effectDispatcher: recordingDispatcher(dispatched), runControl: run });
    await untilHeld(run);
    expect(run.snapshot()).toMatchObject({ nodeId: "open", step: 0 });
    expect(dispatched).toEqual([]);

    run.resume();
    const trace = await running;
    expect(trace.status).toBe("succeeded");
    expect(dispatched).toEqual(["open", "search", "read"]);
  });

  it("lets the step in flight finish, holds before the next one, and takes the same path as an unpaused run", async () => {
    const unpaused = await runAutomationStudioGraph(flow, { effectDispatcher: recordingDispatcher([]) });

    const dispatched: string[] = [];
    const run = new AutomationStudioRunController({ projectId: "p", runId: "r" });
    // A person presses Pause while "open" is being clicked.
    const running = runAutomationStudioGraph(flow, {
      effectDispatcher: recordingDispatcher(dispatched, (elementId) => { if (elementId === "open") run.pause({ holder: "person" }); }),
      runControl: run
    });
    await untilHeld(run);
    expect(dispatched).toEqual(["open"]);
    expect(run.snapshot()).toMatchObject({ state: "paused", holder: "person", nodeId: "search" });

    run.resume({ afterManualAction: true });
    const trace = await running;
    expect(dispatched).toEqual(["open", "search", "read"]);
    expect(shape(trace)).toEqual(shape(unpaused));
  });

  it("ends as cancelled, at the node it held before, when stopped while held", async () => {
    const abort = new AbortController();
    const dispatched: string[] = [];
    const run = new AutomationStudioRunController({ projectId: "p", runId: "r", signal: abort.signal });
    const running = runAutomationStudioGraph(flow, {
      signal: abort.signal,
      effectDispatcher: recordingDispatcher(dispatched, (elementId) => { if (elementId === "search") run.pause(); }),
      runControl: run
    });
    await untilHeld(run);
    abort.abort("Stopped.");
    const trace = await running;
    expect(trace).toMatchObject({ status: "cancelled", currentNodeId: "read", message: "Run cancelled while it was paused." });
    expect(dispatched).toEqual(["open", "search"]);
  });

  it("runs exactly as before when no one pauses it", async () => {
    const dispatched: string[] = [];
    const run = new AutomationStudioRunController({ projectId: "p", runId: "r" });
    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: recordingDispatcher(dispatched), runControl: run });
    expect(trace.status).toBe("succeeded");
    expect(dispatched).toEqual(["open", "search", "read"]);
    expect(run.snapshot()).toMatchObject({ state: "running", lastNodeId: "read", history: [] });
  });
});
