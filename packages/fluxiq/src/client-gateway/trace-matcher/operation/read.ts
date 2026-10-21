// The operation an action command makes, as the trace matcher compares it
// (traces and offline trials, P4b): its action type, target and parameters,
// canonical -- object keys sorted at every depth, array order kept, an absent
// field read as `null` -- and nothing else (`./fields.ts` names what
// is left out and why). Read the same way from a recorded message's payload
// and from a command the gateway sends now.

import type { ClientGatewayTraceOperation } from "../types.ts";

/** The operation of an action command payload; a payload that is not an object reads as an operation with no action type. */
export function readClientGatewayTraceOperation(payload: unknown): ClientGatewayTraceOperation {
  const record = isRecord(payload) ? payload : {};
  const actionType = typeof record.actionType === "string" ? record.actionType : "";
  const compared = { actionType, target: canonical(record.target), parameters: canonical(record.parameters) };
  return { actionType, compared, key: JSON.stringify(compared) };
}

function canonical(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
  return sorted;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
