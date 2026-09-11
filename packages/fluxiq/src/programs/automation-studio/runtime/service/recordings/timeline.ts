import type { RecordingSession } from "../../../model/index.ts";

// The recorded timeline as the mapper and the normalization review read it:
// state checkpoints and client state snapshots are transport, not behaviour,
// so neither layer should see them.

export function recordingTimelineForProposalMapping(timeline: RecordingSession["timeline"]): RecordingSession["timeline"] {
  return timeline.filter((entry) => {
    if (entry.type === "state_checkpoint") return false;
    if (entry.type === "observation" && (entry.observationType === "client.state_snapshot" || entry.observationType === "client.state_update")) return false;
    return true;
  });
}
