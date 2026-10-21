// What the trace delivered to Core for one session, cut at its recorded
// operations (traces and offline trials, P4b; source plan 7.3). The `opening`
// is what arrived before the first operation; segment `i` is what arrived after
// operation `i` and before operation `i + 1` (or the trace's end), in recorded
// order: the answers to that operation, late answers to earlier ones, and
// unsolicited inputs. A segment is handed over only once its operation is
// matched, so nothing recorded after the matched point is ever delivered.
//
// Delivered: the session's inbound messages, except the ones that establish a
// session (`client.hello`, `client.pairing_submit`: attaching the session under
// its scope stands for them), and the artifacts it uploaded. Not delivered:
// outbound messages, dispositions, lifecycle records and other sessions'
// events, which Core derives or which belong to no input of this session. A
// recorded `answer_never_came` for a matched command is a deadline: nothing is
// fed, and the clock is moved past the recorded wait so the trial gateway's own
// timeout logic runs at its logical time.

import type { ClientGatewayTraceEvent } from "../trace/index.ts";
import type { ClientGatewayTraceMatcherDeliveries, ClientGatewayTraceMatcherDelivery, ClientGatewayTraceRecordedOperation } from "./types.ts";

const SESSION_ESTABLISHMENT: ReadonlySet<string> = new Set(["client.hello", "client.pairing_submit"]);

export function clientGatewayTraceRecordedDeliveries(
  events: readonly ClientGatewayTraceEvent[],
  operations: readonly ClientGatewayTraceRecordedOperation[],
  sessionRef: string | null
): ClientGatewayTraceMatcherDeliveries {
  const opening: ClientGatewayTraceMatcherDelivery[] = [];
  const segments: ClientGatewayTraceMatcherDelivery[][] = operations.map(() => []);
  const issuedAt = new Map(operations.map((operation) => [operation.commandId, operation.logicalMs]));
  for (const event of events) {
    const delivery = sessionRef === null ? undefined : deliveryOf(event, sessionRef, issuedAt);
    if (delivery === undefined) continue;
    const index = lastOperationBefore(operations, event.sequence);
    if (index >= 0) segments[index]?.push(delivery);
    else if (delivery.kind !== "deadline") opening.push(delivery);
  }
  return { opening, segments };
}

function deliveryOf(event: ClientGatewayTraceEvent, sessionRef: string, issuedAt: ReadonlyMap<string, number>): ClientGatewayTraceMatcherDelivery | undefined {
  const atMs = event.time.logicalMs;
  if (event.kind === "inbound" && event.session === sessionRef && !SESSION_ESTABLISHMENT.has(event.messageType ?? "")) return { kind: "input", event, atMs };
  if (event.kind === "artifact" && event.session === sessionRef) return { kind: "artifact", event, atMs };
  if (event.kind !== "synthesized" || event.correlation.commandId === null) return undefined;
  const issued = issuedAt.get(event.correlation.commandId);
  const outcome = event.payload.encoding === "json" ? event.payload.value : null;
  if (issued === undefined || !isRecord(outcome) || outcome.outcome !== "answer_never_came") return undefined;
  const waitMs = typeof outcome.waitMs === "number" ? outcome.waitMs : 0;
  return { kind: "deadline", event, atMs: Math.max(atMs, issued + waitMs + 1) };
}

/** The index of the last operation delivered before `sequence`, or -1. */
function lastOperationBefore(operations: readonly ClientGatewayTraceRecordedOperation[], sequence: number): number {
  let index = -1;
  for (const [position, operation] of operations.entries()) {
    if (operation.sequence >= sequence) break;
    index = position;
  }
  return index;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
