// A graph run as one frame of its run (state-aware recovery plan, C1).
//
// Every graph run executes inside a frame. A run handed `options.invocation`
// executes as that frame; one handed none is a run's root and frames itself,
// creating the run holder every child frame will share. The frame is pushed
// when the graph starts and popped when it ends, whether it succeeded, failed
// or threw, so the stack only ever holds the frames still executing.

import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { automationStudioFlowGraphVersion } from "../../flow-version/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { chooseAutomationStudioStartNode } from "../start-node.ts";
import type { AutomationStudioInvocationOptions, AutomationStudioSubflowGraphRunner } from "./invocation-options.ts";
import { automationStudioRunFrames } from "./run-holder.ts";

/** The graph a frame runs, as far as framing it needs. */
type FramedGraph = Pick<AutomationStudioFlowDocument, "flowId" | "nodes" | "edges" | "metadata">;

/** Runs a document as a graph run of its own, as `runAutomationStudioGraph` does. */
type GraphRun = (
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
) => Promise<AutomationStudioGraphExecutionTrace>;

/**
 * The root frame of a run, with a new run holder. Its Subflow is the one the
 * run was started in (`options.currentSubflowId`), or none; its graph is
 * `flow`, at the revision the document was stamped with, if any; it begins at
 * the graph's default entry with the run's own inputs.
 */
export function automationStudioRootInvocation(
  flow: FramedGraph,
  options: Pick<AutomationStudioGraphExecutionOptions, "currentSubflowId" | "inputs" | "startNodeId">,
  runSubflow?: AutomationStudioSubflowGraphRunner
): AutomationStudioInvocationOptions {
  const run = automationStudioRunFrames(runSubflow);
  return {
    run,
    frame: {
      invocationId: run.nextInvocationId(),
      subflowId: options.currentSubflowId ?? null,
      graphFlowId: flow.flowId,
      graphRevision: automationStudioFlowGraphVersion({ flow }).revision,
      entry: { kind: "default" },
      inputs: { ...(options.inputs ?? {}) },
      outputs: {},
      cursor: { nodeId: options.startNodeId ?? chooseAutomationStudioStartNode(flow).node?.id ?? "", phase: "before_attempt" }
    }
  };
}

/**
 * Runs `run` with `options` framed: as `options.invocation` when it is set,
 * otherwise as a new root whose holder runs a called Subflow with `runGraph`.
 * The frame is on the stack for exactly as long as `run` executes.
 *
 * A frame already on the stack is not pushed twice, and is then left for the
 * run that pushed it to pop.
 */
export async function runAutomationStudioGraphInFrame<T>(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  runGraph: GraphRun,
  run: (framed: AutomationStudioGraphExecutionOptions) => Promise<T>
): Promise<T> {
  const invocation = options.invocation ?? automationStudioRootInvocation(flow, options, bareSubflowRunner(runGraph));
  const { stack } = invocation.run;
  const pushed = !stack.includes(invocation.frame);
  if (pushed) stack.push(invocation.frame);
  try {
    return await run(options.invocation === invocation ? options : { ...options, invocation });
  } finally {
    const at = pushed ? stack.lastIndexOf(invocation.frame) : -1;
    if (at >= 0) stack.splice(at, 1);
  }
}

// A bare graph run has no compiled regions for a sibling graph, so the child
// runs without the parent's: a parent's region plan names the parent's nodes.
function bareSubflowRunner(runGraph: GraphRun): AutomationStudioSubflowGraphRunner {
  return (target, options, onExecutedTrace) => {
    const { regionRuntime: _parentRegions, nodeRegionIds: _parentRegionIds, ...childOptions } = options;
    return runGraph(target.graph, childOptions, onExecutedTrace);
  };
}
