import type { AutomationStudioRuntimeRepeatObservation } from "./observation.ts";

/** A successful private read or an explicit reason why equality remains unproven. */
export type AutomationStudioRuntimeRepeatEvidence<Value> =
  | { kind: "known"; value: Value }
  | Extract<AutomationStudioRuntimeRepeatObservation, { kind: "unavailable" }>;
