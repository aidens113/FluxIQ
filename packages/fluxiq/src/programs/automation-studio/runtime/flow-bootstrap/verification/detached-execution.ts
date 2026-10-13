import { isDeepStrictEqual } from "node:util";
import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../composite-executor.ts";
import { automationStudioOptionalStepWayOn, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioRouterStatePaths, routeAutomationStudioRun } from "../../route-state/index.ts";
import type { AutomationStudioRouterExecutionResult } from "../../router-runtime.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../adaptation.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioCandidateExecutionReceipt, AutomationStudioCandidateStartReceipt, AutomationStudioCandidateVerificationIdentity } from "./contracts.ts";
import { automationStudioCandidateGraphSource } from "./candidate-graphs.ts";
import { automationStudioRootInvocation } from "../../executor/frames/index.ts";

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
}): Promise<{ receipt: AutomationStudioCandidateExecutionReceipt; code?: string; trace?: AutomationStudioGraphExecutionTrace; route?: AutomationStudioRouterExecutionResult; graph?: AutomationStudioFlowArtifact; candidateGraphs?: AutomationStudioFlowArtifact[] }> {
  // Clone owner-controlled artifacts before the first await; a mutable builder cannot swap graphs during routing.
  const identity = structuredClone(input.identity), candidate = structuredClone(input.candidate), parent = structuredClone(input.parentFlow);
  const snapshots = structuredClone(input.snapshots), start = structuredClone(input.start), options = { ...input.options };
  if (options.inputs) options.inputs = structuredClone(options.inputs);
  const signal = input.signal ?? options.signal, now = options.now ?? Date.now, startedAt = now();
  let returnedTrace: AutomationStudioGraphExecutionTrace | undefined, returnedRoute: AutomationStudioRouterExecutionResult | undefined, returnedGraph: AutomationStudioFlowArtifact | undefined;
  let candidateGraphs: AutomationStudioFlowArtifact[] | undefined;
  const receipt = (status: AutomationStudioCandidateExecutionReceipt["status"], trace?: AutomationStudioGraphExecutionTrace): AutomationStudioCandidateExecutionReceipt => ({
    identity, runId: input.runId, startReceiptId: start.receiptId, startedAt, finishedAt: Math.max(startedAt, now()), status,
    executedNodeCount: executedAttempts(trace),
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
  if (options.invocation !== undefined) return refused("candidate.foreign_invocation_unsupported");
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
    // Definitions for attributing invoked child evidence, never proof that every alternative graph ran.
    candidateGraphs = topology.subflows.map((entry) => structuredClone(entry.graphFlow));
    // No model, patch, reroute or subflow recovery: the candidate runs as
    // submitted. But each node keeps the retries every node gets (t355, the
    // user's rule of 2026-10-07): until then a trial ran each step once while
    // playback ran it three times, so lane A round 4's trial
    // (`run-muyrpbnk-fef374e7`) died on the page's first-press "Network busy"
    // that playback would have waited out. The retry policy is therefore left
    // to Core's default (`executor/retry-policy.ts`), with no override and no
    // `maxRetriesPerAction` of its own.
    //
    // The candidate's own failed routes are part of the candidate, so a trial
    // follows them as playback does (t368, F1). The executor takes an authored
    // failed route only while the recovery and reroute budgets last, and a
    // budget of zero withheld every one: lane A round 6's trial 3
    // (`run-muz2cj6p-80eb2179`) failed on an `optional: yes` wait that timed out,
    // although the optional shape's failed route led on into its Merge.
    //
    // An optional step's way on is now no recovery at all: the executor offers
    // it whatever the budgets say and spends none of them, in a trial and a
    // playback alike (`executor/step-skip/optional-step.ts`, t371). Each budget
    // is therefore the number of written `on failed:` branches the graph
    // declares, so each of those can be taken once and a real failure past them
    // still stops the trial; a graph that declares none keeps zero.
    const executionOptions: AutomationStudioGraphExecutionOptions = { ...options, ...(signal ? { signal } : {}), currentSubflowId: selected.subflow.subflowId,
      subflowGraphs: automationStudioCandidateGraphSource(topology, parent, fresh),
      allowLlmDiagnosis: false, approvedRuntimePatchNodeIds: [],
      recoveryBudget: candidateRecoveryBudget(graph)
    };
    // Each invoked graph gets only its own authored alternatives. A root with none must not fence off a helper's declared way on.
    executionOptions.invocation = automationStudioRootInvocation(graph, executionOptions, async (target, childOptions, onExecuted) => {
      const child = target.artifact;
      if (!child || !await fresh()) return { status: signal?.aborted ? "cancelled" : "failed", startedAt: now(), finishedAt: now(), attempts: [], values: {}, effects: [], message: "The detached candidate child graph was unavailable or stale." };
      return runCanonicalAutomationStudioFlow(child, snapshots, { ...childOptions, allowLlmDiagnosis: false, approvedRuntimePatchNodeIds: [], recoveryBudget: candidateRecoveryBudget(child) }, input.deprecatedPublicationIds ?? [], onExecuted);
    });
    const trace = await runCanonicalAutomationStudioFlow(graph, snapshots, executionOptions, input.deprecatedPublicationIds ?? []);
    returnedTrace = trace;
    const stillFresh = await fresh();
    const status = signal?.aborted || trace.status === "cancelled" ? "cancelled"
      : stillFresh && trace.status === "succeeded" && !trace.stopReason && trace.attempts.length > 0 ? "succeeded" : "failed";
    return { receipt: receipt(status, trace), trace, route, graph: returnedGraph, candidateGraphs, ...(status === "succeeded" ? {} : { code: signal?.aborted ? "candidate.execution_cancelled" : !stillFresh ? "candidate.execution_stale" : "candidate.execution_incomplete" }) };
  } catch {
    // Native failures can contain private command/page data. Keep them out of the diagnostic code.
    return { receipt: receipt(signal?.aborted ? "cancelled" : "failed", returnedTrace), code: signal?.aborted ? "candidate.execution_cancelled" : "candidate.execution_error",
      ...(returnedTrace ? { trace: returnedTrace } : {}), ...(returnedRoute ? { route: returnedRoute } : {}), ...(returnedTrace && returnedGraph ? { graph: returnedGraph, ...(candidateGraphs ? { candidateGraphs } : {}) } : {}) };
  }
}

/** Bound recovery to the invoked graph's explicit failed routes, with no model or patch allowance. */
function candidateRecoveryBudget(graph: AutomationStudioFlowArtifact) {
  const authoredRoutes = authoredFailedRoutes(graph);
  return { maxRecoveryAttemptsPerSubflow: authoredRoutes, maxReroutesPerRun: authoredRoutes, maxAdaptationOrLlmAttemptsPerRun: 0 };
}

/** Each executed candidate node attempt, including called frames; no unselected graph is counted. */
function executedAttempts(trace: AutomationStudioGraphExecutionTrace | undefined): number {
  return (trace?.attempts ?? []).reduce((count, attempt) => count + 1 + (attempt.subflowTarget ? executedAttempts(attempt.childTrace) : 0), 0);
}

/** How many written `on failed:` branches the graph's steps declare: every `failed` way out but an optional step's way on, which spends no budget. */
function authoredFailedRoutes(graph: AutomationStudioFlowArtifact): number {
  const optionalWayOns = new Set(graph.nodes.map((node) => automationStudioOptionalStepWayOn(graph, node)?.id).filter((id) => id !== undefined));
  return graph.edges.filter((edge) => edge.sourcePortId === "failed" && !optionalWayOns.has(edge.id)).length;
}
