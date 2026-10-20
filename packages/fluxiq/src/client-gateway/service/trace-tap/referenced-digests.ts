// The artifact digests a client's inbound result references (D14): the
// `sha256` of each entry of `metadata.trace.artifacts` on an action result, or
// on the landed result a reconcile answer carries. The tap records them on the
// inbound event, so completeness can check that each artifact reached that
// trace. Only well-formed digests (lower-case hex SHA-256) count; anything else
// a client wrote there is ignored, and the raw text keeps it regardless.

import { CLIENT_GATEWAY_TRACE_METADATA_KEY } from "@fluxiq/contracts/client-gateway";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const NONE: readonly string[] = Object.freeze([]);

/** The distinct well-formed digests `message` references, in order; none for any other message. */
export function clientGatewayTraceReferencedDigests(message: unknown): readonly string[] {
  const result = resultOf(message);
  if (!isRecord(result) || !isRecord(result.metadata)) return NONE;
  const trace = result.metadata[CLIENT_GATEWAY_TRACE_METADATA_KEY];
  if (!isRecord(trace) || !Array.isArray(trace.artifacts)) return NONE;
  const digests = new Set<string>();
  for (const artifact of trace.artifacts) {
    const sha256 = isRecord(artifact) ? artifact.sha256 : undefined;
    if (typeof sha256 === "string" && SHA256_HEX.test(sha256)) digests.add(sha256);
  }
  return digests.size === 0 ? NONE : Object.freeze([...digests]);
}

function resultOf(message: unknown): unknown {
  if (!isRecord(message)) return undefined;
  if (message.type === "client.action_result") return message.payload;
  if (message.type !== "client.reconcile_result" || !isRecord(message.payload)) return undefined;
  return message.payload.result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
