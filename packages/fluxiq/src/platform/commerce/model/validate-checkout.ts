import type { CommerceCheckoutRecord } from "./types.ts";

const NAMES = ["accountId", "providerId", "checkoutId", "planId", "customerId", "createdAtMs", "expiresAtMs", "subscriptionId", "completedAtMs", "expiredAtMs"];

/**
 * Validates and copies a checkout record; malformed or extra fields are
 * refused. A completed checkout names its subscription and completion time
 * together, and a checkout is never both completed and expired.
 */
export function validateCommerceCheckout(value: CommerceCheckoutRecord): CommerceCheckoutRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("object");
  const keys = Object.keys(value);
  if (keys.length !== NAMES.length || keys.some((key) => !NAMES.includes(key))) invalid("fields");
  for (const name of ["accountId", "providerId", "checkoutId", "planId"] as const) identifier(value[name], name);
  for (const name of ["customerId", "subscriptionId"] as const) if (value[name] !== null) identifier(value[name], name);
  for (const name of ["createdAtMs", "expiresAtMs"] as const) timestamp(value[name], name);
  for (const name of ["completedAtMs", "expiredAtMs"] as const) if (value[name] !== null) timestamp(value[name], name);
  if (value.expiresAtMs <= value.createdAtMs) invalid("interval");
  if ((value.subscriptionId === null) !== (value.completedAtMs === null)) invalid("completion");
  if (value.completedAtMs !== null && value.expiredAtMs !== null) invalid("settled");
  return {
    accountId: value.accountId,
    providerId: value.providerId,
    checkoutId: value.checkoutId,
    planId: value.planId,
    customerId: value.customerId,
    createdAtMs: value.createdAtMs,
    expiresAtMs: value.expiresAtMs,
    subscriptionId: value.subscriptionId,
    completedAtMs: value.completedAtMs,
    expiredAtMs: value.expiredAtMs
  };
}

function identifier(value: unknown, name: string): void {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) invalid(name);
}

function timestamp(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(name);
}

function invalid(name: string): never {
  throw new TypeError(`Invalid commerce checkout: ${name}`);
}
