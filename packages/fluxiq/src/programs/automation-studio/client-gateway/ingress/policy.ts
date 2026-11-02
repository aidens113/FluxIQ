import type { RecordingIngressPolicy } from "../../../../client-gateway/recording/policies/index.ts";
import { decodeRecordingEntry, isRecordingStateSnapshot } from "../../../../client-gateway/recording/decoding/index.ts";
import type { ActionTarget, EvidenceReference } from "../../model/index.ts";
import { validateStateSnapshot } from "../../model/validation/index.ts";
import { isStudioRecordingTarget } from "./target.ts";
import { isStudioRecordingEvidence } from "./evidence.ts";

export const studioRecordingIngress: RecordingIngressPolicy<ActionTarget, EvidenceReference> = {
  entry: value => decodeRecordingEntry(value, { target: isStudioRecordingTarget, evidence: isStudioRecordingEvidence }),
  commandTarget: value => ({ type: String(value.type ?? "client-target"), metadata: value }),
  initialState(value) {
    if (!isRecordingStateSnapshot(value) || !validateStateSnapshot(value).ok) throw new Error("recording.invalid_initial_state");
    return value;
  }
};
