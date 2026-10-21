// What the trace matcher asks a reevaluator about a changed command, and
// whether it may ask at all (traces and offline trials, P5, D31-D32).
//
// It may ask only when the segment recorded after the operation at the cursor
// holds exactly one `client.action_result` for that operation's command id and
// every input in it can be read back: that one result is what an answer
// replaces, and everything else in the segment is fed as recorded. A recorded
// timeout (no result), two results, or an input the trace withheld leave
// nothing a single answer could stand in for, so the matcher answers as it
// would with no reevaluator.
//
// The request carries the trace only up to the end of that segment: the
// artifacts recorded before the next recorded operation (or the trace's end),
// and nothing a reader could reach past them, so a reevaluation never sees what
// the page went on to show after the operation it replaces.

import type { ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../trace/index.ts";
import { readClientGatewayTraceInboundText } from "../trace-replay/index.ts";
import type {
  ClientGatewayTraceMatcherDelivery,
  ClientGatewayTraceOperation,
  ClientGatewayTraceRecordedOperation,
  ClientGatewayTraceRecordedPayload,
  ClientGatewayTraceReevaluationArtifact,
  ClientGatewayTraceReevaluationRequest
} from "./types.ts";

/**
 * The request for the operation at `cursor`, the recorded result delivery an
 * answer replaces and that result's recorded envelope; `undefined` when the
 * segment holds no single readable result to replace.
 */
export async function clientGatewayTraceReevaluationRequest(input: {
  store: ClientGatewayTraceStore;
  traceId: string;
  manifest: ClientGatewayTraceManifest;
  operations: readonly ClientGatewayTraceRecordedOperation[];
  cursor: number;
  segment: readonly ClientGatewayTraceMatcherDelivery[];
  command: ClientGatewayTraceRecordedPayload;
  operation: ClientGatewayTraceOperation;
  fields: readonly string[];
}): Promise<{ readonly request: ClientGatewayTraceReevaluationRequest; readonly replaced: ClientGatewayTraceMatcherDelivery; readonly envelope: ClientGatewayTraceRecordedPayload } | undefined> {
  const recorded = input.operations[input.cursor];
  if (recorded === undefined) return undefined;
  const result = soleResult(input.segment, recorded.commandId);
  if (result === undefined) return undefined;
  const bound = input.operations[input.cursor + 1]?.sequence ?? Number.POSITIVE_INFINITY;
  const artifacts: ClientGatewayTraceReevaluationArtifact[] = input.manifest.artifacts
    .filter((artifact) => artifact.sequence < bound)
    .map((artifact) => ({ id: artifact.id, sha256: artifact.sha256, mediaType: artifact.mediaType, sequence: artifact.sequence }));
  const { store, traceId } = input;
  const request: ClientGatewayTraceReevaluationRequest = {
    traceId,
    command: input.command,
    operation: input.operation,
    recorded,
    recordedCommand: await recordedCommand(store, traceId, recorded.sequence),
    fields: input.fields,
    recordedResult: result.payload,
    artifacts,
    readArtifact: async (sha256) => {
      const listed = artifacts.find((artifact) => artifact.sha256 === sha256);
      return listed === undefined ? undefined : store.readArtifact(traceId, listed.id);
    }
  };
  return { request, replaced: result.delivery, envelope: result.envelope };
}

type RecordedResult = { readonly delivery: ClientGatewayTraceMatcherDelivery; readonly envelope: ClientGatewayTraceRecordedPayload; readonly payload: ClientGatewayTraceRecordedPayload };

/** The segment's one `client.action_result` for `commandId`; `undefined` with none, several, or any input that cannot be read back. */
function soleResult(segment: readonly ClientGatewayTraceMatcherDelivery[], commandId: string): RecordedResult | undefined {
  const found: RecordedResult[] = [];
  for (const delivery of segment) {
    if (delivery.kind !== "input") continue;
    const read = readClientGatewayTraceInboundText(delivery.event);
    if ("gap" in read) return undefined;
    if (delivery.event.messageType !== "client.action_result") continue;
    const envelope = parseRecord(read.text);
    const payload = envelope?.payload;
    if (envelope !== undefined && isRecord(payload) && payload.commandId === commandId) found.push({ delivery, envelope, payload });
  }
  return found.length === 1 ? found[0] : undefined;
}

/** The payload the recorded `server.execute_action` at `sequence` went out with; `null` when it was withheld or cannot be read back. */
async function recordedCommand(store: ClientGatewayTraceStore, traceId: string, sequence: number): Promise<ClientGatewayTraceRecordedPayload | null> {
  const [event] = await store.readEventRange(traceId, sequence, sequence);
  if (event === undefined || event.redactions.length > 0 || event.payload.encoding !== "json") return null;
  const message = event.payload.value;
  return isRecord(message) && isRecord(message.payload) ? message.payload : null;
}

function parseRecord(text: string): ClientGatewayTraceRecordedPayload | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is ClientGatewayTraceRecordedPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
