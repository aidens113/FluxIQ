// One subflow run from one of its steps (t804; the rule "build the whole Flow
// first; test it whole only when it should work"): a repair is checked by
// running the repaired subflow from the step that failed, on the page as it
// stands. Explicitly partial, as `./detached-subflow.ts` is, and it never
// loosens `./detached-execution.ts`'s refusal of a caller's `startNodeId`: the
// start is a plan key, resolved there in the graph about to run
// (`./from-node.ts`).
//
// **The target always runs as the root frame.** The executor honours a start
// node only in a root graph; a Call Subflow child never receives one
// (`../../composite-execution/boundary.ts`). So the target's proposal is the
// throwaway topology's only primary and the router's fallback, its `part`
// helpers beside it, exactly as `./detached-subflow.ts` runs a target with no
// interface. A callable target is run the same way, its own interface taken
// off: a primary takes the Flow's interface (`../adaptation.ts`), and the
// steps from the start must read no interface input without a value, which
// the caller checks before it asks (`service/subflow-trial/from-step-binding.ts`).
//
// **Nothing runs first.** No predecessors, no arrival, no On Start: the run
// starts at the named step on the tab as it is. Every check the
// whole-candidate runner makes is this entry's too, by construction: identity
// and freshness, plan validation and normalization, the candidate graph
// source, the root invocation and each graph's own failed-route budget.

import { isDeepStrictEqual } from "node:util";
import { automationStudioReferenceNow } from "../../reference-now/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioDetachedSubflowCandidateIdentity, type AutomationStudioDetachedSubflowInput, type AutomationStudioDetachedSubflowProposal, type AutomationStudioDetachedSubflowResult } from "./detached-subflow.ts";

/** A from-step run's input: a partial trial's, with no predecessors or arrival, and the plan key of the target's step it starts at. */
export type AutomationStudioDetachedSubflowFromInput = Omit<AutomationStudioDetachedSubflowInput, "predecessors" | "arrival"> & { fromKey: string };

/** Runs the target's proposal from the step `fromKey` names, as a root frame, with nothing before it (header). */
export async function runAutomationStudioDetachedSubflowFrom(input: AutomationStudioDetachedSubflowFromInput): Promise<AutomationStudioDetachedSubflowResult> {
  const identity = structuredClone(input.identity);
  const target = structuredClone(input.target);
  const signal = input.signal ?? input.options?.signal;
  const now = input.options?.now ?? Date.now;
  const startedAt = now();
  const { referenceNow: suppliedReferenceNow, ...baseOptions } = input.options ?? {};
  const referenceNow = automationStudioReferenceNow(suppliedReferenceNow) ?? automationStudioReferenceNow(startedAt);
  const options = { ...baseOptions, ...(referenceNow !== undefined ? { referenceNow } : {}) };
  const candidateIdentity = automationStudioDetachedSubflowCandidateIdentity(identity);
  const refused = (code: string, planIssues?: string[]): AutomationStudioDetachedSubflowResult => ({
    partial: true,
    receipt: { identity: candidateIdentity, runId: input.runId, startReceiptId: input.start.receiptId, startedAt, finishedAt: Math.max(startedAt, now()), status: signal?.aborted ? "cancelled" : "not_run", executedNodeCount: 0, commands: [] },
    code,
    entryPrepared: false,
    ...(planIssues?.length ? { planIssues } : {})
  });
  if (signal?.aborted) return refused("candidate.execution_cancelled");
  const ref = identity.target;
  if (identity.predecessors.length || target.subflowKey !== ref.subflowKey || target.revision !== ref.revision || target.digest !== ref.digest || target.subflows[0]?.key !== target.subflowKey) return refused("subflow.execution_identity_mismatch");
  const current = await input.currentIdentity();
  if (signal?.aborted) return refused("candidate.execution_cancelled");
  if (!isDeepStrictEqual(current, identity)) return refused("candidate.execution_stale");
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan: rootPlan(target), resolution: input.resolution, ...(input.registry ? { registry: input.registry } : {}) });
  if (!validation.ok || !validation.validated) return refused("candidate.execution_plan_invalid", [...new Set(validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code))]);
  // Loaded when a run starts, as `./detached-subflow.ts` loads it: the whole-candidate runner sits in a module cycle through `../index.ts`.
  const { runAutomationStudioDetachedCandidate: runWhole } = await import("./detached-execution.ts");
  const ran = await runWhole({
    identity: candidateIdentity,
    candidate: { revision: candidateIdentity.revision, digest: candidateIdentity.digest, baseDependencyDigest: candidateIdentity.baseDependencyDigest, buildPlan: validation.validated },
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
    options,
    ...(input.signal ? { signal: input.signal } : {}),
    fromNodeKey: input.fromKey
  });
  return {
    partial: true,
    receipt: ran.receipt,
    ...(ran.code ? { code: ran.code } : {}),
    // Nothing prepares a from-step run's entry: it began once its root frame did.
    entryPrepared: ran.trace !== undefined,
    ...(ran.trace ? { trace: ran.trace } : {}),
    ...(ran.route ? { route: ran.route } : {}),
    ...(ran.graph ? { graph: ran.graph } : {}),
    ...(ran.candidateGraphs ? { candidateGraphs: ran.candidateGraphs } : {})
  };
}

/** The target as the root frame (header): the only primary, its interface taken off, the router's fallback; its parts beside it as they are. */
function rootPlan(target: AutomationStudioDetachedSubflowProposal): AutomationStudioFlowBootstrapPlan {
  const subflows = target.subflows.map((subflow, index) => {
    if (index > 0) return subflow.role === "primary" ? { ...subflow, role: "utility" as const } : subflow;
    const { interface: _interface, ...own } = subflow;
    return { ...own, role: "primary" as const };
  });
  return { schemaVersion: "0.1", router: { name: "Subflow from a step", rules: [], fallback: { kind: "subflow", targetSubflowKey: target.subflowKey } }, subflows };
}
