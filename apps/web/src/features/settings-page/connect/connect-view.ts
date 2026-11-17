import { asRecord } from "../../home/model";
import { shapePairedClient, type PairedClientRow } from "../../security/model";
import { connectInfo, type ConnectInfo } from "./connect-info";
import type { DiscoveryRead } from "./load-discovery";
import { pendingPairings, type PendingPairing } from "./pending-pairing";

export type ConnectView = { info: ConnectInfo; pending: PendingPairing[]; clients: PairedClientRow[]; discoveryFailed: boolean };

/** The connect view from a gateway snapshot payload (waiting requests, paired clients, gateway address) and the discovery document; a missing discovery document only leaves its fields blank. */
export function connectView(payload: Readonly<Record<string, unknown>>, discovery: DiscoveryRead, origin: string, now: number): ConnectView {
  const trusted = Array.isArray(payload.trustedClients) ? payload.trustedClients : [];
  return {
    info: connectInfo(discovery.ok ? discovery.value : undefined, payload.publicUrl ?? asRecord(payload.webRuntime)?.clientGatewayPublicUrl, origin),
    pending: pendingPairings(payload.pairings, now),
    clients: trusted.flatMap((raw) => {
      const row = shapePairedClient(raw);
      return row ? [row] : [];
    }),
    discoveryFailed: !discovery.ok
  };
}
