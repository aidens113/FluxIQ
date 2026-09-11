import path from "node:path";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { PipelineArtifactKind } from "../../pipeline-model.ts";
import { AutomationStudioProjectPaths } from "./project.ts";

// Every path under a recording session: its timeline, its derived pipeline
// artifacts, and the proposal documents that live outside the session folder.
export class AutomationStudioRecordingPaths {
  constructor(private readonly projectPaths: AutomationStudioProjectPaths) {}

  recordingSessionDirectory(projectId: string, recordingId: string): string {
    return this.projectPaths.projectFile(projectId, "recordings", safeSegment(recordingId));
  }

  recordingTimelineFile(projectId: string, recordingId: string): string {
    return path.join(this.recordingSessionDirectory(projectId, recordingId), "timeline.jsonl");
  }

  recordingDerivedDirectory(projectId: string, recordingId: string): string {
    return path.join(this.recordingSessionDirectory(projectId, recordingId), "derived");
  }

  recordingDerivedFile(projectId: string, recordingId: string, ...parts: string[]): string {
    return path.join(this.recordingDerivedDirectory(projectId, recordingId), ...parts);
  }

  recordingPipelineFile(projectId: string, recordingId: string): string {
    return this.recordingDerivedFile(projectId, recordingId, "index.json");
  }

  recordingPipelineArtifactFile(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string): string {
    if (kind === "policyProposals" || kind === "recordingFlowProposals") return this.projectPaths.projectFile(projectId, "proposals", safeSegment(recordingId), safeSegment(id), "proposal.json");
    return this.recordingDerivedFile(projectId, recordingId, this.recordingPipelineArtifactFolder(kind), `${safeSegment(id)}.json`);
  }

  recordingPipelineArtifactFolder(kind: PipelineArtifactKind): string {
    return this.pipelineFolder(kind);
  }

  legacyRecordingPipelineArtifactFile(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string): string | null {
    return null;
  }

  pipelineFolder(kind: PipelineArtifactKind): string {
    if (kind === "normalizationReviews") return path.join("normalization", "reviews");
    if (kind === "miningRuns") return path.join("evidence", "mining-runs");
    if (kind === "evidenceFacts") return path.join("evidence", "facts");
    if (kind === "evidenceObservations") return path.join("evidence", "observations");
    if (kind === "stateActionCorrelations") return path.join("evidence", "correlations");
    if (kind === "evidenceClaims") return path.join("evidence", "claims");
    if (kind === "learnedTaskModels") return path.join("task-models");
    if (kind === "policyProposals") return "proposal";
    if (kind === "recordingFlowProposals") return path.join("proposal", "flows");
    return "replays";
  }
}
