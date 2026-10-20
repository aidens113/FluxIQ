// The fields at which a replayed event differs from the recorded one it is
// aligned with (traces and offline trials, P3). Compared: kind, stream,
// message type, session reference, the client's source id and time, every
// correlation (a cause by the alignment key of the event it names), the
// payload schema and the payload -- an inbound text byte for byte, a
// structured payload with its key order -- the referenced digests and the
// redactions. Not compared are the fields `normalizations.ts` names, and the
// payload of an input the replay fed as a stand-in. On the replay's side a
// session id is first translated into the recorded one it stands for.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { clientGatewayTraceJsonDifferences } from "./json-differences.ts";

/** One side of a comparison: an event, and the alignment keys and session translation of its trace. */
export type ClientGatewayTraceComparedSide = {
  readonly event: ClientGatewayTraceEvent;
  readonly keys: ReadonlyMap<string, string>;
  /** A session id this trace minted, to the recorded one it stands for. */
  readonly sessionIds: ReadonlyMap<string, string>;
};

export function clientGatewayTraceEventDifferences(recorded: ClientGatewayTraceComparedSide, replayed: ClientGatewayTraceComparedSide, standIn: boolean): string[] {
  const differences = clientGatewayTraceJsonDifferences(described(recorded), described(replayed), "", false);
  if (standIn) return differences;
  const payload = clientGatewayTraceJsonDifferences(translated(recorded.event.payload, recorded.sessionIds), translated(replayed.event.payload, replayed.sessionIds), "payload", true);
  return [...differences, ...payload];
}

/** Everything compared but the payload. */
function described(side: ClientGatewayTraceComparedSide): unknown {
  const event = side.event;
  const correlation = event.correlation;
  const cause = correlation.causationEventId;
  return {
    kind: event.kind,
    stream: event.stream,
    messageType: event.messageType,
    session: event.session ?? null,
    source: { id: event.source.id, sequence: event.source.sequence, timestamp: event.time.sourceTimestamp },
    correlation: {
      commandId: correlation.commandId,
      recordingId: correlation.recordingId,
      causation: cause === null ? null : side.keys.get(cause) ?? `unkeyed:${cause}`,
      owner: correlation.owner,
      observationRevision: correlation.observationRevision,
      baseRevision: correlation.baseRevision
    },
    payloadSchema: event.payloadSchema,
    referencedDigests: event.referencedDigests,
    redactions: event.redactions
  };
}

/** `value` with every string that is a translated session id replaced by the recorded one. */
function translated(value: unknown, sessionIds: ReadonlyMap<string, string>): unknown {
  if (sessionIds.size === 0) return value;
  if (typeof value === "string") return sessionIds.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item: unknown) => translated(item, sessionIds));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, translated(field, sessionIds)]));
}
