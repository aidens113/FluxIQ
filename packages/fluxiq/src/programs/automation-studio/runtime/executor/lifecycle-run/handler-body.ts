// Running one handler's body in a handler frame (state-aware recovery plan, C5).
//
// This module owns the body run and reading how it ended. The body is
// ordinary nodes in the handler's own graph, run through the run's frame
// runner (`run.runSubflow`, as a called Subflow runs) from the node the
// Handler's `body` port leads to, until it reaches its Handler End. Its frame
// is in phase `handler`, so nothing dispatches a handler inside it (no
// nesting), and it shares the run holder, so its steps spend the same run.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import type { AutomationStudioRunFrames, AutomationStudioInvocationFrame } from "../frames/index.ts";
import type { AutomationStudioHandlerDisposition, AutomationStudioCoreStop } from "../lifecycle/index.ts";
import type { AutomationStudioRegisteredLifecycleGraph } from "./run-state.ts";

/**
 * How one body run ended: the disposition its Handler End wrote, or that it
 * failed and why; a Core stop it ran into (a cancel); the saved trace; and
 * how many steps it took, which count against the run's `maxSteps`.
 */
export type AutomationStudioHandlerBodyRun = {
  written: AutomationStudioHandlerDisposition;
  bodyFailed: boolean;
  reason?: string;
  coreStop?: AutomationStudioCoreStop;
  trace?: AutomationStudioGraphExecutionTrace;
  steps: number;
};

/**
 * Runs the body that starts at `bodyNodeId` in `graph` as a new handler frame
 * under `parent`. The body is handed `inputs` as its run inputs. Failed, with
 * a plain reason, when the run has no frame runner, when the body run does not
 * succeed, and when it never reaches a Handler End.
 */
export async function runAutomationStudioHandlerBody(input: {
  run: AutomationStudioRunFrames;
  parent: AutomationStudioInvocationFrame;
  graph: AutomationStudioRegisteredLifecycleGraph;
  bodyNodeId: string;
  options: AutomationStudioGraphExecutionOptions;
  inputs: Record<string, JsonValue>;
  incidentId?: string;
  maxSteps?: number;
  priorAttemptCount?: number;
}): Promise<AutomationStudioHandlerBodyRun> {
  const { run, parent, graph, bodyNodeId } = input;
  const runner = run.runSubflow;
  if (!runner) return failed("This run has no way to run a handler's body.", 0);
  const frame: AutomationStudioInvocationFrame = {
    invocationId: run.nextInvocationId(),
    parentInvocationId: parent.invocationId,
    subflowId: graph.subflowId,
    graphFlowId: graph.graph.flowId,
    graphRevision: graph.graphRevision,
    entry: { kind: "default" },
    inputs: { ...parent.inputs },
    outputs: {},
    cursor: { nodeId: bodyNodeId, phase: "handler" },
    ...(input.incidentId ? { incidentId: input.incidentId } : {})
  };
  // A body is not a partial run and is never resumed: it starts at its own first node.
  const { startNodeId: _start, stopAfterNodeId: _stop, invocation: _invocation, maxSteps: _maxSteps, ...shared } = input.options;
  const bodyOptions: AutomationStudioGraphExecutionOptions = {
    ...shared,
    inputs: input.inputs,
    startNodeId: bodyNodeId,
    invocation: { run, frame },
    ...(input.maxSteps !== undefined ? { maxSteps: Math.max(1, input.maxSteps) } : {}),
    // Numbered after the run's own attempts, so a body run twice never repeats an attempt id.
    ...(input.priorAttemptCount !== undefined ? { priorAttemptCount: input.priorAttemptCount } : {})
  };
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  // Runners take a Subflow id they do not read; a root graph that is no Subflow is named by its graph.
  const target = { subflowId: graph.subflowId ?? graph.graph.flowId, graph: graph.graph, graphRevision: graph.graphRevision, ...(graph.artifact ? { artifact: graph.artifact } : {}) };
  const saved = await runner(target, bodyOptions, (trace) => { executed = trace; });
  return bodyEnding(executed ?? saved, saved);
}

function bodyEnding(executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace): AutomationStudioHandlerBodyRun {
  const steps = executed.attempts.length;
  if (executed.status === "cancelled") return { ...failed("The run was cancelled while the handler's body ran.", steps, saved), coreStop: "cancel" };
  if (executed.status !== "succeeded") return failed(`The handler's body did not finish: ${executed.message ?? `it ended ${executed.status}`}.`, steps, saved);
  const end = [...executed.attempts].reverse().find((attempt) => attempt.definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID && attempt.status === "succeeded");
  if (!end) return failed("The handler's body finished without reaching its Handler End.", steps, saved);
  return { written: writtenDisposition(end.outputs), bodyFailed: false, trace: saved, steps };
}

/** The disposition a Handler End's outputs say (`nodes/control-flow/handler-end.ts`); anything unreadable is `unhandled`. */
function writtenDisposition(outputs: Record<string, JsonValue>): AutomationStudioHandlerDisposition {
  switch (outputs.disposition) {
    case "resume":
      return { kind: "resume" };
    case "route":
      return { kind: "route", checkpointId: typeof outputs.checkpointId === "string" ? outputs.checkpointId.trim() : "" };
    case "resolve":
      return { kind: "resolve", outputs: plainObject(outputs.outputs) };
    default:
      return { kind: "unhandled" };
  }
}

function plainObject(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function failed(reason: string, steps: number, trace?: AutomationStudioGraphExecutionTrace): AutomationStudioHandlerBodyRun {
  return { written: { kind: "unhandled" }, bodyFailed: true, reason, steps, ...(trace ? { trace } : {}) };
}
