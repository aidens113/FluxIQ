import type { TimelineEntry } from "@fluxiq/contracts/recording";
import type { StateObservationPolicy } from "../normalization/index.ts";

export function recordingTimelineForProposalMapping<TEntry extends TimelineEntry>(timeline: TEntry[], policy: StateObservationPolicy): TEntry[] {
  return timeline.filter((entry) => entry.type !== "state_checkpoint" && !(entry.type === "observation" && policy.isStateObservation(entry)));
}
