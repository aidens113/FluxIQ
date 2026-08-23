import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/index.ts";
import { getAutomationNodeDefinition } from "../nodes/index.ts";
import type { AutomationNodeExecutionResult } from "../nodes/contracts.ts";
import type { AutomationStudioNativeLogEntry } from "../nodes/importer-sdk.ts";

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
  childTrace?: AutomationStudioGraphExecutionTrace;
  compositeTarget?: { flowId: string; version: string; flowDigest: string };
  regionId?: string;
  policyDecision?: { outcome: "selected" | "rejected" | "waiting"; reason: string; outputId?: string; confirmationInputId?: string };
  logs?: AutomationStudioNativeLogEntry[];
};

export type AutomationStudioGraphExecutionTrace = {
  status: AutomationStudioGraphRunStatus;
  startedAt: number;
  finishedAt?: number;
  currentNodeId?: string;
  attempts: AutomationStudioNodeAttemptTrace[];
  values: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue; nodeId: string }>;
  regionTransitions?: Array<{ handoffId: string; fromRegionId: string; toRegionId: string; edgeId: string; at: number }>;
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
  /** Absolute parent deadline inherited by nested Call Flow executions. */
  deadlineAt?: number;
  /** Resolves runtime effects such as importer-owned policy outputs. */
  effectDispatcher?: (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal }) => Promise<AutomationNodeExecutionResult | undefined> | AutomationNodeExecutionResult | undefined;
  /** Executes a pinned composite Flow when no built-in implementation exists. */
  compositeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; options: AutomationStudioGraphExecutionOptions }) => Promise<{ result: AutomationNodeExecutionResult; childTrace?: AutomationStudioGraphExecutionTrace; compositeTarget?: { flowId: string; version: string; flowDigest: string } } | undefined>;
  /** Executes explicitly bound importer or trusted-local Code Node implementations. */
  nativeNodeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; signal?: AbortSignal }) => Promise<{ result: AutomationNodeExecutionResult; logs?: AutomationStudioNativeLogEntry[] } | undefined>;
  nodeRegionIds?: Record<string, string>;
  regionRuntime?: {
    regions: Array<{ id: string; kind?: "deterministic" | "trigger" | "policy"; timeoutMs?: number; requiredRuntimeCapabilities?: string[] }>;
    handoffs: Array<{ id: string; fromRegionId: string; fromPortId: string; toRegionId: string; toPortId: string }>;
    nodeRegionIds: Record<string, string>;
  };
  runtimeCapabilities?: Iterable<string>;
  /** Domain capabilities actually bound by the importer for this run. */
  authorizedDomainIds?: Iterable<string>;
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
  const regionTransitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]> = [];
  const regionStartedAt = new Map<string, number>();
  const capabilities = new Set(options.runtimeCapabilities ?? []);
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
      return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
    }
    const regionId = options.regionRuntime?.nodeRegionIds[currentNode.id] ?? options.nodeRegionIds?.[currentNode.id];
    const region = options.regionRuntime?.regions.find((candidate) => candidate.id === regionId);
    if (regionId && !regionStartedAt.has(regionId)) regionStartedAt.set(regionId, now());
    const missingCapability = region?.requiredRuntimeCapabilities?.find((capability) => !capabilities.has(capability));
    if (missingCapability) return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: `Region ${regionId} requires runtime capability ${missingCapability}.` };
    const elapsed = region?.timeoutMs === undefined ? 0 : now() - (regionStartedAt.get(regionId!) ?? now());
    if (region?.timeoutMs !== undefined && elapsed >= region.timeoutMs) return { status: "failed", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: `Region ${regionId} exceeded its ${region.timeoutMs}ms timeout.` };
    const remainingMs = region?.timeoutMs === undefined ? undefined : region.timeoutMs - elapsed;
    const attempt = remainingMs === undefined
      ? await executeAutomationStudioNode(flow, currentNode, values, options, attempts.length + 1)
      : await executeWithRegionTimeout(
        (signal) => executeAutomationStudioNode(flow, currentNode!, values, { ...options, signal }, attempts.length + 1),
        remainingMs,
        options.signal,
        () => ({ attemptId: `${currentNode!.id}.attempt.${attempts.length + 1}`, nodeId: currentNode!.id, definitionId: currentNode!.definitionId, startedAt: now(), finishedAt: now(), status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: `Region ${regionId} exceeded its ${region!.timeoutMs}ms timeout.` })
      );
    const tracedAttempt = region?.kind === "policy" ? { ...attempt, policyDecision: policyDecisionForAttempt(currentNode, attempt) } : attempt;
    attempts.push(regionId ? { ...tracedAttempt, regionId } : tracedAttempt);
    for (const [key, value] of Object.entries(attempt.outputs)) {
      values[`${currentNode.id}.${key}`] = value;
      values[key] = value;
    }
    for (const effect of attempt.effects) effects.push({ ...effect, nodeId: currentNode.id });
    if (options.signal?.aborted) return { status: "cancelled", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions, message: "Run cancelled." };
    if (attempt.status === "waiting") {
      return {
        status: "waiting",
        startedAt,
        currentNodeId: currentNode.id,
        attempts,
        values,
        effects, regionTransitions,
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
        effects, regionTransitions,
        ...(attempt.message ? { message: attempt.message } : {})
      };
      currentNode = nodesById.get(failedEdge.targetNodeId);
      if (!currentNode) return missingTargetTrace(startedAt, now(), failedEdge, attempts, values, effects);
      recordRegionTransition(failedEdge, regionId, options, regionTransitions, now());
      continue;
    }

    const nextEdge = chooseAutomationStudioEdge(flow, currentNode.id, attempt.route ?? "success");
    if (!nextEdge) {
      const outgoingRoutes = flow.edges
        .filter((edge) => edge.sourceNodeId === currentNode!.id)
        .map((edge) => edge.sourcePortId ?? "success")
        .filter((route, index, routes) => routes.indexOf(route) === index);
      if (currentNode.definitionId === "builtin.control.end" || !outgoingRoutes.length && !hasUnvisitedAutomationStudioNodes(flow, attempts)) {
        return { status: "succeeded", startedAt, finishedAt: now(), currentNodeId: currentNode.id, attempts, values, effects, regionTransitions };
      }
      return {
        status: "failed",
        startedAt,
        finishedAt: now(),
        currentNodeId: currentNode.id,
        attempts,
        values,
        effects,
        regionTransitions,
        message: outgoingRoutes.length
          ? `Node ${currentNode.id} completed on route ${attempt.route ?? "success"}, but no matching outgoing edge exists. Available routes: ${outgoingRoutes.join(", ")}.`
          : `Node ${currentNode.id} completed without an outgoing edge before the Flow visited every node. Add an edge to continue or an End node to finish explicitly.`
      };
    }
    const previousRegionId = regionId;
    currentNode = nodesById.get(nextEdge.targetNodeId);
    if (!currentNode) return missingTargetTrace(startedAt, now(), nextEdge, attempts, values, effects);
    recordRegionTransition(nextEdge, previousRegionId, options, regionTransitions, now());
  }

  return {
    status: "failed",
    startedAt,
    finishedAt: now(),
    currentNodeId: currentNode.id,
    attempts,
    values,
    effects, regionTransitions,
    message: `Maximum step count exceeded: ${maxSteps}.`
  };
}

async function executeWithRegionTimeout(run: (signal: AbortSignal) => Promise<AutomationStudioNodeAttemptTrace>, timeoutMs: number, parentSignal: AbortSignal | undefined, timeoutAttempt: () => AutomationStudioNodeAttemptTrace): Promise<AutomationStudioNodeAttemptTrace> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const bounds = new Promise<AutomationStudioNodeAttemptTrace>((resolve) => {
      timer = setTimeout(() => { controller.abort(new Error("Region timeout.")); resolve(timeoutAttempt()); }, timeoutMs);
      if (parentSignal) {
        abortListener = () => { controller.abort(parentSignal.reason); resolve({ ...timeoutAttempt(), status: "cancelled", message: "Run cancelled." }); };
        parentSignal.addEventListener("abort", abortListener, { once: true });
        if (parentSignal.aborted) abortListener();
      }
    });
    return await Promise.race([run(controller.signal), bounds]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (parentSignal && abortListener) parentSignal.removeEventListener("abort", abortListener);
  }
}

function policyDecisionForAttempt(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): NonNullable<AutomationStudioNodeAttemptTrace["policyDecision"]> {
  const outputId = typeof node.parameterValues?.outputId === "string" ? node.parameterValues.outputId : undefined;
  const confirmationInputId = typeof node.parameterValues?.confirmationInputId === "string" ? node.parameterValues.confirmationInputId : undefined;
  if (attempt.status === "waiting") return { outcome: "waiting", reason: attempt.message ?? "Policy action is waiting for confirmation or external state.", ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
  if (attempt.status === "failed" || attempt.status === "cancelled") return { outcome: "rejected", reason: attempt.message ?? (confirmationInputId ? `Policy action did not receive confirmation from ${confirmationInputId}.` : "Policy action failed or was rejected."), ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
  return { outcome: "selected", reason: outputId ? `Policy selected registered output ${outputId}.` : "Policy step completed successfully.", ...(outputId ? { outputId } : {}), ...(confirmationInputId ? { confirmationInputId } : {}) };
}

function recordRegionTransition(edge: AutomationStudioFlowEdge, fromRegionId: string | undefined, options: AutomationStudioGraphExecutionOptions, transitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]>, at: number): void {
  if (!fromRegionId || !options.regionRuntime) return;
  const toRegionId = options.regionRuntime.nodeRegionIds[edge.targetNodeId];
  if (!toRegionId || toRegionId === fromRegionId) return;
  const handoff = options.regionRuntime.handoffs.find((candidate) => candidate.fromRegionId === fromRegionId && candidate.toRegionId === toRegionId && candidate.fromPortId === (edge.sourcePortId ?? "success") && candidate.toPortId === (edge.targetPortId ?? "in"));
  if (handoff) transitions.push({ handoffId: handoff.id, fromRegionId, toRegionId, edgeId: edge.id, at });
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
  if (definition && node.definitionVersion && node.definitionVersion !== "1.0.0") {
    return { attemptId: `${node.id}.attempt.${attemptNumber}`, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [], message: `Node ${node.definitionId} pins ${node.definitionVersion}, but built-in version 1.0.0 is available.` };
  }
  if (!definition?.execute) {
    const native = await options.nativeNodeExecutor?.({ node, inputs, ...(options.signal ? { signal: options.signal } : {}) });
    if (native) { const result = await dispatchAutomationStudioEffects(native.result, options); return { ...nodeAttemptFromResult(node, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...(native.logs?.length ? { logs: native.logs } : {}) }; }
    const composite = await options.compositeExecutor?.({ node, inputs, options });
    if (composite) {
      return { ...nodeAttemptFromResult(node, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) };
    }
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
    let result = await definition.execute(context);
    result = await dispatchAutomationStudioEffects(result, options);
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

async function dispatchAutomationStudioEffects(initial: AutomationNodeExecutionResult, options: AutomationStudioGraphExecutionOptions): Promise<AutomationNodeExecutionResult> {
  let result = initial; if (!options.effectDispatcher) return result;
  for (const effect of result.effects ?? []) {
    const dispatched = await options.effectDispatcher(effect, options.signal ? { signal: options.signal } : undefined); if (!dispatched) continue;
    const outputs = { ...(result.outputs ?? {}), ...(dispatched.outputs ?? {}) };
    if (dispatched.status === "failed") { result = { ...result, outputs, status: "failed", route: dispatched.route ?? "failed" }; break; }
    result = { ...result, outputs };
  }
  return result;
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

function hasUnvisitedAutomationStudioNodes(flow: AutomationStudioFlowDocument, attempts: AutomationStudioNodeAttemptTrace[]): boolean {
  const visited = new Set(attempts.map((attempt) => attempt.nodeId));
  return flow.nodes.some((node) => !visited.has(node.id));
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
