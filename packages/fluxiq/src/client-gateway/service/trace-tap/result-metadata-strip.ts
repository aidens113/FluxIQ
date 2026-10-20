// Takes a client's trace references off an inbound result before anything
// reads it (D14): `metadata.trace` of an action result, and of the landed
// result a reconcile answer carries. The recorded raw text keeps them; no
// settle, event, run, recording or model ever meets them. A message without
// them is returned as it is, the same object.

import { CLIENT_GATEWAY_TRACE_METADATA_KEY, type ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";

export function withoutClientGatewayTraceMetadata(message: ClientGatewayClientMessage): ClientGatewayClientMessage {
  if (message?.type === "client.action_result") {
    const payload = withoutTrace(message.payload);
    return payload === message.payload ? message : { ...message, payload };
  }
  if (message?.type === "client.reconcile_result") {
    const answer = message.payload;
    if (!isRecord(answer) || !isRecord(answer.result)) return message;
    const result = withoutTrace(answer.result);
    return result === answer.result ? message : { ...message, payload: { ...answer, result } };
  }
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `result` without `metadata.trace`; `metadata` itself goes when the trace was all it held. */
function withoutTrace<T>(result: T): T {
  if (!isRecord(result) || !isRecord(result.metadata) || !Object.hasOwn(result.metadata, CLIENT_GATEWAY_TRACE_METADATA_KEY)) return result;
  const metadata: Record<string, unknown> = { ...result.metadata };
  delete metadata[CLIENT_GATEWAY_TRACE_METADATA_KEY];
  const copy: Record<string, unknown> = { ...result };
  if (Object.keys(metadata).length > 0) copy.metadata = metadata;
  else delete copy.metadata;
  return copy as T;
}
