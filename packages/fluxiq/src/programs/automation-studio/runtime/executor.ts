import type { JsonObject, JsonValue } from "../../../core";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model";
import { getAutomationNodeDefinition } from "../nodes";
import type { AutomationNodeExecutionResult } from "../nodes/contracts";

export type AutomationStudioGraphRunStatus = "running" | "succeeded" | "failed" | "waiting" | "cancelled";

export type AutomationStudioNodeAttemptTrace = {
  attemptId: string;
  nodeId: string;
  definitionId: string;
  startedAt: number;
  finishedAt?: number;
  status: AutomationStudioGraphRunStatus;
  route?: string;
  inputs: Record<string, JsonValue>;
  outputs: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue }>;
  message?: string;
};

export type AutomationStudioGraphExecutionTrace = {
  status: AutomationStudioGraphRunStatus;
  startedAt: number;
  finishedAt?: number;
  currentNodeId?: string;
  attempts: AutomationStudioNodeAttemptTrace[];
  values: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue; nodeId: string }>;
  message?: string;
};

export type AutomationStudioGraphExecutionOptions = {
  startNodeId?: string;
  inputs?: Record<string, JsonValue>;
  variables?: Record<string, JsonValue>;
  maxSteps?: number;
  random?: () => number;
  now?: () => number;
  signal?: AbortSignal;
};

export async function runAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions = {}
): Promise<AutomationStudioGraphExecutionTrace> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const attempts: AutomationStudioNodeAttemptTrace[] = [];
  const values: Record<string, JsonValue> = { ...(options.inputs ?? {}) };
  const effects: AutomationStudioGraphExecutionTrace["effects"] = [];
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  let currentNode = options.startNodeId ? nodesById.get(options.startNodeId) : findStartNode(flow);
  if (!currentNode) {
    return {
      status: "failed",
      startedAt,
      finishedAt: now(),
      attempts,
      values,
      effects,
      message: "No start node is available in this flow."
    };
  }

  const maxSteps = Math.max(1, options.maxSteps ?? 250);
  for (let step = 0; step < maxSteps; step += 1) {
    if (options.signal?.aborted) {
      return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, message: "Run cancelled." };
    }
    const attempt = await executeAutomationStudioNode(flow, currentNode, values, options, attempts.length + 1);
    attempts.push(attempt);
    for (const [key, value] of Object.entries(attempt.outputs)) {
      values[`${currentNode.id}.${key}`] = value;
      values[key] = value;
    }
    for (const effect of attempt.effects) effects.push({ ...effect, nodeId: currentNode.id });
    if (attempt.status === "waiting") {
      return {
        status: "waiting",
        startedAt,
        currentNodeId: currentNode.id,
        attempts,
        values,
        effects,
        ...(attempt.message ? { message: attempt.message } : {})
      };
    }
    if (attempt.status === "failed") {
      const failedEdge = chooseAutomationStudioEdge(flow, currentNode.id, attempt.route ?? "failed");
      if (!failedEdge) return {
        status: "failed",
        startedAt,
        finishedAt: now(),
        currentNodeId: currentNode.id,
        attempts,
        values,
        effects,
        ...(attempt.message ? { message: attempt.message } : {})
      };
      currentNode = nodesById.get(failedEdge.targetNodeId);
      if (!currentNode) return missingTargetTrace(startedAt, now(), failedEdge, attempts, values, effects);
      continue;
    }

    const nextEdge = chooseAutomationStudioEdge(flow, currentNode.id, attempt.route ?? "success");
    if (!nextEdge) {
      return { status: "succeeded", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects };
    }
    currentNode = nodesById.get(nextEdge.targetNodeId);
    if (!currentNode) return missingTargetTrace(startedAt, now(), nextEdge, attempts, values, effects);
  }

  return {
    status: "failed",
    startedAt,
    finishedAt: now(),
    currentNodeId: currentNode.id,
    attempts,
    values,
    effects,
    message: `Maximum step count exceeded: ${maxSteps}.`
  };
}

async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number
): Promise<AutomationStudioNodeAttemptTrace> {
  const startedAt = options.now?.() ?? Date.now();
  const definition = getAutomationNodeDefinition(node.definitionId);
  const inputs = collectNodeInputs(flow, node, values);
  if (!definition?.execute) {
    return {
      attemptId: `${node.id}.attempt.${attemptNumber}`,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: `Node definition is not executable: ${node.definitionId}.`
    };
  }
  try {
    const context = {
      inputs,
      parameters: node.parameterValues ?? {},
      variables: new Map(Object.entries(options.variables ?? {})),
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    };
    const result = await definition.execute(context);
    return nodeAttemptFromResult(node, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result);
  } catch (error) {
    return {
      attemptId: `${node.id}.attempt.${attemptNumber}`,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: error instanceof Error ? error.message : "Node execution failed."
    };
  }
}

function nodeAttemptFromResult(
  node: AutomationStudioFlowNode,
  startedAt: number,
  finishedAt: number,
  attemptNumber: number,
  inputs: Record<string, JsonValue>,
  result: AutomationNodeExecutionResult
): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: `${node.id}.attempt.${attemptNumber}`,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt,
    finishedAt,
    status: result.status === "failed" ? "failed" : result.status === "waiting" ? "waiting" : "succeeded",
    route: result.route ?? (result.status === "failed" ? "failed" : "success"),
    inputs,
    outputs: (result.outputs ?? {}) as Record<string, JsonValue>,
    effects: result.effects ?? []
  };
}

function collectNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = {};
  for (const edge of flow.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
    if (!edge.targetPortId || edge.targetPortId === "in") continue;
    const sourceKey = edge.sourcePortId ? `${edge.sourceNodeId}.${edge.sourcePortId}` : edge.sourceNodeId;
    if (values[sourceKey] !== undefined) inputs[edge.targetPortId] = values[sourceKey];
  }
  return { ...values, ...inputs };
}

function chooseAutomationStudioEdge(flow: AutomationStudioFlowDocument, sourceNodeId: string, route: string): AutomationStudioFlowEdge | null {
  const edges = flow.edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  return edges.find((edge) => edge.sourcePortId === route) ?? edges.find((edge) => !edge.sourcePortId && route === "success") ?? null;
}

function findStartNode(flow: AutomationStudioFlowDocument): AutomationStudioFlowNode | undefined {
  return flow.nodes.find((node) => node.definitionId === "builtin.control.start") ?? flow.nodes[0];
}

function missingTargetTrace(
  startedAt: number,
  finishedAt: number,
  edge: AutomationStudioFlowEdge,
  attempts: AutomationStudioNodeAttemptTrace[],
  values: Record<string, JsonValue>,
  effects: AutomationStudioGraphExecutionTrace["effects"]
): AutomationStudioGraphExecutionTrace {
  return {
    status: "failed",
    startedAt,
    finishedAt,
    attempts,
    values,
    effects,
    message: `Edge ${edge.id} points to missing node ${edge.targetNodeId}.`
  };
}

export function automationStudioTraceSummary(trace: AutomationStudioGraphExecutionTrace): JsonObject {
  return {
    status: trace.status,
    attempts: trace.attempts.length,
    effects: trace.effects.length,
    ...(trace.currentNodeId ? { currentNodeId: trace.currentNodeId } : {}),
    ...(trace.message ? { message: trace.message } : {})
  };
}
