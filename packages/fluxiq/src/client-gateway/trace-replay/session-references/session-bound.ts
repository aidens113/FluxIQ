// Whether one recorded event belongs to a client session, read from the event
// itself. Only the gateway tap gives events a session reference (P3), and it
// writes only to its own streams (`CLIENT_GATEWAY_TRACE_TAP_STREAMS`: messages,
// dispositions and lifecycle on `gateway`, client uploads on `artifact`, both
// since capture began in P2). An event a host records on a stream of its own --
// Automation Studio's `control` stream, the artifacts its control events carry
// included -- belongs to no session, which is what the trace contract says of
// an event without `session` (`../../trace/types.ts`). Counting such an
// artifact as session-bound made every trace carrying one read as "partly
// named" and refused its replay (t986, a fresh capture's start receipt).

import { CLIENT_GATEWAY_TRACE_TAP_STREAMS } from "../../service/index.ts";
import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS } from "./bound-kinds.ts";

const TAP_STREAMS: ReadonlySet<string> = new Set(Object.values(CLIENT_GATEWAY_TRACE_TAP_STREAMS));

/** One of the kinds the tap marks with a session reference, on a stream the tap writes. */
export function clientGatewayTraceEventSessionBound(event: Pick<ClientGatewayTraceEvent, "kind" | "stream">): boolean {
  return CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS.has(event.kind) && TAP_STREAMS.has(event.stream);
}
