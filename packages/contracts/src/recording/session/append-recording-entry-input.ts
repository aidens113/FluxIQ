import type { EvidenceReference } from "../../evidence/index.js";
import type { ActionEntry, DomainEventEntry, MarkerEntry, ObservationEntry } from "../timeline/index.js";

export type AppendRecordingEntryInput<TTarget = unknown, TEvidence = EvidenceReference> =
  | Omit<ActionEntry<TTarget, TEvidence>, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ActionEntry<TTarget, TEvidence>, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<ObservationEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ObservationEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<DomainEventEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<DomainEventEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<MarkerEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<MarkerEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>;
