// The executor's run-control checkpoint in graph-run.ts: a run is held only
// between two steps, resumes at the node it held before, and takes the same
// path it would have taken unpaused. What a held run says on the activity
// stream (through `activity/hold.ts`) is the last block.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
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

// The activity a held run emits: one `paused` event when it holds, one
// `running` event when it is let go to continue, nothing per turn of the
// hold, and no "continuing" for a hold that ends in a stop (t376).

const takeoverFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.takeover",
  ownerKind: "task",
  ownerId: "task.takeover",
  name: "Takeover",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "open", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "open" } } },
    { id: "fill", definitionId: "builtin.policy.action", label: "Fill the form", parameterValues: { outputId: "activate-element", parameters: { elementId: "fill" } } },
    { id: "send", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "send" } } }
  ],
  edges: [
    { id: "open.fill", sourceNodeId: "open", targetNodeId: "fill", sourcePortId: "success" },
    { id: "fill.send", sourceNodeId: "fill", targetNodeId: "send", sourcePortId: "success" }
  ]
};

function dispatcher(onDispatch?: (elementId: string) => void): Dispatch {
  return (effect) => {
    const elementId = String((effect.payload as { parameters?: { elementId?: unknown } }).parameters?.elementId);
    onDispatch?.(elementId);
    return { status: "success", route: "success", outputs: { clicked: elementId } };
  };
}

async function turns(count: number): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const inRun = <T>(work: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "run", id: "run-t376", projectId: "p" }, work);

describe("a held run on the activity stream", () => {
  let seen: ClientGatewayActivity[] = [];
  let unsubscribe: () => void = () => undefined;
  beforeEach(() => {
    seen = [];
    unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
  });
  afterEach(() => unsubscribe());
  const holdEvents = () => seen.filter((event) => event.phase === "paused" || event.label.startsWith("Continuing"));

  it("says paused once when a person takes the page, nothing while held, and continuing once when handed back", async () => {
    const run = new AutomationStudioRunController({ projectId: "p", runId: "run-t376" });
    const running = inRun(() => runAutomationStudioGraph(takeoverFlow, { effectDispatcher: dispatcher((elementId) => { if (elementId === "open") run.pause({ holder: "person" }); }), runControl: run }));
    await untilHeld(run);
    // The hold is waited on for many turns, and a second takeover request arrives: still one event.
    await turns(20);
    run.pause({ holder: "person" });
    await turns(5);
    expect(holdEvents()).toHaveLength(1);
    expect(holdEvents()[0]).toMatchObject({ activityId: "run:run-t376", phase: "paused", label: "Paused: you have the page", step: { index: 2, count: 3, nodeId: "fill", label: "Fill the form" } });
    expect(holdEvents()[0]!.detail).toBeUndefined();

    run.resume({ afterManualAction: true });
    const trace = await running;
    expect(trace.status).toBe("succeeded");
    expect(holdEvents().map((event) => [event.phase, event.label, event.step?.nodeId])).toEqual([
      ["paused", "Paused: you have the page", "fill"],
      ["running", "Continuing from step 2", "fill"]
    ]);
    // The continuing event comes before the held step runs.
    const labels = seen.map((event) => event.label);
    expect(labels.indexOf("Continuing from step 2")).toBeLessThan(labels.findIndex((label) => label.startsWith("Running step 2")));
  });

  it("says a plain pause without handing the page to the person", async () => {
    const run = new AutomationStudioRunController({ projectId: "p", runId: "run-t376" });
    run.pause();
    const running = inRun(() => runAutomationStudioGraph(takeoverFlow, { effectDispatcher: dispatcher(), runControl: run }));
    await untilHeld(run);
    run.resume();
    await running;
    expect(holdEvents().map((event) => [event.phase, event.label])).toEqual([["paused", "Paused"], ["running", "Continuing from step 1"]]);
  });

  it("says nothing of continuing when the held run is stopped: it ends as cancelled", async () => {
    const abort = new AbortController();
    const run = new AutomationStudioRunController({ projectId: "p", runId: "run-t376", signal: abort.signal });
    const running = inRun(() => runAutomationStudioGraph(takeoverFlow, { signal: abort.signal, effectDispatcher: dispatcher((elementId) => { if (elementId === "open") run.pause({ holder: "person" }); }), runControl: run }));
    await untilHeld(run);
    abort.abort("Stopped.");
    const trace = await running;
    expect(trace.status).toBe("cancelled");
    expect(holdEvents().map((event) => event.phase)).toEqual(["paused"]);
  });

  it("says nothing when no one pauses the run", async () => {
    const run = new AutomationStudioRunController({ projectId: "p", runId: "run-t376" });
    await inRun(() => runAutomationStudioGraph(takeoverFlow, { effectDispatcher: dispatcher(), runControl: run }));
    expect(holdEvents()).toEqual([]);
  });
});
