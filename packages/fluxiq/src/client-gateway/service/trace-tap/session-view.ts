// The public view of a session a trace records when it first claims it
// (traces and offline trials, P3 D23): what a replay needs to attach the
// session as it was -- its client type, name, version, capabilities (reconcile
// eligibility, the activity stream) and metadata. Each field is read by name,
// so a token, a pairing code, a socket or anything else a session record
// carries never reaches the trace.

import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTraceSessionView } from "./types.ts";

export function clientGatewayTraceSessionView(session: ClientGatewaySession): ClientGatewayTraceSessionView {
  return {
    clientType: session.clientType,
    name: session.name,
    version: session.version ?? null,
    capabilities: session.capabilities,
    metadata: session.metadata ?? null
  };
}
