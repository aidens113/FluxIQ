import { hasTrialReadOnlyInvocation } from "./observation/index.ts";
import { isPartialTrialReadOnly } from "./partial/index.ts";
import { candidateTrialInvocation, candidateTrialAuthority } from "./authority/index.ts";

/** Suppresses metadata IO for original read-only modes, including a lost lease; it never authorizes execution. */
export function candidateTrialSuppressesWrites(input: object): boolean {
  if (hasTrialReadOnlyInvocation(input) || isPartialTrialReadOnly(input)) return true;
  const original = candidateTrialInvocation(input);
  return original !== undefined && candidateTrialAuthority(original.modeOwner.port)?.isReadOnlyCheckout(original.checkout) === true;
}
