import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { IoRegistry } from "../../../../../io/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { RecordingSession } from "../../../model/index.ts";
import type { ElementMatcher } from "../../../../../runtime/target-matching/index.ts";
import type { RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import type { RecordingIndex as RecordingStateIndex } from "../../../storage/index.ts";
import { proposalNodeStateLinkFromIndex, resolveCandidateActionEntryId } from "../recording-state-index/index.ts";
import { readableTokenValue } from "../evidence/index.ts";
import { runRecordingMapper } from "../../../../../runtime/recording/mapping/index.ts";
export type { AutomationStudioRecordingMapperBinding as RecordingMapperBinding } from "../../../../../components/automation/importer/recording-mapper/index.ts";
import type { AutomationStudioRecordingMapperBinding as RecordingMapperBinding } from "../../../../../components/automation/importer/recording-mapper/index.ts";

export type RecordingProposalForMapperInput = {
  mapper: RecordingMapperBinding;
  io: IoRegistry;
  elementMatcher: ElementMatcher;
  projectId: string;
  domainId: string;
  recording: RecordingSession;
  mapperTimeline: RecordingSession["timeline"];
  entryCounts: string;
  stateIndex: RecordingStateIndex | null;
  noticeMetadata: JsonObject;
};

/** Studio supplies canonical lookup/identity ports and stamps only its persisted envelope. */
export async function recordingProposalForMapper(input: RecordingProposalForMapperInput): Promise<{ proposal?: RecordingFlowProposalArtifact; issues: string[] }> {
  const { mapper, recording } = input;
  const { candidates, issues } = await runRecordingMapper({
    mapper, io: input.io, elementMatcher: input.elementMatcher, recordingId: recording.recordingId,
    domainId: input.domainId, timeline: input.mapperTimeline, rawEntryCount: recording.timeline.length, entryCounts: input.entryCounts,
    lookup: {
      resolveCandidateActionEntryId: (sourceEntryId, candidate) => resolveCandidateActionEntryId(input.stateIndex, sourceEntryId, candidate),
      proposalNodeStateLink: (actionEntryId) => input.stateIndex ? proposalNodeStateLinkFromIndex(input.stateIndex, actionEntryId) : undefined
    },
    nextCandidateId: (actionEntryId) => `candidate.${safeSegment(actionEntryId)}.${randomUUID()}`,
    formatTokenLabel: readableTokenValue
  });
  if (!candidates.length) return { issues };
  const now = Date.now();
  return { issues, proposal: {
    schemaVersion: "0.1",
    proposalId: `recording-proposal.${safeSegment(recording.recordingId)}.${safeSegment(mapper.definition.id)}.${randomUUID()}`,
    projectId: input.projectId,
    recordingId: recording.recordingId,
    domainId: input.domainId,
    mapper: { id: mapper.definition.id, version: mapper.definition.version, packageId: mapper.packageId, packageVersion: mapper.packageVersion },
    status: "proposed",
    candidates,
    generatedAt: now,
    updatedAt: now,
    metadata: { rawEvidenceImmutable: true, ...input.noticeMetadata }
  } };
}
