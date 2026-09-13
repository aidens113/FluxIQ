import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { resolveAutomationNodeParameterValues } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { chooseAutomationStudioEdge, hasUnvisitedAutomationStudioNodes, missingTargetTrace } from "./graph-navigation.ts";
import { executeAutomationStudioNode } from "./node-execution.ts";
import { recoveryBudgetState } from "./recovery-budget.ts";
import { chooseAutomationStudioRecovery, failureMessageForRecoveryStop } from "./recovery-ladder.ts";
import { executeWithRegionTimeout, policyDecisionForAttempt, recordRegionTransition } from "./region-execution.ts";
import { chooseAutomationStudioStartNode } from "./start-node.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, automationStudioTraceWithholding, type AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";

/**
 * What each saved trace this module returned withheld by value, keyed by that
 * trace. A Call Flow attempt keeps its child's saved trace while the parent
 * executes with the child's real outputs, so a value the child withheld can
 * reach the parent's own trace -- in an output, or in a failure message the
 * parent binds -- and the parent withholds it as well.
 */
const withheldBySavedTrace = new WeakMap<AutomationStudioGraphExecutionTrace, FluxIQRuntimeWithheldValues>();

/**
 * The one place a run trace is produced, and therefore the one place values a
 * run resolved out of state are withheld from it.
 *
 * The withholding is applied to the finished trace on the way out rather than
 * stamped onto each attempt as it is built. A stage that hands on an
 * already-clean-looking artifact is what disarms the stage after it, and this
 * stage is the last one that still owns the artifact: what it returns is what
 * `runtime/service.ts` persists. Everything the run *executes* with -- the live
 * `values` map, the effect handed to the dispatcher, the inputs the host is
 * given for its state snapshots -- keeps the real value, because withholding
 * there would break the run rather than the leak.
 *
 * Execution that goes on from a finished run reads real values as well. A caller
 * that does -- a Call Flow parent building its outputs from its child, a
 * live-patch rerun seeded from the attempt that failed -- passes
 * `onExecutedTrace`, which is handed the trace as the run executed it beside the
 * saved trace this returns. The executed trace is for executing with only, and
 * is never to be persisted or published; the saved trace is the one to keep.
 */
export async function runAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions = {},
  onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void
): Promise<AutomationStudioGraphExecutionTrace> {
  const withholding = automationStudioTraceWithholding();
  recordDeclaredStateBindings(flow, options, withholding);
  const executed = await executeAutomationStudioGraph(flow, options, withholding);
  for (const attempt of executed.attempts) {
    const childWithheld = attempt.childTrace ? withheldBySavedTrace.get(attempt.childTrace) : undefined;
    if (childWithheld) withholding.include(childWithheld);
  }
  const saved = withholding.apply(withholdRunInputs(executed, options.inputs ?? {}));
  withheldBySavedTrace.set(saved, withholding.values());
  onExecutedTrace?.(executed, saved);
  return saved;
}

/**
 * Seeds the withholding with whatever the run's own inputs and variables answer
 * for the bindings the document declares, before the first node executes.
 *
 * Without it the trace is protected only from the moment a bound node runs, and
 * a run that fails before that still persists the supplied value: it arrives in
 * `options.inputs`, which is what `values` and every attempt's `inputs` are
 * seeded from. The seed asks the same resolver the executor asks, so what counts
 * as a binding, and how deep one may sit, is decided in one place rather than
 * two.
 */
function recordDeclaredStateBindings(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  withholding: AutomationStudioTraceWithholding
): void {
  const state = { ...(options.inputs ?? {}), ...(options.variables ?? {}) };
  for (const node of flow.nodes) {
    const authored = node.parameterValues ?? {};
    withholding.record(authored, resolveAutomationNodeParameterValues(authored, state).values);
  }
}

/** How deep a withheld input is walked before it is withheld whole: the bound the value-based rewrite uses. */
const MAXIMUM_INPUT_DEPTH = 64;

/**
 * The trace with every run input withheld where this module saved it: in
 * `values`, and in each attempt's `inputs`, both seeded from `options.inputs`.
 *
 * A run input is run-time data of unknown sensitivity whether or not a node reads
 * it, but only an input a binding resolved is recorded for the value-based
 * rewrite, so one no binding reads was saved here in clear. It is found by
 * position and proved by identity: the entry still holds the value the caller
 * supplied, not a node output written over the same key.
 *
 * Not by value. A value the run computed can equal an input (5 + 0), and
 * withholding every equal value would make the saved trace misreport what the
 * run computed. The cost is a known gap: an input no binding reads, copied by a
 * node into an output under another key, stays in clear at that copy. Nothing
 * executes from this copy -- a Call Flow parent and a live-patch rerun are handed
 * the executed trace -- so the choice shapes only what is kept. A withheld input
 * keeps its shape, as everything else the trace withholds does.
 */
function withholdRunInputs(trace: AutomationStudioGraphExecutionTrace, inputs: Record<string, JsonValue>): AutomationStudioGraphExecutionTrace {
  if (!Object.keys(inputs).length) return trace;
  return {
    ...trace,
    values: withheldInputEntries(trace.values, inputs),
    attempts: trace.attempts.map((attempt) => {
      const attemptInputs = withheldInputEntries(attempt.inputs, inputs);
      return attemptInputs === attempt.inputs ? attempt : { ...attempt, inputs: attemptInputs };
    })
  };
}

function withheldInputEntries(entries: Record<string, JsonValue>, inputs: Record<string, JsonValue>): Record<string, JsonValue> {
  let withheld: Record<string, JsonValue> | undefined;
  for (const [key, supplied] of Object.entries(inputs)) {
    if (entries[key] !== supplied) continue;
    withheld ??= { ...entries };
    withheld[key] = withheldInputValue(supplied, 0);
  }
  return withheld ?? entries;
}

/** Every string and number in a supplied value, replaced in place. Booleans and null carry no credential and stay, as in the value-based rewrite. */
function withheldInputValue(value: JsonValue, depth: number): JsonValue {
  if (typeof value === "string") return value ? AUTOMATION_STUDIO_WITHHELD_VALUE : value;
  if (typeof value === "number") return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (!value || typeof value !== "object") return value;
  if (depth >= MAXIMUM_INPUT_DEPTH) return AUTOMATION_STUDIO_WITHHELD_VALUE;
  if (Array.isArray(value)) return value.map((item) => withheldInputValue(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withheldInputValue(item, depth + 1)]));
}

async function executeAutomationStudioGraph(
  flow: AutomationStudioFlowDocument,
  options: AutomationStudioGraphExecutionOptions,
  withholding: AutomationStudioTraceWithholding
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
  const startChoice = options.startNodeId ? undefined : chooseAutomationStudioStartNode(flow);
  let currentNode = options.startNodeId ? nodesById.get(options.startNodeId) : startChoice?.node;
  if (!currentNode) {
    return {
      status: "failed",
      startedAt,
      finishedAt: now(),
      attempts,
      values,
      effects,
      message: startChoice?.message ?? "No start node is available in this flow."
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
      ? await executeAutomationStudioNode(flow, currentNode, values, options, attempts.length + 1, withholding)
      : await executeWithRegionTimeout(
        (signal) => executeAutomationStudioNode(flow, currentNode!, values, { ...options, signal }, attempts.length + 1, withholding),
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
