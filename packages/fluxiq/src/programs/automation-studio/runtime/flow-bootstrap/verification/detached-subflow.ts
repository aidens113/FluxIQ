// One subflow of a structure plan run on its own, from the entry its
// predecessors prepare (automation-project-agents-plan.md, `Subflow trial`;
// unit A4b). Explicitly partial: `./detached-execution.ts` keeps refusing a
// partial run of a whole candidate, and this entry never loosens it.
//
// **A throwaway root of Call Subflow steps.** For a callable target (one
// with an interface), the predecessors' latest
// proposals and the target's proposal are composed into one small topology
// whose primary Subflow is a root of Call Subflow steps -- each predecessor in
// order, then the target -- and that topology is handed, whole, to
// `runAutomationStudioDetachedCandidate`. So every check that runner makes is
// this entry's too, by construction rather than by copy: the identity and
// freshness checks (re-read at every child load), plan validation and
// normalization, the t529 candidate graph source (no accepted-graph or caller
// fallback), the root invocation, and each invoked graph's own failed-route
// budget. Each part runs across the C1 Call Subflow boundary, so its
// interface inputs cross typed and its own success check is judged when its
// frame ends, as a call inside a whole candidate would be.
//
// Interface inputs are read from outputs: each input a part declares is bound
// to the latest earlier part that declares an output of the same id. A
// required input no earlier part produces refuses the trial before anything
// runs. The root chains its calls on `success`, so a failed predecessor ends
// the run there: the target does not run and `entryPrepared` is false.
//
// Roles: a `primary` Subflow takes the Flow's interface rather than its own
// (`../adaptation.ts`), so in the throwaway topology every proposal Subflow
// that the plan made `primary` is called as a `utility`, keeping its own
// interface and success check. Nothing here is stored or applied.
//
// **A target with no interface is a Subflow the router runs** (supervisor
// decision with t537, 2026-10-13): it runs as a root frame, never across a
// call boundary. Its predecessors' calls then run first, as a throwaway root
// of their own; only when every one succeeded does a second detached run of a
// topology whose primary is the target begin, with the run's own inputs. The
// two runs answer as one -- one receipt, one trace in run order, one graph --
// so the trial's steps and acts read across both. A predecessor with no
// interface is still called (its interface then empty): it prepares the
// entry and hands nothing on.
//
// **The run starts on a loaded start page** (t578; A8 bigbox debug, cause A).
// Given `arrival` -- the domain's arrival node (`runsNodes.arrival`) and the
// build's start location -- the first root's first step after its start goes
// there, before any call, so the trial starts on a page loaded after the
// deployment's start hook rather than on the page a builder left. A router-run
// target with no predecessors then still gets a first root, holding only the
// arrival. The arrival declares no lasting consequence (`[]`): it only loads a
// page. An arrival node the registry does not offer refuses the trial
// (`subflow.execution_arrival_unavailable`) before anything runs. Without
// `arrival` the root is as it was, and the run starts where the tab stands.
// The step is the one every phase of a project build arrives by, the
// assembled Flow's first step included (`./arrival-node.ts`, t593).

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../../../model/index.ts";
import { automationNodeStateBinding, type AutomationStudioNodeRegistry, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioRouterExecutionResult } from "../../router-runtime.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSubflow,
  type AutomationStudioFlowBuildPlan
} from "../plan/index.ts";
import { automationStudioArrivalPlanNode } from "./arrival-node.ts";
import type { AutomationStudioCandidateExecutionReceipt, AutomationStudioCandidateStartReceipt, AutomationStudioCandidateVerificationIdentity } from "./contracts.ts";
import type { runAutomationStudioDetachedCandidate } from "./detached-execution.ts";

/** The key of the throwaway root; a proposal Subflow of the same key refuses the trial as a duplicate. */
const ROOT_KEY = "subflow-trial-root";
const START_ID = "builtin.control.start";

/** One proposal's place in the trial: the Subflow it proposes (first) and the `part` helpers it owns, under its revision and digest. */
export type AutomationStudioDetachedSubflowProposal = {
  subflowKey: string;
  revision: number;
  digest: string;
  subflows: readonly AutomationStudioFlowBootstrapSubflow[];
};

/** A proposal as a trial is bound to it: no bytes, only which revision of which Subflow. */
export type AutomationStudioDetachedSubflowRef = { subflowKey: string; revision: number; digest: string };

/**
 * What a partial trial is bound to. Re-read through `currentIdentity` before
 * anything runs and at every child load; any change (a new proposal of the
 * target or a predecessor, an amended plan, a moved base) stops the run.
 */
export type AutomationStudioDetachedSubflowIdentity = {
  projectId: string;
  flowId: string;
  buildId: string;
  briefId: string;
  planDigest: string;
  baseDependencyDigest: string;
  target: AutomationStudioDetachedSubflowRef;
  predecessors: readonly AutomationStudioDetachedSubflowRef[];
};

export type AutomationStudioDetachedSubflowInput = {
  identity: AutomationStudioDetachedSubflowIdentity;
  target: AutomationStudioDetachedSubflowProposal;
  /** In the order they run; each must be the proposal `identity.predecessors` names at the same place. */
  predecessors: readonly AutomationStudioDetachedSubflowProposal[];
  currentIdentity(): Promise<AutomationStudioDetachedSubflowIdentity | null>;
  parentFlow: AutomationStudioFlowArtifact;
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  snapshots: AutomationStudioPublishedFlowSnapshot[];
  deprecatedPublicationIds?: string[];
  sourceInstructionIds: string[];
  runId: string;
  start: AutomationStudioCandidateStartReceipt;
  options?: AutomationStudioGraphExecutionOptions;
  signal?: AbortSignal;
  /**
   * Where the run goes first (header, t578): the domain's arrival node and its
   * location parameter (`runsNodes.arrival`), with the build's start location.
   * Absent, the run starts on the page as it stands.
   */
  arrival?: AutomationStudioDetachedSubflowArrival | undefined;
};

/** The arrival step a partial trial opens with (header): the domain's node, the parameter it takes a location under, and the location. */
export type AutomationStudioDetachedSubflowArrival = { node: string; parameter: string; location: string };

/**
 * A partial run's answer. `graph` is the throwaway root that ran and
 * `candidateGraphs` every graph of the composed topology, so a caller can say
 * what each step did; neither is stored.
 */
export type AutomationStudioDetachedSubflowResult = {
  partial: true;
  receipt: AutomationStudioCandidateExecutionReceipt;
  code?: string;
  /** Every predecessor ran to its end, so the target started from its prepared entry. */
  entryPrepared: boolean;
  /** The predecessor whose call failed, by Subflow key; the target did not run. */
  failedPredecessor?: string;
  /** Validation's issue codes when the composed topology was refused (a call outside it, a duplicate key). */
  planIssues?: string[];
  trace?: AutomationStudioGraphExecutionTrace;
  route?: AutomationStudioRouterExecutionResult;
  graph?: AutomationStudioFlowArtifact;
  candidateGraphs?: AutomationStudioFlowArtifact[];
};

/** Runs the predecessors' proposals, then the target's, as one detached partial trial (header). */
export async function runAutomationStudioDetachedSubflow(input: AutomationStudioDetachedSubflowInput): Promise<AutomationStudioDetachedSubflowResult> {
  // Clone owner-controlled values before the first await, as the whole-candidate runner does.
  const identity = structuredClone(input.identity);
  const target = structuredClone(input.target);
  const predecessors = structuredClone(input.predecessors);
  const signal = input.signal ?? input.options?.signal;
  const now = input.options?.now ?? Date.now;
  const startedAt = now();
  const candidateIdentity = automationStudioDetachedSubflowCandidateIdentity(identity);
  const refused = (code: string, extra: Pick<AutomationStudioDetachedSubflowResult, "planIssues"> = {}): AutomationStudioDetachedSubflowResult => ({
    partial: true,
    receipt: { identity: candidateIdentity, runId: input.runId, startReceiptId: input.start.receiptId, startedAt, finishedAt: Math.max(startedAt, now()), status: signal?.aborted ? "cancelled" : "not_run", executedNodeCount: 0, commands: [] },
    code,
    entryPrepared: false,
    ...extra
  });
  if (signal?.aborted) return refused("candidate.execution_cancelled");
  if (!boundTo(identity, target, predecessors)) return refused("subflow.execution_identity_mismatch");
  const current = await input.currentIdentity();
  if (signal?.aborted) return refused("candidate.execution_cancelled");
  if (!isDeepStrictEqual(current, identity)) return refused("candidate.execution_stale");
  // A target with an interface is a callable part: it is called after its
  // predecessors, across the boundary. One without is a Subflow the router
  // runs: it runs as the root frame of a run of its own, after a run of its
  // predecessors' calls (header).
  const routerRun = target.subflows[0]!.interface === undefined;
  const called = routerRun ? predecessors : [...predecessors, target];
  const arrival = input.arrival ? automationStudioArrivalPlanNode(input.arrival, input.registry, input.resolution) : undefined;
  if (arrival === null) return refused("subflow.execution_arrival_unavailable");
  // With an arrival the first root always runs: it loads the start page before anything else (header, t578).
  const calls = called.length || arrival ? composedPlan(called, arrival) : undefined;
  if (calls && "unbound" in calls) return refused("subflow.execution_input_unbound");
  const plans = [...(calls ? [calls.plan] : []), ...(routerRun ? [rootPlan(target)] : [])];
  const validated: AutomationStudioFlowBuildPlan[] = [];
  for (const plan of plans) {
    const validation = validateAutomationStudioFlowBootstrapPlan({ plan, resolution: input.resolution, ...(input.registry ? { registry: input.registry } : {}) });
    if (!validation.ok || !validation.validated) {
      return refused("candidate.execution_plan_invalid", { planIssues: [...new Set(validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code))] });
    }
    validated.push(validation.validated);
  }
  // Loaded when a trial runs, not when this module loads: the whole-candidate
  // runner sits in a module cycle through `../index.ts` (route state reads the
  // Flow Bootstrap barrel), and a static import would pull this module into it.
  const { runAutomationStudioDetachedCandidate: runWhole } = await import("./detached-execution.ts");
  const run = (buildPlan: AutomationStudioFlowBuildPlan) => runWhole({
    identity: candidateIdentity,
    candidate: { revision: candidateIdentity.revision, digest: candidateIdentity.digest, baseDependencyDigest: candidateIdentity.baseDependencyDigest, buildPlan },
    parentFlow: input.parentFlow,
    currentIdentity: async () => {
      const latest = await input.currentIdentity();
      return latest ? automationStudioDetachedSubflowCandidateIdentity(latest) : null;
    },
    ...(input.registry ? { registry: input.registry } : {}),
    resolution: input.resolution,
    snapshots: input.snapshots,
    ...(input.deprecatedPublicationIds ? { deprecatedPublicationIds: input.deprecatedPublicationIds } : {}),
    sourceInstructionIds: input.sourceInstructionIds,
    runId: input.runId,
    start: input.start,
    ...(input.options ? { options: input.options } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  });
  const keys = predecessors.map((predecessor) => predecessor.subflowKey);
  if (!routerRun) {
    const ran = await run(validated[0]!);
    const entry = preparedEntry(ran.trace, ran.candidateGraphs, keys, target.subflowKey);
    return answered(ran, entry);
  }
  let before: Ran | undefined;
  if (calls) {
    before = await run(validated[0]!);
    const entry = preparedEntry(before.trace, before.candidateGraphs, keys);
    if (before.receipt.status !== "succeeded" || !entry.prepared) return answered(before, { prepared: false, ...(entry.failed ? { failed: entry.failed } : {}) });
  }
  const after = await run(validated.at(-1)!);
  // The target started from its prepared entry once its own root frame began.
  return answered(before ? joined(before, after) : after, { prepared: after.trace !== undefined });
}

type Ran = Awaited<ReturnType<typeof runAutomationStudioDetachedCandidate>>;

/** A whole-runner answer as the partial trial's. */
function answered(ran: Ran, entry: { prepared: boolean; failed?: string }): AutomationStudioDetachedSubflowResult {
  return {
    partial: true,
    receipt: ran.receipt,
    ...(ran.code ? { code: ran.code } : {}),
    entryPrepared: entry.prepared,
    ...(entry.failed ? { failedPredecessor: entry.failed } : {}),
    ...(ran.trace ? { trace: ran.trace } : {}),
    ...(ran.route ? { route: ran.route } : {}),
    ...(ran.graph ? { graph: ran.graph } : {}),
    ...(ran.candidateGraphs ? { candidateGraphs: ran.candidateGraphs } : {})
  };
}

/**
 * A router-run target's two runs as one: the predecessors' calls, then the
 * target's root frame, under one receipt, one trace in the order they ran and
 * one graph holding both roots' steps, so the trial's steps and landed acts
 * are numbered and read across both. Node ids never collide: each root and
 * each part has its own key.
 */
function joined(before: Ran, after: Ran): Ran {
  const trace = before.trace && after.trace
    ? { ...after.trace, startedAt: before.trace.startedAt, attempts: [...before.trace.attempts, ...after.trace.attempts], effects: [...before.trace.effects, ...after.trace.effects] }
    : after.trace ?? before.trace;
  const graph = before.graph && after.graph
    ? { ...after.graph, nodes: [...before.graph.nodes, ...after.graph.nodes], edges: [...before.graph.edges, ...after.graph.edges] }
    : after.graph ?? before.graph;
  const graphs = [...(before.candidateGraphs ?? []), ...(after.candidateGraphs ?? [])];
  const candidateGraphs = graphs.filter((graph, index) => graphs.findIndex((other) => other.flowId === graph.flowId) === index);
  return {
    receipt: { ...after.receipt, startedAt: before.receipt.startedAt, executedNodeCount: before.receipt.executedNodeCount + after.receipt.executedNodeCount },
    ...(after.code ? { code: after.code } : {}),
    ...(trace ? { trace } : {}),
    ...(after.route ? { route: after.route } : {}),
    ...(graph ? { graph } : {}),
    ...(candidateGraphs.length ? { candidateGraphs } : {})
  };
}

/** A router-run target as the root frame: its Subflow the topology's only primary and the router's fallback, its parts called from it. */
function rootPlan(target: AutomationStudioDetachedSubflowProposal): AutomationStudioFlowBootstrapPlan {
  const subflows = target.subflows.map((subflow, index) => index === 0 ? { ...subflow, role: "primary" as const } : subflow.role === "primary" ? { ...subflow, role: "utility" as const } : subflow);
  return { schemaVersion: "0.1", router: { name: "Subflow trial", rules: [], fallback: { kind: "subflow", targetSubflowKey: target.subflowKey } }, subflows };
}


/**
 * The whole-candidate identity the detached runner compares: the partial
 * trial's binding hashed into its digest, the plan digest in the requirements
 * slot. Two trials of different briefs, targets or predecessor revisions never
 * share one.
 */
export function automationStudioDetachedSubflowCandidateIdentity(identity: AutomationStudioDetachedSubflowIdentity): AutomationStudioCandidateVerificationIdentity {
  const binding = [
    "subflow-trial.v1",
    identity.buildId,
    identity.briefId,
    identity.planDigest,
    [identity.target.subflowKey, identity.target.revision, identity.target.digest],
    identity.predecessors.map((ref) => [ref.subflowKey, ref.revision, ref.digest])
  ];
  return {
    projectId: identity.projectId,
    flowId: identity.flowId,
    revision: identity.target.revision,
    digest: createHash("sha256").update(JSON.stringify(binding)).digest("hex"),
    baseDependencyDigest: identity.baseDependencyDigest,
    requirementsDigest: identity.planDigest
  };
}

/** The proposals are the ones the identity names, each heading its own Subflows, the target named once. */
function boundTo(identity: AutomationStudioDetachedSubflowIdentity, target: AutomationStudioDetachedSubflowProposal, predecessors: readonly AutomationStudioDetachedSubflowProposal[]): boolean {
  const same = (proposal: AutomationStudioDetachedSubflowProposal, ref: AutomationStudioDetachedSubflowRef | undefined) => ref !== undefined
    && proposal.subflowKey === ref.subflowKey && proposal.revision === ref.revision && proposal.digest === ref.digest
    && proposal.subflows[0]?.key === proposal.subflowKey;
  const keys = [...predecessors.map((predecessor) => predecessor.subflowKey), target.subflowKey];
  return same(target, identity.target)
    && predecessors.length === identity.predecessors.length
    && predecessors.every((predecessor, index) => same(predecessor, identity.predecessors[index]))
    && new Set(keys).size === keys.length;
}

/** The throwaway topology: a root that first arrives when told to, then calls each proposal in order -- the predecessors, then a callable target -- with every proposal Subflow beside it (header). */
function composedPlan(proposals: readonly AutomationStudioDetachedSubflowProposal[], arrival?: AutomationStudioFlowBootstrapNode): { plan: AutomationStudioFlowBootstrapPlan } | { unbound: string } {
  const called = proposals.map((proposal) => proposal.subflows[0]!);
  /** Each output id produced so far, and the root value it is kept under. */
  const produced = new Map<string, string>();
  const calls: AutomationStudioFlowBootstrapNode[] = [];
  for (const [index, subflow] of called.entries()) {
    const inputs: Record<string, ReturnType<typeof automationNodeStateBinding>> = {};
    for (const port of subflow.interface?.inputs ?? []) {
      const kept = produced.get(port.id);
      if (kept !== undefined) inputs[port.id] = automationNodeStateBinding(kept);
      else if (port.required) return { unbound: `${subflow.key}.${port.id}` };
    }
    const outputs: Record<string, string> = {};
    for (const port of subflow.interface?.outputs ?? []) {
      const key = `call${index}_${port.id}`;
      outputs[port.id] = key;
      produced.set(port.id, key);
    }
    calls.push({
      key: `call${index}`,
      definitionId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow,
      definitionVersion: "1.0.0",
      parameters: { subflowId: subflow.key, inputs, outputs }
    });
  }
  const start: AutomationStudioFlowBootstrapNode = { key: "start", definitionId: START_ID, definitionVersion: "1.0.0" };
  const nodes = [start, ...(arrival ? [arrival] : []), ...calls];
  const root: AutomationStudioFlowBootstrapSubflow = {
    key: ROOT_KEY,
    name: "Subflow trial",
    role: "primary",
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ key: `next${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }))
  };
  const parts = proposals.flatMap((proposal) => proposal.subflows.map((subflow) => subflow.role === "primary" ? { ...subflow, role: "utility" as const } : subflow));
  return { plan: { schemaVersion: "0.1", router: { name: "Subflow trial", rules: [], fallback: { kind: "subflow", targetSubflowKey: ROOT_KEY } }, subflows: [root, ...parts] } };
}

/**
 * Whether every predecessor's call succeeded in the root's own trace and the
 * target's call then began, and the first predecessor that did not succeed. A
 * run that went stale or was cancelled between the last predecessor and the
 * target never started the target, so its entry is not answered as prepared.
 * Without a target key (a router-run target runs apart), every predecessor
 * succeeding is the prepared entry.
 * A part's graph is found by the symbolic key normalization stamps on it, so
 * its minted Subflow id is never guessed.
 */
function preparedEntry(trace: AutomationStudioGraphExecutionTrace | undefined, graphs: readonly AutomationStudioFlowArtifact[] | undefined, keys: readonly string[], targetKey?: string): { prepared: boolean; failed?: string } {
  if (!trace || !graphs) return { prepared: false };
  const callsOf = (key: string) => {
    const subflowId = graphs.find((graph) => graph.metadata?.bootstrapSymbolicKey === key)?.metadata?.parentSubflowId;
    return subflowId === undefined ? [] : trace.attempts.filter((attempt) => attempt.subflowTarget?.subflowId === subflowId);
  };
  for (const key of keys) {
    const calls = callsOf(key);
    if (!calls.some((attempt) => attempt.status === "succeeded")) return calls.length ? { prepared: false, failed: key } : { prepared: false };
  }
  return { prepared: targetKey === undefined || callsOf(targetKey).length > 0 };
}
