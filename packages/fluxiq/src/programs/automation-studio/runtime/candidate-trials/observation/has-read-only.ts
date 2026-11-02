import { trialReadOnlyInvocations } from "./read-only-invocations.ts";

/** Suppression only: loss of a retained lease must never select live persistence. */
export function hasTrialReadOnlyInvocation(input: object): boolean { return trialReadOnlyInvocations.has(input); }
