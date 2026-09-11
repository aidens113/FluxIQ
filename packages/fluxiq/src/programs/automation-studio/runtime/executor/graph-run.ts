import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { chooseAutomationStudioEdge, findStartNode, hasUnvisitedAutomationStudioNodes, missingTargetTrace } from "./graph-navigation.ts";
import { executeAutomationStudioNode } from "./node-execution.ts";
import { recoveryBudgetState } from "./recovery-budget.ts";
import { chooseAutomationStudioRecovery, failureMessageForRecoveryStop } from "./recovery-ladder.ts";
import { executeWithRegionTimeout, policyDecisionForAttempt, recordRegionTransition } from "./region-execution.ts";

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

    const nextEdge = chooseAutomationStudioEdge(flow, currentNode.id, attempt.route ?? "success", currentNode.definitionId);
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
