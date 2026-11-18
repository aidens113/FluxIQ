// Dedicated environments' model: the record (interface I3), the intent state
// machine as a pure decision, and the typed refusal.
export type {
  EnvironmentDesiredState,
  EnvironmentDriverKind,
  EnvironmentDriverObservation,
  EnvironmentIntent,
  EnvironmentIntentResult,
  EnvironmentObservedState,
  EnvironmentOperationKind,
  EnvironmentOperationRecord,
  EnvironmentRecord,
  EnvironmentStore
} from "./types.ts";
export { EnvironmentRefusal } from "./environment-refusal.ts";
export type { EnvironmentRefusalCode } from "./environment-refusal.ts";
export { planEnvironmentIntent } from "./plan-environment-intent.ts";
export type { EnvironmentIntentPlan } from "./plan-environment-intent.ts";
