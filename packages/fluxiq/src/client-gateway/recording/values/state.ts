import type { StateSnapshot } from "@fluxiq/contracts/state";
import type { ClientGatewaySession } from "../../contracts.ts";
export function emptyClientStateSnapshot(session: ClientGatewaySession): StateSnapshot {
  return {
    timestamp: Date.now(),
    namespaces: {
      client: {
        schemaId: "fluxiq.client-gateway.client-state",
        schemaVersion: "0.1",
        values: {
          clientId: { type: "string", value: session.clientId, observedAt: Date.now(), sourceId: `client.${session.clientId}.events` },
          clientType: { type: "string", value: session.clientType, observedAt: Date.now(), sourceId: `client.${session.clientId}.events` }
        }
      }
    }
  };
}
