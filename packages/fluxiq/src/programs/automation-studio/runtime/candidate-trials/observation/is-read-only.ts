import { trialReadOnlyInvocations } from "./read-only-invocations.ts";

export function isTrialReadOnlyInvocation(input: object): boolean { return trialReadOnlyInvocations.get(input)?.current() === true; }
