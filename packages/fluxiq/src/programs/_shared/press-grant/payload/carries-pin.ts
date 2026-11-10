/**
 * Whether a destructive call's payload confirms it with a PIN (a non-empty
 * `authorizationPin` string) rather than a press grant. `call()` and
 * `confirmDestructiveCall` both ask this, so they agree on which path a call
 * takes: a PIN call is read and checked as it always was, and only a call a
 * grant confirms is read as sent (`payloadAsSent`).
 */
export function payloadCarriesPin(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const pin = (payload as { authorizationPin?: unknown }).authorizationPin;
  return typeof pin === "string" && pin !== "";
}
