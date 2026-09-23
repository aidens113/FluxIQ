import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { IoRegistry } from "../../../../../io/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { RecordingSession } from "../../../model/index.ts";
import type { AutomationStudioElementMatcher } from "../../../fingerprinting/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioRecordingMapperCandidate, AutomationStudioRecordingMapperImplementation } from "../../../nodes/index.ts";
import type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import { recordingActionEntryCandidate } from "../recording-projections/index.ts";
import type { RecordingIndex as RecordingStateIndex } from "../../../storage/index.ts";
import { proposalNodeStateLinkFromIndex, resolveCandidateActionEntryId } from "../recording-state-index/index.ts";
import { recordingCandidateGapTracker, recordingFlowActionCandidate, recordingMapperCalls } from "./proposal-candidates.ts";

// One recording mapper's pass over a recording: every entry offered to it, every
// candidate it proposes checked and given the shape a proposal stores, and the
// proposal that results.
//
// This is the service's own loop, lifted out of it. It is one responsibility --
// run a mapper and build its proposal -- and the service had no part in it
// beyond holding the registries it needs.

/** A mapper as the importer runtime binds it. */
export type RecordingMapperBinding = {
  definition: NonNullable<AutomationStudioImporterSdkManifest["recordingMappers"]>[number];
  packageId: string;
  packageVersion: string;
  implementation: AutomationStudioRecordingMapperImplementation;
};

export type RecordingProposalForMapperInput = {
  mapper: RecordingMapperBinding;
  io: IoRegistry;
  elementMatcher: AutomationStudioElementMatcher;
  projectId: string;
  domainId: string;
  recording: RecordingSession;
  /** The entries the mapper is shown: the recording's timeline with transport-only entries compacted out. */
  mapperTimeline: RecordingSession["timeline"];
  /** The raw timeline's entry counts, for the issue a mapper that proposed nothing leaves. */
  entryCounts: string;
  stateIndex: RecordingStateIndex | null;
  /** What an unfinished recording says about itself, carried onto the proposal. */
  noticeMetadata: JsonObject;
};

/**
 * One mapper's proposal, or nothing when it accepted no candidate, with every
 * issue the pass produced. A mapper that throws on one entry loses that entry
 * and keeps the rest: one bad observation is not a reason to discard a
 * recording.
 */
export async function recordingProposalForMapper(input: RecordingProposalForMapperInput): Promise<{ proposal?: RecordingFlowProposalArtifact; issues: string[] }> {
  const { mapper, recording, mapperTimeline } = input;
  const issues: string[] = [];
  const controller = new AbortController();
  const candidates: RecordingFlowActionCandidate[] = [];
  let emittedCandidateCount = 0;
  let mappedEntryCount = 0;
  const calls = recordingMapperCalls(mapperTimeline, recording.recordingId, input.domainId);
  // The recorded wait each node inherits. Derived here because this is the only
  // place the recording's clock and the candidates meet.
  const gapBeforeCandidate = recordingCandidateGapTracker();
  for (const [index, entry] of mapperTimeline.entries()) {
    const { observation, following } = calls[index]!;
    try {
      const mapped = await mapper.implementation(observation, { signal: controller.signal, elementMatcher: input.elementMatcher, following });
      const mappedCandidates = !mapped ? [] : "candidates" in mapped ? mapped.candidates : [mapped];
      if (mappedCandidates.length) {
        mappedEntryCount += 1;
        emittedCandidateCount += mappedCandidates.length;
      }
      const candidateInputs = mappedCandidates.length ? mappedCandidates : entry.type === "action" ? [recordingActionEntryCandidate(entry)].filter(Boolean) as AutomationStudioRecordingMapperCandidate[] : [];
      if (!mappedCandidates.length && candidateInputs.length) {
        mappedEntryCount += 1;
        emittedCandidateCount += candidateInputs.length;
      }
      for (const candidate of candidateInputs) {
        const actionEntryId = resolveCandidateActionEntryId(input.stateIndex, entry.id, candidate);
        const stateLink = input.stateIndex ? proposalNodeStateLinkFromIndex(input.stateIndex, actionEntryId) : undefined;
        const recordedGapMs = gapBeforeCandidate(entry);
        candidates.push(recordingFlowActionCandidate(input.io, {
          candidate,
          actionEntryId,
          sourceEntryId: entry.id,
          recordingId: recording.recordingId,
          domainId: input.domainId,
          ...(stateLink ? { stateLink } : {}),
          ...(recordedGapMs !== undefined ? { recordedGapMs } : {}),
          ...(mapper.definition.outputIds ? { mapperOutputIds: mapper.definition.outputIds } : {})
        }));
      }
    } catch (error) {
      issues.push(`Mapper ${mapper.definition.id} could not map entry ${entry.id}: ${error instanceof Error && error.message ? error.message : "Unknown mapper error."}`);
    }
  }
  if (!candidates.length) {
    const seen = mapperTimeline.length === recording.timeline.length
      ? `saw ${recording.timeline.length} entries (${input.entryCounts})`
      : `saw ${mapperTimeline.length} proposal entries from ${recording.timeline.length} raw entries (${input.entryCounts})`;
    issues.push(`Mapper ${mapper.definition.id} emitted no valid action candidates for recording ${recording.recordingId}. It ${seen}, matched ${mappedEntryCount}, emitted ${emittedCandidateCount} raw candidates, and accepted 0 valid candidates.`);
    return { issues };
  }
  const now = Date.now();
  return {
    issues,
    proposal: {
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
    }
  };
}
