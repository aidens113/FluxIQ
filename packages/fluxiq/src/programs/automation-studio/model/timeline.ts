import type { ActionEntry as CanonicalActionEntry, TimelineEntry as CanonicalTimelineEntry } from "@fluxiq/contracts/recording";
import type { ActionTarget } from "./actions.ts";
import type { EvidenceReference } from "./evidence.ts";
export type { TimelineBase, StateDeltaEntry, StateCheckpointEntry, ObservationEntry, DomainEventEntry, NoteEntry, MarkerEntry } from "@fluxiq/contracts/recording";
export type ActionEntry = CanonicalActionEntry<ActionTarget, EvidenceReference>;
export type TimelineEntry = CanonicalTimelineEntry<ActionTarget, EvidenceReference>;
