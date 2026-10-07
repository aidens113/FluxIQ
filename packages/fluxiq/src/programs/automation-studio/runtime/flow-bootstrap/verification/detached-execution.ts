import { isDeepStrictEqual } from "node:util";
import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../composite-executor.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioRouterStatePaths, routeAutomationStudioRun } from "../../route-state/index.ts";
import type { AutomationStudioRouterExecutionResult } from "../../router-runtime.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../adaptation.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioCandidateExecutionReceipt, AutomationStudioCandidateStartReceipt, AutomationStudioCandidateVerificationIdentity } from "./contracts.ts";

/**
 * Runs only a trusted owner's submitted topology; never reads or changes accepted graphs.
 * `graph` is the selected graph that ran, never stored, so a caller can say what each of its steps did.
 */
export async function runAutomationStudioDetachedCandidate(input: {
  identity: AutomationStudioCandidateVerificationIdentity;
  candidate: { revision: number; digest: string; baseDependencyDigest: string; buildPlan: AutomationStudioFlowBuildPlan };
  parentFlow: AutomationStudioFlowArtifact;
  currentIdentity(): Promise<AutomationStudioCandidateVerificationIdentity | null>;
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  snapshots: AutomationStudioPublishedFlowSnapshot[];
  deprecatedPublicationIds?: string[];
  sourceInstructionIds: string[];
  runId: string;
  start: AutomationStudioCandidateStartReceipt;
  options?: AutomationStudioGraphExecutionOptions;
  signal?: AbortSignal;
}): Promise<{ receipt: AutomationStudioCandidateExecutionReceipt; code?: string; trace?: AutomationStudioGraphExecutionTrace; route?: AutomationStudioRouterExecutionResult; graph?: AutomationStudioFlowArtifact }> {
  // Clone owner-controlled artifacts before the first await; a mutable builder cannot swap graphs during routing.
  const identity = structuredClone(input.identity), candidate = structuredClone(input.candidate), parent = structuredClone(input.parentFlow);
  const snapshots = structuredClone(input.snapshots), start = structuredClone(input.start), options = { ...input.options };
  if (options.inputs) options.inputs = structuredClone(options.inputs);
  const signal = input.signal ?? options.signal, now = options.now ?? Date.now, startedAt = now();
  let returnedTrace: AutomationStudioGraphExecutionTrace | undefined, returnedRoute: AutomationStudioRouterExecutionResult | undefined, returnedGraph: AutomationStudioFlowArtifact | undefined;
  const receipt = (status: AutomationStudioCandidateExecutionReceipt["status"], trace?: AutomationStudioGraphExecutionTrace): AutomationStudioCandidateExecutionReceipt => ({
    identity, runId: input.runId, startReceiptId: start.receiptId, startedAt, finishedAt: Math.max(startedAt, now()), status,
    executedNodeCount: trace?.attempts.length ?? 0,
    // A succeeded attempt is not a durable command acknowledgement. Subject attribution is unbound here.
    commands: []
  });
  const refused = (code: string) => ({ receipt: receipt(signal?.aborted ? "cancelled" : "not_run"), code });
  const fresh = async () => !signal?.aborted && isDeepStrictEqual(await input.currentIdentity(), identity);
  if (signal?.aborted) return refused("candidate.execution_cancelled");
  if (input.signal && options.signal && input.signal !== options.signal) return refused("candidate.conflicting_execution_signal");
  if (parent.projectId !== identity.projectId || parent.flowId !== identity.flowId || !isDeepStrictEqual(parent.scope, input.resolution.scope)
    || candidate.revision !== identity.revision || candidate.digest !== identity.digest || candidate.baseDependencyDigest !== identity.baseDependencyDigest) return refused("candidate.execution_identity_mismatch");
  if (!input.runId || !start.receiptId || !Number.isFinite(start.preparedAt) || start.preparedAt > startedAt) return refused("candidate.invalid_execution_start");
  if (options.startNodeId !== undefined || options.stopAfterNodeId !== undefined || options.priorAttemptCount !== undefined || options.compositeExecutor !== undefined) return refused("candidate.partial_execution_unsupported");
  try {
    if (!await fresh()) return refused("candidate.execution_stale");
    const validation = validateAutomationStudioFlowBootstrapPlan({ plan: candidate.buildPlan.plan, resolution: input.resolution, ...(input.registry ? { registry: input.registry } : {}) });
    if (!validation.ok || !validation.validated) return refused("candidate.execution_plan_invalid");
    // The submission compiler owns corrections. Revalidation must not silently execute a corrected replacement.
    if (!isDeepStrictEqual(validation.validated.plan, candidate.buildPlan.plan) || !isDeepStrictEqual(validation.validated.subflows, candidate.buildPlan.subflows)) return refused("candidate.execution_plan_rewritten");
    const topology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: `candidate.${identity.projectId}.${identity.flowId}.${identity.revision}.${identity.digest}`,
      parentFlow: parent, buildPlan: candidate.buildPlan, sourceInstructionIds: [...input.sourceInstructionIds], now: startedAt
    });
    const route = await routeAutomationStudioRun({ projectId: identity.projectId, flowId: identity.flowId, router: topology.router,
      subflows: topology.subflows.map((entry) => entry.subflow), ...(options.inputs ? { inputs: options.inputs } : {}), callerState: {}, hostRuntime: options.hostRuntime, ...(signal ? { signal } : {}), now });
    returnedRoute = route;
    if (!await fresh()) return { ...refused("candidate.execution_stale"), route };
    if (automationStudioRouterStatePaths(topology.router).length && (route.decision.metadata?.routeState as { observed?: boolean } | undefined)?.observed !== true) return { ...refused("candidate.routing_state_unavailable"), route };
    const selected = topology.subflows.find((entry) => entry.subflow.subflowId === route.selectedSubflow?.subflowId);
    if (route.status !== "running" || !selected) return { ...refused("candidate.execution_no_route"), route };
    const graph = selected.graphFlow;
    if (graph.projectId !== identity.projectId || selected.subflow.flowId !== identity.flowId || selected.subflow.projectId !== identity.projectId
      || graph.flowId !== selected.subflow.graphFlowId || graph.metadata?.parentFlowId !== identity.flowId
      || graph.metadata?.parentSubflowId !== selected.subflow.subflowId || graph.metadata?.subflowGraph !== true) return { ...refused("candidate.execution_graph_not_owned"), route };
    if (parent.executionDefaults) graph.executionDefaults = structuredClone(parent.executionDefaults);
    returnedGraph = structuredClone(graph);
    const trace = await runCanonicalAutomationStudioFlow(graph, snapshots, { ...options, ...(signal ? { signal } : {}), currentSubflowId: selected.subflow.subflowId,
      allowLlmDiagnosis: false, approvedRuntimePatchNodeIds: [], retryPolicy: { maxAttempts: 1, backoffMs: [] },
      recoveryBudget: { maxRetriesPerAction: 0, maxRecoveryAttemptsPerSubflow: 0, maxReroutesPerRun: 0, maxAdaptationOrLlmAttemptsPerRun: 0 }
    }, input.deprecatedPublicationIds ?? []);
    returnedTrace = trace;
    const stillFresh = await fresh();
    const status = signal?.aborted || trace.status === "cancelled" ? "cancelled"
      : stillFresh && trace.status === "succeeded" && !trace.stopReason && trace.attempts.length > 0 ? "succeeded" : "failed";
    return { receipt: receipt(status, trace), trace, route, graph: returnedGraph, ...(status === "succeeded" ? {} : { code: signal?.aborted ? "candidate.execution_cancelled" : !stillFresh ? "candidate.execution_stale" : "candidate.execution_incomplete" }) };
  } catch {
    // Native failures can contain private command/page data. Keep them out of the diagnostic code.
    return { receipt: receipt(signal?.aborted ? "cancelled" : "failed", returnedTrace), code: signal?.aborted ? "candidate.execution_cancelled" : "candidate.execution_error",
      ...(returnedTrace ? { trace: returnedTrace } : {}), ...(returnedRoute ? { route: returnedRoute } : {}), ...(returnedTrace && returnedGraph ? { graph: returnedGraph } : {}) };
  }
}
