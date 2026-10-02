import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The most one signature may take, as JSON text. A host that returns more is
 * not recording a signature but a page, and the node keeps nothing instead.
 */
export const AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS = 2_048;

/**
 * What a node recorded: the page it started on (its expected pre-state), the
 * page it left, and what it did to the page between the two (the host's
 * `signRouteEffect`). Each is opaque to Core and bounded alike.
 */
export type AutomationStudioRouteSignatures = { before?: JsonObject; after?: JsonObject; effect?: JsonObject };

const SIGNATURE_KEYS: ReadonlySet<string> = new Set(["before", "after", "effect"]);

/** One signature as read, or why it is not one. */
export type AutomationStudioRouteSignatureReading = { ok: true; signature: JsonObject } | { ok: false; reason: string };

/**
 * A `{ before?, after?, effect? }` value as signatures, or nothing when it is
 * not one: the one reader for a node's metadata and a plan node's field alike,
 * so a plan that carries a malformed value is refused by the same test a
 * running node is read by. Each part must be a signature
 * (`automationStudioReadRouteSignature`).
 */
export function automationStudioRouteSignaturesValue(value: unknown): AutomationStudioRouteSignatures | undefined {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (!keys.length || keys.some((key) => !SIGNATURE_KEYS.has(key))) return undefined;
  const read: AutomationStudioRouteSignatures = {};
  for (const key of ["before", "after", "effect"] as const) {
    if (value[key] === undefined) continue;
    const part = automationStudioReadRouteSignature(value[key]);
    if (!part.ok) return undefined;
    read[key] = part.signature;
  }
  return read;
}

/**
 * One signature: a non-empty JSON object within the size bound, copied so the
 * caller holds nothing the host can still change. Otherwise the reason it is
 * not one.
 */
export function automationStudioReadRouteSignature(value: unknown): AutomationStudioRouteSignatureReading {
  if (!isPlainObject(value)) return { ok: false, reason: "A route signature must be a JSON object." };
  if (!Object.keys(value).length) return { ok: false, reason: "A route signature must not be empty." };
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "The route signature is not JSON." };
  }
  if (text.length > AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS) {
    return { ok: false, reason: `The route signature takes ${text.length} characters, past the bound of ${AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS}.` };
  }
  return { ok: true, signature: JSON.parse(text) as JsonObject };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
