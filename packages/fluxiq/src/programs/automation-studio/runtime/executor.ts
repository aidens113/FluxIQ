import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/index.ts";
import { getAutomationNodeDefinition, resolveAutomationNodeParameterValues } from "../nodes/index.ts";
import type { AutomationNodeExecutionResult } from "../nodes/contracts.ts";
import type { AutomationStudioNativeLogEntry } from "../nodes/importer-sdk.ts";
import { hostRuntimeCapabilityIds, type AutomationStudioHostRuntimeBoundary, type AutomationStudioHostStateSnapshotRef } from "./host-runtime.ts";

export type AutomationStudioGraphRunStatus = "running" | "succeeded" | "failed" | "waiting" | "cancelled";

export type AutomationStudioTransitionComparisonStatus =
  | "matched"
  | "tolerated"
  | "missing_expected_state"
  | "unexpected_state"
  | "action_failed"
  | "timeout"
  | "blocked"
  | "ambiguous"
  | "unknown";

export type AutomationStudioExpectedTransition = {
  transitionId: string;
  nodeId: string;
  definitionId: string;
  expectedRoute?: string;
  expectedStatus?: AutomationStudioGraphRunStatus;
  expectedOutputs?: Record<string, JsonValue>;
  expectedEffects?: Array<{ type: string; payload?: JsonValue }>;
  expectedState?: JsonObject;
  tolerance?: {
    allowWaiting?: boolean;
    allowSkipped?: boolean;
    toleratedRoutes?: string[];
  };
  metadata?: JsonObject;
};

export type AutomationStudioActualTransition = {
  transitionId: string;
  nodeId: string;
  definitionId: string;
  status: AutomationStudioGraphRunStatus;
  route?: string;
  outputs: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue }>;
  message?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  metadata?: JsonObject;
};

export type AutomationStudioTransitionComparison = {
  comparisonId: string;
  nodeId: string;
  attemptId: string;
  status: AutomationStudioTransitionComparisonStatus;
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  diffSummary: {
    missingOutputIds: string[];
    unexpectedOutputIds: string[];
    missingEffectTypes: string[];
    unexpectedEffectTypes: string[];
    routeMatched: boolean;
    statusMatched: boolean;
    stateCheckCount: number;
  };
  message?: string;
  metadata?: JsonObject;
};

export type AutomationStudioRecoveryLookupInput = {
  nodeId: string;
  definitionId: string;
  attemptId: string;
  comparisonStatus: AutomationStudioTransitionComparisonStatus;
  currentSubflowId?: string;
  failedRoute?: string;
};

export type AutomationStudioRecoveryCandidate = {
  kind: "deterministic_path" | "approved_runtime_patch" | "reroute" | "llm_diagnosis";
  priority: number;
  label: string;
  targetNodeId?: string;
  edgeId?: string;
  subflowId?: string;
  reason: string;
};

export type AutomationStudioRecoveryDecision = {
  lookup: AutomationStudioRecoveryLookupInput;
  candidates: AutomationStudioRecoveryCandidate[];
  selected?: AutomationStudioRecoveryCandidate;
  metadata?: JsonObject;
};

export type AutomationStudioRecoveryBudget = {
  maxRetriesPerAction?: number;
  maxRecoveryAttemptsPerSubflow?: number;
  maxReroutesPerRun?: number;
  maxAdaptationOrLlmAttemptsPerRun?: number;
};

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
  transitionComparison?: AutomationStudioTransitionComparison;
  recoveryDecision?: AutomationStudioRecoveryDecision;
  logs?: AutomationStudioNativeLogEntry[];
  stateRefs?: {
    beforeAction?: AutomationStudioHostStateSnapshotRef;
    afterAction?: AutomationStudioHostStateSnapshotRef;
    stateDiff?: JsonObject;
  };
  hostCapabilities?: string[];
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
  nativeNodeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; signal?: AbortSignal; hostContext?: { currentStateRef?: AutomationStudioHostStateSnapshotRef; previousStateRef?: AutomationStudioHostStateSnapshotRef; capabilityIds: string[]; sideEffectClass: "none" | "internal" | "external" | "destructive"; target?: JsonValue } }) => Promise<{ result: AutomationNodeExecutionResult; logs?: AutomationStudioNativeLogEntry[] } | undefined>;
  nodeRegionIds?: Record<string, string>;
  regionRuntime?: {
    regions: Array<{ id: string; kind?: "deterministic" | "trigger" | "policy"; timeoutMs?: number; requiredRuntimeCapabilities?: string[] }>;
    handoffs: Array<{ id: string; fromRegionId: string; fromPortId: string; toRegionId: string; toPortId: string }>;
    nodeRegionIds: Record<string, string>;
  };
  runtimeCapabilities?: Iterable<string>;
  /** Domain capabilities actually bound by the importer for this run. */
  authorizedDomainIds?: Iterable<string>;
  currentSubflowId?: string;
  approvedRuntimePatchNodeIds?: Iterable<string>;
  recoveryBudget?: AutomationStudioRecoveryBudget;
  hostRuntime?: AutomationStudioHostRuntimeBoundary;
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
    const attemptIndex = attempts.length;
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
      const recoveryDecision = chooseAutomationStudioRecovery(flow, currentNode, attempt, attempts[attemptIndex]!.transitionComparison, failedEdge, options, recoveryBudgetState(attempts, attemptIndex, currentNode.id, options.currentSubflowId));
      attempts[attemptIndex] = {
        ...attempts[attemptIndex]!,
        recoveryDecision
      };
      const executableFailedEdge = recoveryDecision.selected?.kind === "deterministic_path" && recoveryDecision.selected.edgeId === failedEdge?.id ? failedEdge : null;
      if (!executableFailedEdge) {
        const recoveryStopMessage = failureMessageForRecoveryStop(recoveryDecision, attempt);
        return {
          status: "failed",
          startedAt,
          finishedAt: now(),
          currentNodeId: currentNode.id,
          attempts,
          values,
          effects, regionTransitions,
          ...(recoveryStopMessage ? { message: recoveryStopMessage } : {})
        };
      }
      currentNode = nodesById.get(executableFailedEdge.targetNodeId);
      if (!currentNode) return missingTargetTrace(startedAt, now(), executableFailedEdge, attempts, values, effects);
      recordRegionTransition(executableFailedEdge, regionId, options, regionTransitions, now());
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
  const attemptId = `${node.id}.attempt.${attemptNumber}`;
  const definition = getAutomationNodeDefinition(node.definitionId);
  const inputs = collectNodeInputs(flow, node, values);
  const resolvedParameters = resolveAutomationNodeParameterValues(node.parameterValues ?? {}, {
    ...(options.inputs ?? {}),
    ...(options.variables ?? {}),
    ...values,
    ...inputs
  });
  const executionNode = resolvedParameters.missingPaths.length
    ? node
    : { ...node, parameterValues: resolvedParameters.values };
  const hostCapabilities = hostRuntimeCapabilityIds(options.hostRuntime);
  if (resolvedParameters.missingPaths.length) {
    return {
      attemptId,
      nodeId: node.id,
      definitionId: node.definitionId,
      startedAt,
      finishedAt: options.now?.() ?? Date.now(),
      status: "failed",
      route: "failed",
      inputs,
      outputs: {},
      effects: [],
      message: `State-bound parameter path${resolvedParameters.missingPaths.length === 1 ? "" : "s"} could not be resolved: ${resolvedParameters.missingPaths.join(", ")}.`
    };
  }
  const beforeAction = await captureHostState(options, { node: executionNode, attemptId, inputs, point: "before_action" });
  if (definition && node.definitionVersion && node.definitionVersion !== "1.0.0") {
    return await enrichAttemptWithHostState({ attemptId, nodeId: node.id, definitionId: node.definitionId, startedAt, finishedAt: options.now?.() ?? Date.now(), status: "failed", route: "failed", inputs, outputs: {}, effects: [], message: `Node ${node.definitionId} pins ${node.definitionVersion}, but built-in version 1.0.0 is available.` }, options, beforeAction, hostCapabilities);
  }
  if (!definition?.execute) {
    const native = await options.nativeNodeExecutor?.({
      node: executionNode,
      inputs,
      ...(options.signal ? { signal: options.signal } : {}),
      hostContext: {
        capabilityIds: hostCapabilities,
        sideEffectClass: sideEffectClassForNode(executionNode),
        ...(beforeAction ? { currentStateRef: beforeAction, previousStateRef: beforeAction } : {}),
        ...(executionNode.parameterValues?.target !== undefined ? { target: executionNode.parameterValues.target } : {})
      }
    });
    if (native) {
      const result = await dispatchAutomationStudioEffects(native.result, options);
      return await enrichAttemptWithHostState({ ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), ...(native.logs?.length ? { logs: native.logs } : {}) }, options, beforeAction, hostCapabilities);
    }
    const composite = await options.compositeExecutor?.({ node: executionNode, inputs, options });
    if (composite) {
      return await enrichAttemptWithHostState({ ...nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, composite.result), ...(composite.childTrace ? { childTrace: composite.childTrace } : {}), ...(composite.compositeTarget ? { compositeTarget: composite.compositeTarget } : {}) }, options, beforeAction, hostCapabilities);
    }
    return await enrichAttemptWithHostState({
      attemptId,
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
    }, options, beforeAction, hostCapabilities);
  }
  try {
    const context = {
      inputs,
      parameters: resolvedParameters.values,
      variables: new Map(Object.entries(options.variables ?? {})),
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    };
    let result = await definition.execute(context);
    result = await dispatchAutomationStudioEffects(result, options);
    return await enrichAttemptWithHostState(nodeAttemptFromResult(executionNode, startedAt, options.now?.() ?? Date.now(), attemptNumber, inputs, result), options, beforeAction, hostCapabilities);
  } catch (error) {
    return await enrichAttemptWithHostState({
      attemptId,
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
    }, options, beforeAction, hostCapabilities);
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

async function captureHostState(
  options: AutomationStudioGraphExecutionOptions,
  input: { node: AutomationStudioFlowNode; attemptId: string; inputs: Readonly<Record<string, JsonValue>>; point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" }
): Promise<AutomationStudioHostStateSnapshotRef | undefined> {
  const capture = options.hostRuntime?.captureStateSnapshot;
  if (!capture) return undefined;
  try {
    return await Promise.resolve(capture(input));
  } catch {
    return undefined;
  }
}

async function enrichAttemptWithHostState(
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions,
  beforeAction: AutomationStudioHostStateSnapshotRef | undefined,
  hostCapabilities: string[]
): Promise<AutomationStudioNodeAttemptTrace> {
  const node = { id: attempt.nodeId, definitionId: attempt.definitionId, parameterValues: {} };
  const afterAction = await captureHostState(options, { node, attemptId: attempt.attemptId, inputs: attempt.inputs, point: "after_action" });
  const inspectStateDiff = options.hostRuntime?.inspectStateDiff;
  let stateDiff: JsonObject | undefined;
  if (inspectStateDiff && (beforeAction || afterAction)) {
    try {
      stateDiff = await Promise.resolve(inspectStateDiff({
        ...(beforeAction ? { before: beforeAction } : {}),
        ...(afterAction ? { after: afterAction } : {}),
        node,
        attemptId: attempt.attemptId
      }));
    } catch {
      stateDiff = undefined;
    }
  }
  return {
    ...attempt,
    ...(hostCapabilities.length ? { hostCapabilities } : {}),
    ...((beforeAction || afterAction || stateDiff) ? {
      stateRefs: {
        ...(beforeAction ? { beforeAction } : {}),
        ...(afterAction ? { afterAction } : {}),
        ...(stateDiff ? { stateDiff } : {})
      }
    } : {})
  };
}

function sideEffectClassForNode(node: AutomationStudioFlowNode): "none" | "internal" | "external" | "destructive" {
  if (node.metadata?.destructive === true) return "destructive";
  if (node.metadata?.externalSideEffect === true) return "external";
  if (node.definitionId === "builtin.policy.action") return "external";
  if (node.definitionId.startsWith("builtin.database.")) return node.parameterValues?.dryRun === true ? "internal" : "external";
  return "none";
}

function nodeAttemptFromResult(
  node: AutomationStudioFlowNode,
  startedAt: number,
  finishedAt: number,
  attemptNumber: number,
  inputs: Record<string, JsonValue>,
  result: AutomationNodeExecutionResult
): AutomationStudioNodeAttemptTrace {
  const finishedStatus = result.status === "failed" ? "failed" : result.status === "waiting" ? "waiting" : "succeeded";
  const route = result.route ?? (result.status === "failed" ? "failed" : "success");
  const attempt: AutomationStudioNodeAttemptTrace = {
    attemptId: `${node.id}.attempt.${attemptNumber}`,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt,
    finishedAt,
    status: finishedStatus,
    route,
    inputs,
    outputs: (result.outputs ?? {}) as Record<string, JsonValue>,
    effects: result.effects ?? []
  };
  return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt) };
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

export function compareAutomationStudioTransition(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): AutomationStudioTransitionComparison {
  const expected = expectedTransitionForNode(node, attempt);
  const actual = actualTransitionForAttempt(attempt);
  const expectedOutputIds = Object.keys(expected.expectedOutputs ?? {});
  const actualOutputIds = Object.keys(actual.outputs);
  const expectedEffectTypes = (expected.expectedEffects ?? []).map((effect) => effect.type);
  const actualEffectTypes = actual.effects.map((effect) => effect.type);
  const missingOutputIds = expectedOutputIds.filter((id) => actual.outputs[id] === undefined);
  const unexpectedOutputIds = actualOutputIds.filter((id) => !expectedOutputIds.includes(id));
  const missingEffectTypes = uniqueStrings(expectedEffectTypes.filter((type) => !actualEffectTypes.includes(type)));
  const unexpectedEffectTypes = uniqueStrings(actualEffectTypes.filter((type) => !expectedEffectTypes.includes(type)));
  const routeMatched = expected.expectedRoute === undefined
    || actual.route === expected.expectedRoute
    || Boolean(expected.tolerance?.toleratedRoutes?.includes(actual.route ?? ""));
  const statusMatched = expected.expectedStatus === undefined || actual.status === expected.expectedStatus || (expected.tolerance?.allowWaiting === true && actual.status === "waiting");
  const stateCheckCount = Object.keys(expected.expectedState ?? {}).length;
  const status = classifyTransitionComparisonStatus({
    expected,
    actual,
    missingOutputIds,
    missingEffectTypes,
    routeMatched,
    statusMatched,
    stateCheckCount
  });
  const message = comparisonMessage(status, expected, actual, missingOutputIds, missingEffectTypes);
  return {
    comparisonId: `${attempt.attemptId}.comparison`,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    status,
    expected,
    actual,
    diffSummary: {
      missingOutputIds,
      unexpectedOutputIds,
      missingEffectTypes,
      unexpectedEffectTypes,
      routeMatched,
      statusMatched,
      stateCheckCount
    },
    ...(message ? { message } : {})
  };
}

function expectedTransitionForNode(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): AutomationStudioExpectedTransition {
  const expectedOutputs = jsonObjectParameter(node.parameterValues?.expectedOutputs);
  const expectedEffects = expectedEffectsForNode(node);
  const expectedState = jsonObjectParameter(node.parameterValues?.expectedState)
    ?? expectationStateFromNode(node)
    ?? undefined;
  const expectedRoute = typeof node.parameterValues?.expectedRoute === "string" && node.parameterValues.expectedRoute.trim()
    ? node.parameterValues.expectedRoute.trim()
    : node.definitionId === "builtin.policy.expectation"
      ? "passed"
      : node.definitionId === "builtin.timing.timeout"
        ? String(node.parameterValues?.timeoutRoute ?? "timeout")
        : attempt.status === "failed"
          ? "failed"
          : undefined;
  const tolerance = {
    ...(node.definitionId === "builtin.timing.wait" || node.definitionId === "builtin.routine.approval" ? { allowWaiting: true } : {}),
    ...(node.definitionId === "builtin.timing.timeout" ? { toleratedRoutes: ["timeout", "success"] } : {})
  };
  const expectedStatus = expectedStatusForNode(node);
  return {
    transitionId: `${attempt.attemptId}.expected`,
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(expectedRoute ? { expectedRoute } : {}),
    ...(expectedStatus ? { expectedStatus } : {}),
    ...(expectedOutputs ? { expectedOutputs } : {}),
    ...(expectedEffects.length ? { expectedEffects } : {}),
    ...(expectedState ? { expectedState } : {}),
    ...(Object.keys(tolerance).length ? { tolerance } : {})
  };
}

function actualTransitionForAttempt(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioActualTransition {
  const durationMs = attempt.finishedAt === undefined ? undefined : Math.max(0, attempt.finishedAt - attempt.startedAt);
  return {
    transitionId: `${attempt.attemptId}.actual`,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    ...(attempt.route ? { route: attempt.route } : {}),
    outputs: attempt.outputs,
    effects: attempt.effects,
    ...(attempt.message ? { message: attempt.message } : {}),
    startedAt: attempt.startedAt,
    ...(attempt.finishedAt !== undefined ? { finishedAt: attempt.finishedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {})
  };
}

function classifyTransitionComparisonStatus(input: {
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  missingOutputIds: string[];
  missingEffectTypes: string[];
  routeMatched: boolean;
  statusMatched: boolean;
  stateCheckCount: number;
}): AutomationStudioTransitionComparisonStatus {
  if (input.actual.status === "waiting") return input.expected.tolerance?.allowWaiting ? "tolerated" : "blocked";
  if (input.actual.status === "cancelled") return "blocked";
  if (input.actual.status === "failed") {
    const text = `${input.actual.route ?? ""} ${input.actual.message ?? ""}`.toLowerCase();
    return text.includes("timeout") || text.includes("timed out") ? "timeout" : "action_failed";
  }
  if (!input.statusMatched || !input.routeMatched) return "unexpected_state";
  if (input.stateCheckCount > 0 && (input.actual.route === "failed" || input.actual.outputs.failed === true)) return "missing_expected_state";
  if (input.missingOutputIds.length || input.missingEffectTypes.length) return "missing_expected_state";
  if (input.actual.status !== "succeeded") return "unknown";
  return "matched";
}

function comparisonMessage(status: AutomationStudioTransitionComparisonStatus, expected: AutomationStudioExpectedTransition, actual: AutomationStudioActualTransition, missingOutputIds: string[], missingEffectTypes: string[]): string | undefined {
  if (status === "matched") return undefined;
  if (status === "tolerated") return "The transition did not finish, but waiting is tolerated for this node.";
  if (status === "blocked") return actual.message ?? "The transition is blocked or waiting without a tolerated wait policy.";
  if (status === "timeout") return actual.message ?? "The transition timed out.";
  if (status === "action_failed") return actual.message ?? "The node action failed.";
  if (status === "unexpected_state") return `Expected route/status did not match actual route/status (${expected.expectedRoute ?? "any"} -> ${actual.route ?? "none"}).`;
  if (status === "missing_expected_state") {
    const missing = [...missingOutputIds, ...missingEffectTypes.map((type) => `effect:${type}`)];
    return missing.length ? `Missing expected transition evidence: ${missing.join(", ")}.` : "Expected state was not confirmed.";
  }
  if (status === "ambiguous") return "The transition result is ambiguous.";
  return "The transition result is unknown.";
}

function chooseAutomationStudioRecovery(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  comparison: AutomationStudioTransitionComparison | undefined,
  failedEdge: AutomationStudioFlowEdge | null,
  options: AutomationStudioGraphExecutionOptions,
  budgetState: {
    failedAttemptsForAction: number;
    recoveryAttemptsForSubflow: number;
    reroutesForRun: number;
    llmAttemptsForRun: number;
  }
): AutomationStudioRecoveryDecision {
  const lookup: AutomationStudioRecoveryLookupInput = {
    nodeId: node.id,
    definitionId: node.definitionId,
    attemptId: attempt.attemptId,
    comparisonStatus: comparison?.status ?? "unknown",
    ...(options.currentSubflowId ? { currentSubflowId: options.currentSubflowId } : {}),
    ...(attempt.route ? { failedRoute: attempt.route } : {})
  };
  const approvedPatchNodeIds = new Set(options.approvedRuntimePatchNodeIds ?? []);
  const budget = options.recoveryBudget ?? {};
  const candidates: AutomationStudioRecoveryCandidate[] = [];
  const budgetExhausted = recoveryBudgetExhaustion(budget, budgetState);
  if (failedEdge && !budgetExhausted.retry && !budgetExhausted.recovery && !budgetExhausted.reroute) {
    candidates.push({
      kind: "deterministic_path",
      priority: 1,
      label: "Follow failed route",
      targetNodeId: failedEdge.targetNodeId,
      edgeId: failedEdge.id,
      reason: `Flow edge ${failedEdge.id} handles route ${failedEdge.sourcePortId ?? "failed"}.`
    });
  }
  for (const recoveryNode of flow.nodes.filter((candidate) => candidate.definitionId === "builtin.policy.recovery")) {
    if (recoveryNode.id === node.id) continue;
    const incoming = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.targetNodeId === recoveryNode.id);
    if (budgetExhausted.recovery || (!approvedPatchNodeIds.has(recoveryNode.id) && budgetExhausted.reroute)) continue;
    candidates.push({
      kind: approvedPatchNodeIds.has(recoveryNode.id) ? "approved_runtime_patch" : "reroute",
      priority: approvedPatchNodeIds.has(recoveryNode.id) ? 2 : 3,
      label: approvedPatchNodeIds.has(recoveryNode.id) ? "Apply approved recovery patch" : "Reroute to recovery node",
      targetNodeId: recoveryNode.id,
      ...(incoming ? { edgeId: incoming.id } : {}),
      reason: incoming ? `Recovery node ${recoveryNode.id} is already connected from ${node.id}.` : `Recovery node ${recoveryNode.id} is available in this Flow.`
    });
  }
  if (!budgetExhausted.llm) {
    candidates.push({
      kind: "llm_diagnosis",
      priority: 4,
      label: "Request LLM diagnosis",
      reason: "No lower-priority deterministic recovery fully resolved the failed transition."
    });
  }
  candidates.sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label));
  const selected = candidates[0];
  return {
    lookup,
    candidates,
    ...(selected ? { selected } : {}),
    metadata: {
      budgetState,
      ...(budgetExhausted.message ? { budgetExhausted: budgetExhausted.message } : {})
    }
  };
}

function recoveryBudgetState(attempts: AutomationStudioNodeAttemptTrace[], currentAttemptIndex: number, nodeId: string, currentSubflowId: string | undefined): { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number } {
  const previous = attempts.filter((_, index) => index !== currentAttemptIndex);
  const previousRecovery = previous.filter((attempt) => attempt.recoveryDecision);
  return {
    failedAttemptsForAction: previous.filter((attempt) => attempt.nodeId === nodeId && attempt.status === "failed").length,
    recoveryAttemptsForSubflow: previousRecovery.filter((attempt) => !currentSubflowId || attempt.recoveryDecision?.lookup.currentSubflowId === currentSubflowId).length,
    reroutesForRun: previousRecovery.filter((attempt) => {
      const kind = attempt.recoveryDecision?.selected?.kind;
      return kind === "deterministic_path" || kind === "reroute";
    }).length,
    llmAttemptsForRun: previousRecovery.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length
  };
}

function recoveryBudgetExhaustion(budget: AutomationStudioRecoveryBudget, state: { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number }): { retry: boolean; recovery: boolean; reroute: boolean; llm: boolean; message?: string } {
  const retry = budget.maxRetriesPerAction !== undefined && state.failedAttemptsForAction >= budget.maxRetriesPerAction;
  const recovery = budget.maxRecoveryAttemptsPerSubflow !== undefined && state.recoveryAttemptsForSubflow >= budget.maxRecoveryAttemptsPerSubflow;
  const reroute = budget.maxReroutesPerRun !== undefined && state.reroutesForRun >= budget.maxReroutesPerRun;
  const llm = budget.maxAdaptationOrLlmAttemptsPerRun !== undefined && state.llmAttemptsForRun >= budget.maxAdaptationOrLlmAttemptsPerRun;
  const exhausted = [
    retry ? "max retries per action" : "",
    recovery ? "max recovery attempts per subflow" : "",
    reroute ? "max reroutes per run" : "",
    llm ? "max adaptation/LLM attempts per run" : ""
  ].filter(Boolean);
  return {
    retry,
    recovery,
    reroute,
    llm,
    ...(exhausted.length ? { message: `Recovery budget exhausted: ${exhausted.join(", ")}.` } : {})
  };
}

function failureMessageForRecoveryStop(recoveryDecision: AutomationStudioRecoveryDecision, attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  if (recoveryDecision.selected?.kind === "llm_diagnosis") return "Recovery ladder reached LLM diagnosis fallback before a configured provider was invoked.";
  if (recoveryDecision.metadata?.budgetExhausted) return String(recoveryDecision.metadata.budgetExhausted);
  return attempt.message;
}

function expectedStatusForNode(node: AutomationStudioFlowNode): AutomationStudioGraphRunStatus | undefined {
  if (node.definitionId === "builtin.timing.wait" || node.definitionId === "builtin.routine.approval") return "waiting";
  if (node.definitionId === "builtin.control.end" && node.parameterValues?.resultStatus === "failed") return "failed";
  return "succeeded";
}

function expectedEffectsForNode(node: AutomationStudioFlowNode): Array<{ type: string; payload?: JsonValue }> {
  if (Array.isArray(node.parameterValues?.expectedEffects)) return node.parameterValues.expectedEffects.filter(isEffectShape);
  if (node.definitionId === "builtin.policy.action") return [{ type: "policy.output.dispatch" }];
  if (node.definitionId === "builtin.policy.expectation") return [{ type: "policy.expectation.checked" }];
  if (node.definitionId === "builtin.routine.approval") return [{ type: "routine.approval.requested" }];
  if (node.definitionId === "builtin.routine.task-policy") return [{ type: "routine.task-policy.requested" }];
  if (node.definitionId === "builtin.routine.subroutine") return [{ type: "routine.subroutine.requested" }];
  if (node.definitionId.startsWith("builtin.database.")) return [{ type: `${node.definitionId.replace("builtin.", "")}.requested` }];
  return [];
}

function expectationStateFromNode(node: AutomationStudioFlowNode): JsonObject | undefined {
  if (node.definitionId !== "builtin.policy.expectation") return undefined;
  const conditions = Array.isArray(node.parameterValues?.conditions) ? node.parameterValues.conditions : [];
  if (!conditions.length) return undefined;
  return { conditions: conditions as JsonValue, mode: typeof node.parameterValues?.mode === "string" ? node.parameterValues.mode : "all" };
}

function jsonObjectParameter(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function isEffectShape(value: unknown): value is { type: string; payload?: JsonValue } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
