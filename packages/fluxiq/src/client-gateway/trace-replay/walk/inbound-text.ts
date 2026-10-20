// The text a replay feeds for a recorded inbound event (traces and offline
// trials, P3):
//
// - raw text as it was received;
// - a structured payload (a message of a credential-bearing type) written back
//   as JSON, when nothing in it was withheld;
// - for a message that did not parse, whose text the trace withheld (D18), a
//   stand-in that fails to parse the same way: Core reads nothing from such a
//   message but the failure;
// - otherwise a gap: a withheld credential that Core's handling depended on, a
//   message that could not be written down, or no message at all.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";

/** Text that fails to parse as JSON, as any unparsed message does. */
const UNPARSEABLE_STAND_IN = "";

export function readClientGatewayTraceInboundText(event: ClientGatewayTraceEvent): { readonly text: string; readonly standIn: boolean } | { readonly gap: string } {
  const payload = event.payload;
  if (payload.encoding === "text") return { text: payload.text, standIn: false };
  if (payload.encoding === "none") return { gap: "the inbound event carries no message" };
  const value = payload.value;
  if (event.redactions.some((redaction) => redaction.path === "") && isRecord(value) && isRecord(value.unparsed)) return { text: UNPARSEABLE_STAND_IN, standIn: true };
  if (event.redactions.length > 0) return { gap: `${event.redactions.map((redaction) => redaction.path).join(", ")} was withheld at capture, and Core's handling of the message depended on it` };
  if (isRecord(value) && Object.hasOwn(value, "unserializable")) return { gap: "the message could not be written down as JSON when it was captured" };
  return { text: JSON.stringify(value), standIn: false };
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
