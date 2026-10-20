// The hello a replay attaches a session that existed before the trace began
// with (traces and offline trials, P3 D23), before it is read field by field
// (`./hello.ts`): the public view the trace recorded when it first claimed the
// session, under the recorded client id; else, for a trace without that record,
// a custom client with the capabilities the trace records, if any.

import type { ClientGatewayTraceRecordedSession } from "../types.ts";

export function clientGatewayTraceStandInHello(session: ClientGatewayTraceRecordedSession, clientId: string): { readonly [key: string]: unknown } {
  const view = session.claimedView;
  if (view === null) return { clientId, clientType: "custom", name: clientId, capabilities: session.capabilities ?? [] };
  return { clientId, clientType: view.clientType, name: view.name ?? clientId, version: view.version, capabilities: view.capabilities, metadata: view.metadata };
}
