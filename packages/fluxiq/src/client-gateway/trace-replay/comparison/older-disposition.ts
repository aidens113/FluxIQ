// A disposition recorded under schema version 1 (before P3 C1) holds Core's
// disposition and error for a message, but not `delivered`: the digests of the
// result and event Core handed on. It is compared on the fields it carries: the
// replay's disposition is read as version 1 would have written it (the same
// schema name at version 1, its payload without `delivered`, key order kept),
// so a difference in any field v1 recorded is still a divergence, classified
// as any other. When nothing else differs, the point is a capture gap on
// `payload.value.delivered` (`gap`): what Core delivered could not be compared.

import { CLIENT_GATEWAY_TRACE_TAP_SCHEMAS } from "../../service/index.ts";
import type { ClientGatewayTraceEvent, ClientGatewayTraceJsonValue } from "../../trace/index.ts";

const OLDER_VERSION = "1";
const MISSING_FIELD = "payload.value.delivered";
const GAP = "the disposition was recorded under schema version 1, which does not record what Core delivered for the message; every field it records matched";

/** What a version 1 disposition is compared against, and the gap it leaves when nothing else differs. */
export type ClientGatewayTraceOlderDispositionView = {
  /** The replay's disposition as version 1 would have recorded it. */
  readonly event: ClientGatewayTraceEvent;
  /** The field version 1 lacks. */
  readonly field: string;
  readonly gap: string;
};

/** `replay` read as a version 1 disposition, when `recorded` is one and `replay` a current one; otherwise `undefined`. */
export function clientGatewayTraceOlderDispositionView(recorded: ClientGatewayTraceEvent, replay: ClientGatewayTraceEvent): ClientGatewayTraceOlderDispositionView | undefined {
  const current = CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.disposition;
  if (recorded.kind !== "disposition" || replay.kind !== "disposition") return undefined;
  if (recorded.payloadSchema?.name !== current.name || recorded.payloadSchema.version !== OLDER_VERSION) return undefined;
  if (replay.payloadSchema?.name !== current.name || replay.payloadSchema.version !== current.version) return undefined;
  const value = replay.payload.encoding === "json" ? replay.payload.value : null;
  if (!isRecord(value)) return undefined;
  const older: { [key: string]: ClientGatewayTraceJsonValue } = {};
  for (const [key, field] of Object.entries(value)) if (key !== "delivered") older[key] = field;
  const event: ClientGatewayTraceEvent = { ...replay, payloadSchema: { name: current.name, version: OLDER_VERSION }, payload: { encoding: "json", value: older } };
  return { event, field: MISSING_FIELD, gap: GAP };
}

function isRecord(value: unknown): value is { readonly [key: string]: ClientGatewayTraceJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
