import path from "node:path";
import { safeSegment } from "../../_shared/storage.ts";
import type { AutomationStudioProject } from "../api/contracts.ts";
import type { AutomationStudioFlowPublication, AutomationStudioFlowScope } from "../model/flows.ts";
import type { RecordingFlowProposalArtifact } from "../runtime/recording-flow-proposal.ts";
import type { PolicyProposalArtifact } from "../runtime/policy-model.ts";

export type AutomationStudioProjectSummary = {
  projectId: string;
  name: string;
  description?: string;
  domainId?: string | null;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
  counts: {
    recordings: number;
    proposals: number;
    flows: number;
  };
};

export type AutomationStudioRootIndex = {
  schemaVersion: "0.1";
  projects: AutomationStudioProjectSummary[];
};

export type AutomationStudioRecordingSummary = {
  recordingId: string;
  name?: string;
  taskId?: string;
  domainId?: string | null;
  status: "recording" | "completed" | "failed";
  startedAt: number;
  endedAt?: number;
  updatedAt: number;
  eventCount: number;
  actionCount: number;
  stateSnapshotCount: number;
  proposalCount: number;
  thumbnailRef?: string;
};

export type AutomationStudioRecordingSummaryIndex = {
  schemaVersion: "0.1";
  recordings: AutomationStudioRecordingSummary[];
};

export type AutomationStudioProposalSummary = {
  proposalId: string;
  recordingId: string;
  name?: string;
  kind: "policy" | "recording_flow" | "llm_assisted" | "direct";
  status: "draft" | "generated" | "approved" | "rejected" | "invalidated" | "failed";
  generatedAt: number;
  updatedAt: number;
  nodeCount: number;
  issueCount: number;
  mode?: "direct" | "llm_assisted";
  sourceDigest?: string;
  lastValidatedAt?: number;
};

export type AutomationStudioProposalSummaryIndex = {
  schemaVersion: "0.1";
  proposals: AutomationStudioProposalSummary[];
};

export type AutomationStudioFlowHierarchySubflowSummary = {
  subflowId: string;
  name?: string;
  parentCategoryId?: string;
};

export type AutomationStudioFlowHierarchyCategorySummary = {
  id: string;
  name: string;
  parentId?: string;
};
export type AutomationStudioFlowSummary = {
  flowId: string;
  name: string;
  description?: string;
  scope: AutomationStudioFlowScope;
  sourceMode: "visual" | "code";
  publicationStatus: AutomationStudioFlowPublication["status"];
  version?: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: number;
  recordingProposalIds?: string[];
  subflowGraph?: boolean;
  parentFlowId?: string;
  parentSubflowId?: string;
  hierarchySubflows?: AutomationStudioFlowHierarchySubflowSummary[];
  subflowCategories?: AutomationStudioFlowHierarchyCategorySummary[];
};

export type AutomationStudioFlowSummaryIndex = {
  schemaVersion: "0.1";
  ownershipMetadataVersion?: 1;
  hierarchyMetadataVersion?: 1;
  flows: AutomationStudioFlowSummary[];
};

export type AutomationStudioObjectOwner =
  | { kind: "recording"; recordingId: string }
  | { kind: "proposal"; recordingId: string; proposalId: string }
  | { kind: "project" }
  | { kind: "shared" };

export type AutomationStudioObjectSummary = {
  sha256: string;
  mediaType: string;
  size: number;
  owner: AutomationStudioObjectOwner;
  relativePath: string;
  createdAt: number;
  refCount?: number;
};

export type AutomationStudioObjectIndex = {
  schemaVersion: "0.1";
  objects: AutomationStudioObjectSummary[];
};

export type AutomationStudioRuntimeRunSummary = {
  runId: string;
  targetKind: string;
  targetId: string;
  status: string;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  flowId?: string;
  attemptCount?: number;
  effectCount?: number;
  updatedAt: number;
};

export type AutomationStudioRuntimeRunSummaryPage = {
  runs: AutomationStudioRuntimeRunSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioRuntimeSummaryIndex = {
  schemaVersion: "0.1";
  runs: AutomationStudioRuntimeRunSummary[];
};

export type AutomationStudioWorkspaceSummary = {
  project: AutomationStudioProjectSummary;
  recordings: AutomationStudioRecordingSummary[];
  proposals: AutomationStudioProposalSummary[];
  flows: AutomationStudioFlowSummary[];
  runtime: AutomationStudioRuntimeRunSummary[];
};

export type AutomationStudioFileStorePaths = {
  rootIndex(): string;
  projectRoot(projectId: string): string;
  projectFile(projectId: string): string;
  hierarchyFile(projectId: string): string;
  workspaceFile(projectId: string): string;
  indexFile(projectId: string, kind: "recordings" | "proposals" | "flows" | "runtime" | "objects" | "pipeline"): string;
  recordingRoot(projectId: string, recordingId: string): string;
  recordingIndexFile(projectId: string, recordingId: string): string;
  recordingFile(projectId: string, recordingId: string): string;
  recordingTimelineFile(projectId: string, recordingId: string): string;
  recordingSnapshotRoot(projectId: string, recordingId: string): string;
  recordingSnapshotFile(projectId: string, recordingId: string, snapshotId: string): string;
  recordingObjectRoot(projectId: string, recordingId: string): string;
  proposalRoot(projectId: string, recordingId: string, proposalId: string): string;
  proposalFile(projectId: string, recordingId: string, proposalId: string): string;
  proposalGenerationFile(projectId: string, recordingId: string, proposalId: string): string;
  proposalReviewFile(projectId: string, recordingId: string, proposalId: string): string;
  flowRoot(projectId: string, flowId: string): string;
  flowFile(projectId: string, flowId: string): string;
  flowSourceRoot(projectId: string, flowId: string): string;
  flowPublicationFile(projectId: string, flowId: string, version: string): string;
  runtimeRunRoot(projectId: string, runId: string): string;
  runtimeRunFile(projectId: string, runId: string): string;
  sharedObjectRoot(projectId: string): string;
};

export function createAutomationStudioFileStorePaths(rootDir: string): AutomationStudioFileStorePaths {
  const projectRoot = (projectId: string) => path.join(rootDir, "projects", safeSegment(projectId));
  const recordingRoot = (projectId: string, recordingId: string) => path.join(projectRoot(projectId), "recordings", safeSegment(recordingId));
  const proposalRoot = (projectId: string, recordingId: string, proposalId: string) => path.join(projectRoot(projectId), "proposals", safeSegment(recordingId), safeSegment(proposalId));
  const flowRoot = (projectId: string, flowId: string) => path.join(projectRoot(projectId), "flows", safeSegment(flowId));
  const runtimeRunRoot = (projectId: string, runId: string) => path.join(projectRoot(projectId), "runtime", "runs", safeSegment(runId));
  return {
    rootIndex: () => path.join(rootDir, "index.json"),
    projectRoot,
    projectFile: (projectId) => path.join(projectRoot(projectId), "project.json"),
    hierarchyFile: (projectId) => path.join(projectRoot(projectId), "hierarchy.json"),
    workspaceFile: (projectId) => path.join(projectRoot(projectId), "workspace.json"),
    indexFile: (projectId, kind) => path.join(projectRoot(projectId), "indexes", `${kind}.json`),
    recordingRoot,
    recordingIndexFile: (projectId, recordingId) => path.join(recordingRoot(projectId, recordingId), "index.json"),
    recordingFile: (projectId, recordingId) => path.join(recordingRoot(projectId, recordingId), "recording.json"),
    recordingTimelineFile: (projectId, recordingId) => path.join(recordingRoot(projectId, recordingId), "timeline.jsonl"),
    recordingSnapshotRoot: (projectId, recordingId) => path.join(recordingRoot(projectId, recordingId), "snapshots"),
    recordingSnapshotFile: (projectId, recordingId, snapshotId) => path.join(recordingRoot(projectId, recordingId), "snapshots", `${safeSegment(snapshotId)}.json`),
    recordingObjectRoot: (projectId, recordingId) => path.join(recordingRoot(projectId, recordingId), "objects"),
    proposalRoot,
    proposalFile: (projectId, recordingId, proposalId) => path.join(proposalRoot(projectId, recordingId, proposalId), "proposal.json"),
    proposalGenerationFile: (projectId, recordingId, proposalId) => path.join(proposalRoot(projectId, recordingId, proposalId), "generation.json"),
    proposalReviewFile: (projectId, recordingId, proposalId) => path.join(proposalRoot(projectId, recordingId, proposalId), "review.json"),
    flowRoot,
    flowFile: (projectId, flowId) => path.join(flowRoot(projectId, flowId), "flow.json"),
    flowSourceRoot: (projectId, flowId) => path.join(flowRoot(projectId, flowId), "source"),
    flowPublicationFile: (projectId, flowId, version) => path.join(flowRoot(projectId, flowId), "publications", `${safeSegment(version)}.json`),
    runtimeRunRoot,
    runtimeRunFile: (projectId, runId) => path.join(runtimeRunRoot(projectId, runId), "run.json"),
    sharedObjectRoot: (projectId) => path.join(projectRoot(projectId), "objects", "shared")
  };
}

export function emptyAutomationStudioRootIndex(): AutomationStudioRootIndex {
  return { schemaVersion: "0.1", projects: [] };
}

export function emptyRecordingSummaryIndex(): AutomationStudioRecordingSummaryIndex {
  return { schemaVersion: "0.1", recordings: [] };
}

export function emptyProposalSummaryIndex(): AutomationStudioProposalSummaryIndex {
  return { schemaVersion: "0.1", proposals: [] };
}

export function emptyFlowSummaryIndex(): AutomationStudioFlowSummaryIndex {
  return { schemaVersion: "0.1", ownershipMetadataVersion: 1, hierarchyMetadataVersion: 1, flows: [] };
}

export function emptyRuntimeSummaryIndex(): AutomationStudioRuntimeSummaryIndex {
  return { schemaVersion: "0.1", runs: [] };
}

export function emptyObjectIndex(): AutomationStudioObjectIndex {
  return { schemaVersion: "0.1", objects: [] };
}

export function projectSummaryFromProject(project: AutomationStudioProject, counts: AutomationStudioProjectSummary["counts"]): AutomationStudioProjectSummary {
  return {
    projectId: project.id,
    name: project.name,
    ...(project.description ? { description: project.description } : {}),
    ...(project.domainId !== undefined ? { domainId: project.domainId } : {}),
    ...(project.categoryId !== undefined ? { categoryId: project.categoryId } : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    counts
  };
}

export function proposalSummaryFromPolicyProposal(proposal: PolicyProposalArtifact): AutomationStudioProposalSummary {
  const nodes = proposal.policy?.nodes ?? proposal.patch?.nodes ?? [];
  const recordingId = typeof proposal.metadata?.recordingId === "string" ? proposal.metadata.recordingId : proposal.learnedTaskModelId ?? "unknown";
  return {
    proposalId: proposal.proposalId,
    recordingId,
    kind: proposal.metadata?.generationMode === "llm_assisted" ? "llm_assisted" : proposal.metadata?.generationMode === "direct" ? "direct" : "policy",
    status: proposal.status === "approved" ? "approved" : "generated",
    generatedAt: proposal.generatedAt,
    updatedAt: typeof proposal.metadata?.updatedAt === "number" ? proposal.metadata.updatedAt : proposal.generatedAt,
    nodeCount: nodes.length,
    issueCount: 0,
    ...(proposal.metadata?.generationMode === "llm_assisted" || proposal.metadata?.generationMode === "direct" ? { mode: proposal.metadata.generationMode } : {})
  };
}

export function proposalSummaryFromRecordingFlowProposal(proposal: RecordingFlowProposalArtifact): AutomationStudioProposalSummary {
  return {
    proposalId: proposal.proposalId,
    recordingId: proposal.recordingId,
    kind: "recording_flow",
    status: proposal.status === "proposed" ? "generated" : proposal.status,
    generatedAt: proposal.generatedAt,
    updatedAt: proposal.updatedAt,
    nodeCount: proposal.candidates.length,
    issueCount: proposal.invalidation?.reasons.length ?? 0,
    ...(proposal.invalidation?.invalidatedAt ? { lastValidatedAt: proposal.invalidation.invalidatedAt } : {})
  };
}
