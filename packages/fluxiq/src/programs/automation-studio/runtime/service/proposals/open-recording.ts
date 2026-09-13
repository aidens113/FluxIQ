import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingSession } from "../../../model/index.ts";

// A recording is only complete once it has been finalized: until `endedAt` is
// stamped the timeline can still grow, and a proposal built from it is built
// from however much happened to be written at that instant. That proposal is
// not merely short — it looks finished, so a reviewer approves a Flow missing
// the actions the recorder had not yet delivered. Proposal generation is still
// allowed on an open recording, because a caller may legitimately want a
// preview of one, but it never comes back silent about it.

/**
 * What a proposal built from a still-open recording has to say about itself:
 * an issue for the caller, and metadata stamped onto the stored artifact so
 * the caveat survives on disk long after the response is gone.
 *
 * Empty for a finalized recording, which is the normal case — nothing here
 * fires in ordinary operation.
 */
export function openRecordingProposalNotice(recording: RecordingSession): { issues: string[]; metadata: JsonObject } {
  if (recording.endedAt !== undefined) return { issues: [], metadata: {} };
  return {
    issues: [
      `Recording ${recording.recordingId} has not been finalized. This proposal was built from the ${recording.timeline.length} entries appended so far, and the recording can still grow, so actions performed near the end of it may be missing. Generate again once the recording reports endedAt.`
    ],
    metadata: { recordingOpenAtGeneration: true, recordingEntryCountAtGeneration: recording.timeline.length }
  };
}
