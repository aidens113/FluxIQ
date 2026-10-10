// Shared fixtures for the lifecycle dispatcher's tests: a graph builder, a
// fake host whose fact answers a test sets, and a framed run whose body
// runner is the real graph run.

import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioFactEvaluationContext, AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { automationStudioRootInvocation, type AutomationStudioInvocationOptions } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import type { AutomationStudioFactCondition, AutomationStudioFactTruth } from "../../lifecycle/index.ts";
import type { AutomationStudioLifecycleDispatchInput } from "../index.ts";

export const HANDLER = "builtin.control.handler";
export const HANDLER_END = "builtin.control.handler-end";

export function graph(flowId: string, nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[], metadata?: JsonObject): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, nodes, edges, createdAt: 1, updatedAt: 1, ...(metadata ? { metadata } : {}) };
}

export function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId, targetPortId: "in" };
}

/** A fact condition on the fake host's named fact. */
export function fact(name: string): AutomationStudioFactCondition {
  return { fact: name, op: "exists" };
}

/**
 * A Handler `id` whose body is one constant step then a Handler End writing
 * `end`: its nodes and edges, to add to a graph.
 */
export function handler(id: string, parameters: JsonObject, end: JsonObject, label?: string): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
  return {
    nodes: [
      { id, definitionId: HANDLER, parameterValues: parameters, ...(label ? { label } : {}) },
      { id: `${id}.step`, definitionId: "builtin.data.constant", parameterValues: { value: `${id} ran` } },
      { id: `${id}.end`, definitionId: HANDLER_END, parameterValues: end }
    ],
    edges: [edge(id, `${id}.step`, "body"), edge(`${id}.step`, `${id}.end`)]
  };
}

/** The main path every test graph shares: start -> press -> done. */
export function mainPath(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
  return {
    nodes: [
      { id: "start", definitionId: "builtin.control.start" },
      { id: "press", definitionId: "builtin.data.constant", parameterValues: { value: "pressed" } },
      { id: "done", definitionId: "builtin.control.end" }
    ],
    edges: [edge("start", "press"), edge("press", "done")]
  };
}

/** A graph of the main path plus the given parts. */
export function flowWith(flowId: string, parts: Array<{ nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] }>, metadata?: JsonObject): AutomationStudioFlowDocument {
  const all = [mainPath(), ...parts];
  return graph(flowId, all.flatMap((part) => part.nodes), all.flatMap((part) => part.edges), metadata);
}

/** A host whose answer per fact name a test sets; every batch it is asked is kept. */
export function fakeHost(answers: Record<string, AutomationStudioFactTruth> = {}): {
  runtime: AutomationStudioHostRuntimeBoundary;
  answers: Record<string, AutomationStudioFactTruth>;
  batches: Array<{ conditions: AutomationStudioFactCondition[]; context: AutomationStudioFactEvaluationContext }>;
} {
  const batches: Array<{ conditions: AutomationStudioFactCondition[]; context: AutomationStudioFactEvaluationContext }> = [];
  return {
    answers,
    batches,
    runtime: {
      capabilities: ["fact-evaluation"],
      factEvaluator: async (conditions, context) => {
        batches.push({ conditions: [...conditions], context });
        return conditions.map((condition) => ({ result: answers[condition.fact] ?? "unknown", evidence: { excerpt: `page text for ${condition.fact}` }, capturedAt: 50 }));
      }
    }
  };
}

/** A root frame for `flow`, on the stack, whose frame runner is the real graph run. */
export function framed(flow: AutomationStudioFlowDocument, subflowId = "main"): AutomationStudioInvocationOptions {
  const invocation = automationStudioRootInvocation(flow, { currentSubflowId: subflowId }, (target, options, onExecuted) => runAutomationStudioGraph(target.graph, options, onExecuted));
  invocation.run.stack.push(invocation.frame);
  return invocation;
}

/** A dispatch at `nodeId` of the frame executing now. */
export function dispatchInput(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  overrides: Partial<AutomationStudioLifecycleDispatchInput> & Pick<AutomationStudioLifecycleDispatchInput, "event">
): AutomationStudioLifecycleDispatchInput {
  return { nodeId: "press", graph: { subflowId: "main", graph: flow, graphRevision: 1 }, options, arrival: 1, attemptNumber: 1, values: {} as Record<string, JsonValue>, ...overrides };
}
