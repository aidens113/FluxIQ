import type { AutomationStudioRecordingMapperCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";
import { recordingActionEntryCandidate } from "./action-entry.ts";
import { recordingFlowActionCandidate, RecordingCandidateValidationError } from "./candidate/index.ts";
import { recordingMapperCalls } from "./calls/index.ts";
import { recordingCandidateGapTracker } from "./gap.ts";
import { recordingMappingIdentity } from "./identity.ts";
import type { RecordingMappingInput } from "./input.ts";
import type { RecordingMappingResult } from "./result.ts";

/** Run one original mapper with independent calls, retaining per-entry failure isolation. */
export async function runRecordingMapper(input: RecordingMappingInput): Promise<RecordingMappingResult> {
  const { mapper, timeline } = input;
  const issues: string[] = [], candidates: RecordingMappingResult["candidates"] = [];
  let emittedCandidateCount = 0, mappedEntryCount = 0;
  const controller = new AbortController();
  const calls = recordingMapperCalls(timeline, input.recordingId, input.domainId);
  const gapBeforeCandidate = recordingCandidateGapTracker();
  const normalizer = mapper.normalizeParameters;
  for (const [index, entry] of timeline.entries()) {
    const { observation, following } = calls[index]!;
    try {
      const mapped = await mapper.implementation(observation, { signal: controller.signal, elementMatcher: input.elementMatcher, following });
      const mappedCandidates = !mapped ? [] : "candidates" in mapped ? mapped.candidates : [mapped];
      if (mappedCandidates.length) {
        mappedEntryCount += 1;
        emittedCandidateCount += mappedCandidates.length;
      }
      const candidateInputs = mappedCandidates.length ? mappedCandidates : entry.type === "action"
        ? [recordingActionEntryCandidate(entry, input.formatTokenLabel)].filter(Boolean) as AutomationStudioRecordingMapperCandidate[] : [];
      if (!mappedCandidates.length && candidateInputs.length) {
        mappedEntryCount += 1;
        emittedCandidateCount += candidateInputs.length;
      }
      for (const candidate of candidateInputs) {
        const actionEntryId = input.lookup ? input.lookup.resolveCandidateActionEntryId(entry.id, candidate) : entry.id;
        const stateLink = input.lookup?.proposalNodeStateLink(actionEntryId);
        const recordedGapMs = gapBeforeCandidate(entry);
        candidates.push(recordingFlowActionCandidate(input.io, {
          candidate, actionEntryId, sourceEntryId: entry.id, recordingId: input.recordingId, domainId: input.domainId,
          ...(stateLink ? { stateLink } : {}),
          ...(recordedGapMs !== undefined ? { recordedGapMs } : {}),
          ...(mapper.definition.outputIds ? { mapperOutputIds: mapper.definition.outputIds } : {}),
          nextCandidateId: (id) => input.nextCandidateId(id),
          ...(normalizer ? { normalizeParameters: (domainId, parameters, context) => normalizer.call(mapper, domainId, parameters, context) } : {})
        }));
      }
    } catch (error) {
      issues.push(`Mapper ${recordingMappingIdentity(mapper.definition.id)} could not map entry ${recordingMappingIdentity(entry.id)}: ${RecordingCandidateValidationError.publicMessage(error)}`);
    }
  }
  if (!candidates.length) {
    const seen = timeline.length === input.rawEntryCount ? `saw ${input.rawEntryCount} entries (${input.entryCounts})`
      : `saw ${timeline.length} proposal entries from ${input.rawEntryCount} raw entries (${input.entryCounts})`;
    issues.push(`Mapper ${recordingMappingIdentity(mapper.definition.id)} emitted no valid action candidates for recording ${recordingMappingIdentity(input.recordingId)}. It ${seen}, matched ${mappedEntryCount}, emitted ${emittedCandidateCount} raw candidates, and accepted 0 valid candidates.`);
  }
  return { candidates, issues, stats: { mappedEntryCount, emittedCandidateCount, acceptedCandidateCount: candidates.length } };
}
