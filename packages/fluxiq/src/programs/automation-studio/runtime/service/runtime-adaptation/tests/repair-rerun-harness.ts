// The re-run harness `repair-rerun.test.ts` and `held-candidate.test.ts` share:
// a refuted first pass of a small Flow, the ports a re-run is lent, and what
// each port was asked to write. Live run `run-munv53gt-a0e6f545`, shrunk.

import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowAdaptation, type AutomationStudioFlowArtifact, type AutomationStudioFlowDocument, type AutomationStudioFlowRunDetail, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import { runtimeSessionToFlowRunDetail } from "../../summaries/index.ts";
import { recoveryBudgetFromRuntimeAdaptationContext } from "../context.ts";
import { rerunAutomationStudioSessionAfterRepair } from "../repair-rerun.ts";
import { resolveAutomationStudioRuntimeAdaptationContext } from "../resolve-context.ts";

export const PROJECT_ID = "project.rerun";

export const flow: AutomationStudioFlowArtifact = {
  ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.rerun", projectId: PROJECT_ID, name: "Re-authored", now: 1 }),
  nodes: [
    { id: "search", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "search" } } },
    { id: "check", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "soft-check" } } },
    { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
    { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "results" } } }
  ],
  edges: [
    { id: "search.check", sourceNodeId: "search", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
    { id: "check.failed", sourceNodeId: "check", sourcePortId: "failed", targetNodeId: "join", targetPortId: "in" },
    { id: "check.success", sourceNodeId: "check", sourcePortId: "success", targetNodeId: "join", targetPortId: "branches" },
    { id: "join.read", sourceNodeId: "join", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }
  ]
};

/** The Flow as the run executes it. */
const flowDocument: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: flow.flowId, ownerKind: "routine", ownerId: flow.flowId, name: flow.name, createdAt: 1, updatedAt: 1, nodes: flow.nodes, edges: flow.edges };

const succeeds: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = () => ({ status: "success", route: "success", outputs: { ok: true } });

/** The session has already passed the check, so its button is gone; the host reports that as it did live. */
const checkPassed: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => JSON.stringify(effect.payload ?? null).includes("soft-check")
  ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
  : { status: "success", route: "success", outputs: { ok: true } };

export async function adaptationContext() {
  return await resolveAutomationStudioRuntimeAdaptationContext({
    projectId: PROJECT_ID,
    flow,
    ports: {
      listFlowRunSummaries: async () => ({ runs: [] }),
      listFlowAdaptationSummaries: async () => ({ adaptations: [] }),
      getFlowAdaptation: async () => null,
      readResultCheckState: async () => null
    }
  });
}

async function refutedSession(): Promise<AutomationStudioRuntimeSession> {
  // Every step of the first pass succeeded; the answer was refuted afterwards.
  const firstPass = await runAutomationStudioGraph(flowDocument, { effectDispatcher: succeeds });
  return {
    schemaVersion: "0.1",
    runId: "run.rerun",
    projectId: PROJECT_ID,
    targetKind: "flow",
    targetId: flow.flowId,
    flowId: flow.flowId,
    status: "failed",
    queuedAt: 1,
    startedAt: 1,
    finishedAt: 2,
    flow: flowDocument,
    trace: { ...firstPass, status: "failed", message: "The result was judged not to answer the request." }
  };
}

/** The read itself fails on the re-run, so the repaired Flow ends failed. */
export const readFails: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => JSON.stringify(effect.payload ?? null).includes("results")
  ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
  : checkPassed(effect);

export async function rerun(options: {
  dispatcher?: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
  detailMetadata?: NonNullable<AutomationStudioFlowRunDetail["metadata"]>;
  sessionMetadata?: NonNullable<AutomationStudioRuntimeSession["metadata"]>;
  adaptations?: AutomationStudioFlowAdaptation[];
  from?: "start" | "resume";
  /** A re-run from the start follows a re-authored Flow unless told otherwise (t249: else it re-runs an untried ladder patch). */
  reauthored?: boolean;
  /** The run's re-author marker in place of the default applied one (t267: a held re-author). */
  reauthorMarker?: JsonObject;
  /** The held re-author's record, as the bootstrap store answers it. */
  bootstrap?: AutomationStudioBootstrapAdaptation | null;
  /** The Subflow this run selected, and the graph Flow it owns. */
  subflow?: { subflowId: string; graphFlowId: string };
} = {}) {
  const context = await adaptationContext();
  const first = await refutedSession();
  const session = options.sessionMetadata ? { ...first, metadata: { ...(first.metadata ?? {}), ...options.sessionMetadata } } : first;
  const firstDetail = runtimeSessionToFlowRunDetail(session, PROJECT_ID);
  const reauthorMarker = (options.from ?? "start") === "start" && options.reauthored !== false ? { resultReauthor: options.reauthorMarker ?? { routed: true, applied: true, adaptationId: "adaptation.bootstrap.1", attempt: 1, attempts: [] } } : {};
  const bootstrapApplied: Array<{ flowId: string; adaptationId: string; actorId: string }> = [];
  const written: AutomationStudioRuntimeSession[] = [];
  const saved: AutomationStudioFlowRunDetail[] = [];
  const savedAdaptations: AutomationStudioFlowAdaptation[] = [];
  const applied: string[] = [];
  // The stored Flow: a fresh copy each read, so a write onto it would show.
  const stored = structuredClone(flow);
  const result = await rerunAutomationStudioSessionAfterRepair({
    ports: {
      getFlowSubflow: async (_projectId, _flowId, subflowId) => options.subflow?.subflowId === subflowId ? { subflowId, graphFlowId: options.subflow.graphFlowId } as never : null,
      // A selected Subflow's graph is the stored Flow, owned by that Subflow.
      getFlow: async (_projectId, flowId) => options.subflow && flowId === options.subflow.graphFlowId
        ? { ...stored, flowId, metadata: { parentFlowId: flow.flowId, parentSubflowId: options.subflow.subflowId, subflowGraph: true } }
        : stored,
      assertOwnedSubflowGraph: async () => undefined,
      listPublishedFlowSnapshots: async () => [],
      deprecatedPublicationIds: async () => [],
      writeRuntimeSession: async (_projectId, next) => { written.push(next); },
      saveFlowRunDetail: async (detail) => { saved.push(detail); },
      getFlowAdaptation: async (_projectId, _flowId, adaptationId) => options.adaptations?.find((adaptation) => adaptation.adaptationId === adaptationId) ?? null,
      saveFlowAdaptation: async (adaptation) => { savedAdaptations.push(adaptation); return adaptation; },
      applyFlowAdaptation: async (request) => { applied.push(request.adaptationId); throw new Error("A re-run never applies a patch."); },
      getFlowBootstrapAdaptation: async () => options.bootstrap ?? null,
      applyFlowBootstrapAdaptation: async ({ flowId, adaptationId, actorId }) => { bootstrapApplied.push({ flowId, adaptationId, actorId }); }
    },
    projectId: PROJECT_ID,
    session,
    detail: { ...firstDetail, metadata: { ...(firstDetail.metadata ?? {}), ...reauthorMarker, ...(options.detailMetadata ?? {}) } },
    graphOptions: { effectDispatcher: options.dispatcher ?? checkPassed, delay: async () => undefined, recoveryBudget: recoveryBudgetFromRuntimeAdaptationContext(context) },
    adaptationContext: context,
    ...(options.subflow ? { subflowId: options.subflow.subflowId } : {}),
    from: options.from ?? "start"
  });
  return { context, session, result, written, saved, savedAdaptations, applied, stored, bootstrapApplied };
}
