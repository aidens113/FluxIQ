import { automationStudioViewId } from "../views/view-registry";
import type { AutomationSelection } from "../shared/selection-contracts";

export function emptyPipelineArtifacts() {
  return {
    normalizationReviews: [],
    miningRuns: [],
    evidenceFacts: [],
    evidenceObservations: [],
    stateActionCorrelations: [],
    evidenceClaims: [],
    learnedTaskModels: [],
    policyProposals: [],
    recordingFlowProposals: [],
    replayResults: []
  };
}

export function recordingSummariesToRecordingStubs(summaries: any[]): any[] {
  return summaries.map((summary) => ({
    recordingId: summary.recordingId,
    ...(summary.taskId ? { taskId: summary.taskId } : {}),
    startedAt: summary.startedAt ?? 0,
    ...(summary.endedAt !== undefined ? { endedAt: summary.endedAt } : {}),
    environment: {
      id: summary.domainId ?? "environment.unspecified",
      label: summary.domainId ?? "Local Studio",
      kind: "summary",
      domainId: summary.domainId ?? null
    },
    sources: [],
    actionChannels: [],
    initialState: { timestamp: summary.startedAt ?? 0, namespaces: {} },
    timeline: [],
    notes: [],
    metadata: {
      summaryOnly: true,
      ...(summary.name ? { name: summary.name } : {}),
      eventCount: summary.eventCount ?? 0,
      actionCount: summary.actionCount ?? 0,
      stateSnapshotCount: summary.stateSnapshotCount ?? 0,
      proposalCount: summary.proposalCount ?? 0
    }
  }));
}

export function proposalSummariesToPolicyArtifacts(summaries: any[]): any[] {
  return summaries
    .filter((summary) => summary.kind === "policy" || summary.kind === "direct" || summary.kind === "llm_assisted")
    .map((summary) => ({
      proposalId: summary.proposalId,
      recordingId: summary.recordingId,
      status: summary.status === "approved" ? "approved" : "proposed",
      generatedAt: summary.generatedAt,
      metadata: {
        recordingId: summary.recordingId,
        summaryOnly: true,
        ...(summary.name ? { title: summary.name } : {}),
        ...(summary.mode ? { generationMode: summary.mode } : {})
      }
    }));
}

export function proposalSummariesToRecordingFlowArtifacts(summaries: any[]): any[] {
  return summaries
    .filter((summary) => summary.kind === "recording_flow")
    .map((summary) => ({
      proposalId: summary.proposalId,
      recordingId: summary.recordingId,
      status: summary.status === "generated" ? "proposed" : summary.status,
      generatedAt: summary.generatedAt,
      updatedAt: summary.updatedAt ?? summary.generatedAt,
      candidates: [],
      metadata: {
        summaryOnly: true,
        ...(summary.name ? { title: summary.name } : {})
      }
    }));
}

export function automationStudioFlowNeedsDetail(flow: any | null, activeViewId: string, selectionKind: AutomationSelection["kind"] | undefined): boolean {
  return Boolean(flow?.flowId && flow?.metadata?.summaryOnly === true && (activeViewId === automationStudioViewId.flowEditor || selectionKind === "flow"));
}

export function automationStudioGatewayActivitySnapshot(value: any): { sessions: any[]; auditLog: any[] } {
  const sessions = Array.isArray(value?.sessions)
    ? value.sessions.map((session: any) => ({
      id: String(session?.id ?? session?.sessionId ?? ""),
      activeRecordingId: typeof session?.activeRecordingId === "string" ? session.activeRecordingId : null
    }))
    : [];
  const auditLog = (Array.isArray(value?.auditLog) ? value.auditLog : [])
    .filter((entry: any) => entry?.type === "recording.project_required")
    .slice(-20)
    .map((entry: any) => ({
      id: String(entry?.id ?? ""),
      type: "recording.project_required",
      message: typeof entry?.message === "string" ? entry.message : undefined
    }));
  return { sessions, auditLog };
}

export function flowSummariesToCatalogEntries(summaries: any[]): any[] {
  return summaries.map((summary) => ({
    source: "canonical",
    readOnly: false,
    flow: {
      flowId: summary.flowId,
      projectId: summary.projectId,
      name: summary.name ?? summary.flowId,
      ...(summary.description ? { description: summary.description } : {}),
      scope: summary.scope ?? { kind: "global" },
      visibility: "private",
      origin: "manual",
      source: { mode: summary.sourceMode ?? "visual" },
      interface: { inputs: [], outputs: [] },
      errors: [],
      variables: [],
      nodes: [],
      edges: [],
      publication: summary.publicationStatus && summary.publicationStatus !== "draft" && summary.version
        ? { status: summary.publicationStatus, version: summary.version, publishedAt: 0, interface: { inputs: [], outputs: [] }, flowDigest: "" }
        : { status: summary.publicationStatus ?? "draft" },
      createdAt: summary.updatedAt ?? Date.now(),
      updatedAt: summary.updatedAt ?? Date.now(),
      metadata: {
        summaryOnly: true,
        ...(Array.isArray(summary.hierarchySubflows) ? { hierarchySubflows: summary.hierarchySubflows.map((subflow: any) => ({ subflowId: subflow.subflowId, ...(subflow.name ? { name: subflow.name } : {}), ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}), ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId, metadata: { subflowCategoryId: subflow.parentCategoryId } } : {}) })) } : {}),
        ...(Array.isArray(summary.subflowCategories) ? { subflowCategories: summary.subflowCategories.map((category: any) => ({ id: category.id, name: category.name, parentId: category.parentId ?? null })) } : {}),
        ...(summary.recordingProposalIds ? { recordingProposalIds: summary.recordingProposalIds } : {}),
        ...(summary.subflowGraph === true ? { subflowGraph: true } : {}),
        ...(typeof summary.parentFlowId === "string" ? { parentFlowId: summary.parentFlowId } : {}),
        ...(typeof summary.parentSubflowId === "string" ? { parentSubflowId: summary.parentSubflowId } : {})
      }
    }
  }));
}

export function runtimeSummaryToSessionStub(summary: any): any {
  return {
    runId: summary.runId,
    targetKind: summary.targetKind,
    targetId: summary.targetId,
    status: summary.status,
    updatedAt: summary.updatedAt,
    metadata: { summaryOnly: true }
  };
}

export function proposalArtifactKind(proposal: any): "policy" | "recording_flow" | "auto" {
  if (Array.isArray(proposal?.candidates)) return "recording_flow";
  if (proposal?.policy) return "policy";
  if (proposal?.metadata?.summaryOnly === true && proposal?.metadata?.generationMode) return "policy";
  return "auto";
}
