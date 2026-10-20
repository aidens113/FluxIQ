// Marks an action command Core is tracing (D12): `metadata.trace =
// { artifacts: true, scope }` on a copy of the message, so the client may
// capture and upload what it observed for it. `scope` is the id of the trace
// the command is recorded into: a client that uploads each artifact only once
// keeps that record per scope, so every trace receives each artifact its
// results reference. The command's own metadata is kept; nothing the caller
// holds is mutated.

import { CLIENT_GATEWAY_TRACE_METADATA_KEY, type ClientGatewayServerMessage, type ClientGatewayTraceRequest } from "@fluxiq/contracts/client-gateway";

type ActionMessage = Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>;

/** `scope`: the id of the trace the command is recorded into. */
export function clientGatewayTraceStampedAction(message: ActionMessage, scope: string): ActionMessage {
  const request: ClientGatewayTraceRequest = { artifacts: true, scope };
  const metadata = { ...(message.payload.metadata ?? {}), [CLIENT_GATEWAY_TRACE_METADATA_KEY]: request };
  return { ...message, payload: { ...message.payload, metadata } };
}
