import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import type { StateSnapshot } from "@fluxiq/contracts/state";
import type { JsonObject } from "../../../core/index.ts";

export interface RecordingIngressPolicy<TTarget, TEvidence> {
  entry(value: unknown): AppendRecordingEntryInput<TTarget, TEvidence>;
  commandTarget(value: JsonObject): TTarget;
  initialState(value: unknown): StateSnapshot;
}
