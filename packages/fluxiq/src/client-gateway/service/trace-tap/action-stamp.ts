// Marks an action command Core is tracing (D12): `metadata.trace =
// { artifacts: true }` on a copy of the message, so the client may capture and
// upload what it observed for it. The command's own metadata is kept; nothing
// the caller holds is mutated.

import { CLIENT_GATEWAY_TRACE_METADATA_KEY, type ClientGatewayServerMessage, type ClientGatewayTraceRequest } from "@fluxiq/contracts/client-gateway";

type ActionMessage = Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>;

export function clientGatewayTraceStampedAction(message: ActionMessage): ActionMessage {
  const request: ClientGatewayTraceRequest = { artifacts: true };
  const metadata = { ...(message.payload.metadata ?? {}), [CLIENT_GATEWAY_TRACE_METADATA_KEY]: request };
  return { ...message, payload: { ...message.payload, metadata } };
}
