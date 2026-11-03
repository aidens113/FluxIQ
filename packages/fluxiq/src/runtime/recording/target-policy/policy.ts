import type { JsonObject } from "../../../core/index.ts";
import type { RecordingTargetValidationPolicy } from "../validation/index.ts";

/** Trusted implementation code; a recording value never supplies this policy. */
export interface RecordingTargetPolicy extends RecordingTargetValidationPolicy<unknown> {
  accepts(value: unknown): value is unknown;
  commandTarget(value: JsonObject): unknown;
}
