import type { RecordingSession as CanonicalRecordingSession } from "@fluxiq/contracts/recording";
import type { ActionTarget } from "./actions.ts";
import type { EvidenceReference } from "./evidence.ts";
export type { RecordingNote } from "@fluxiq/contracts/recording";
export type RecordingSession = CanonicalRecordingSession<ActionTarget, EvidenceReference>;
