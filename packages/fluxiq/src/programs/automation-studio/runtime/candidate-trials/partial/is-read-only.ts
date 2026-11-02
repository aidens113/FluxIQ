import { partialTrialReadOnlyContexts } from "./read-only-contexts.ts";

export function isPartialTrialReadOnly(input: object): boolean {
  return partialTrialReadOnlyContexts.has(input);
}
