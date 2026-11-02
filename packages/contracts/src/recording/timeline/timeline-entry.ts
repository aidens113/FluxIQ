import type { EvidenceReference } from "../../evidence/index.js";
import type { ActionEntry } from "./action-entry.js";
import type { StateDeltaEntry } from "./state-delta-entry.js";
import type { StateCheckpointEntry } from "./state-checkpoint-entry.js";
import type { ObservationEntry } from "./observation-entry.js";
import type { DomainEventEntry } from "./domain-event-entry.js";
import type { NoteEntry } from "./note-entry.js";
import type { MarkerEntry } from "./marker-entry.js";

export type TimelineEntry<TTarget = unknown, TEvidence = EvidenceReference> =
  | ActionEntry<TTarget, TEvidence>
  | StateDeltaEntry
  | StateCheckpointEntry
  | ObservationEntry
  | DomainEventEntry
  | NoteEntry
  | MarkerEntry;
