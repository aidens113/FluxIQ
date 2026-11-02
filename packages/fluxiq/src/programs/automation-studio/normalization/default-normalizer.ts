import { ConservativeTimelineNormalizer as CanonicalNormalizer, selectActionContextStateCheckpointIds as selectCheckpoints, selectActionContextStateEntryIds as selectEntries } from "../../../runtime/recording/index.ts";
import type { RecordingSession } from "../model/index.ts";
import type { TimelineEntry } from "../model/index.ts";
import type { ActionTarget } from "../model/index.ts";
import type { EvidenceReference } from "../model/index.ts";
import type { NormalizationOptions, NormalizedTimeline } from "./contracts.ts";
import { legacyStateObservations } from "./state-observations.ts";
export class ConservativeTimelineNormalizer extends CanonicalNormalizer<ActionTarget, EvidenceReference> {
  constructor() { super(legacyStateObservations); }
}
export function normalizeRecordingTimeline(recording: RecordingSession, options?: NormalizationOptions): NormalizedTimeline {
  return new ConservativeTimelineNormalizer().normalize(recording, options);
}
export function selectActionContextStateCheckpointIds(entries: TimelineEntry[], options: Pick<NormalizationOptions, "compactStateCheckpoints" | "stateCheckpointContextWindowMs"> = {}): Set<string> {
  return selectCheckpoints(entries, legacyStateObservations, options);
}
export function selectActionContextStateEntryIds(entries: TimelineEntry[], options: Pick<NormalizationOptions, "compactStateCheckpoints" | "stateCheckpointContextWindowMs"> = {}): Set<string> {
  return selectEntries(entries, legacyStateObservations, options);
}
