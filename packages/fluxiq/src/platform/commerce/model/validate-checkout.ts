import type { CommerceCheckoutRecord } from "./types.ts";

/** Validates and copies a checkout record; malformed or extra fields are refused. */
export function validateCommerceCheckout(value: CommerceCheckoutRecord): CommerceCheckoutRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("object");
  const names = ["accountId", "providerId", "checkoutId", "createdAtMs", "expiresAtMs"];
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key))) invalid("fields");
  for (const name of ["accountId", "providerId", "checkoutId"] as const) {
    const field = value[name];
    if (typeof field !== "string" || field.length === 0 || field.trim() !== field) invalid(name);
  }
  for (const name of ["createdAtMs", "expiresAtMs"] as const) {
    if (!Number.isSafeInteger(value[name]) || value[name] < 0) invalid(name);
  }
  if (value.expiresAtMs <= value.createdAtMs) invalid("interval");
  return {
    accountId: value.accountId,
    providerId: value.providerId,
    checkoutId: value.checkoutId,
    createdAtMs: value.createdAtMs,
    expiresAtMs: value.expiresAtMs
  };
}

function invalid(name: string): never {
  throw new TypeError(`Invalid commerce checkout: ${name}`);
}
