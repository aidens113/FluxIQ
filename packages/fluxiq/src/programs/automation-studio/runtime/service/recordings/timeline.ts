import type { RecordingSession } from "../../../model/index.ts";
import type { StateObservationPolicy } from "../../../../../runtime/recording/normalization/index.ts";
import { recordingTimelineForProposalMapping as filterTimeline } from "../../../../../runtime/recording/mapping/index.ts";

// Review transport compaction is intentionally narrower than normalization's payload-state policy.
const policy: StateObservationPolicy = Object.freeze({
  isStateObservation: (entry) => entry.observationType === "client.state_snapshot" || entry.observationType === "client.state_update"
});

export function recordingTimelineForProposalMapping(timeline: RecordingSession["timeline"]): RecordingSession["timeline"] {
  return filterTimeline(timeline, policy);
}
