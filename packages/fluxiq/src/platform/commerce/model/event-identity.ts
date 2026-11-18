import type { CommerceSubscriptionSnapshot, VerifiedCommerceEvent } from "./types.ts";

/** Validation gives all objects a fixed field order; array order stays part of identity. */
export function commerceEventIdentity(event: VerifiedCommerceEvent): string {
  return JSON.stringify(event);
}

export function commerceSubscriptionIdentity(subscription: CommerceSubscriptionSnapshot): string {
  return JSON.stringify(subscription);
}
