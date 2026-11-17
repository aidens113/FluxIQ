import { asRecord } from "../../home/model";
import { shapePairedClient, type PairedClientRow } from "../../security/model";
import { connectInfo, type ConnectInfo } from "./connect-info";
import { pendingPairings, type PendingPairing } from "./pending-pairing";

export type ConnectView = { info: ConnectInfo; pending: PendingPairing[]; clients: PairedClientRow[]; discoveryFailed: boolean };

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

/** Reads the gateway snapshot (waiting requests, paired clients, gateway address) and the discovery document. Throws when the snapshot cannot be read; a missing discovery document only leaves its fields blank. */
export async function loadConnect(signal: AbortSignal, origin: string, now: number): Promise<ConnectView> {
  const [snapshot, discovery] = await Promise.all([
    readJson("/api/client-gateway/snapshot", signal),
    readJson("/.well-known/fluxiq", signal).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }))
  ]);
  const body = asRecord(snapshot);
  if (body?.ok !== true) throw new Error("client gateway snapshot failed");
  const payload = asRecord(body.payload);
  const trusted = Array.isArray(payload?.trustedClients) ? payload.trustedClients : [];
  return {
    info: connectInfo(discovery.ok ? discovery.value : undefined, payload?.publicUrl ?? asRecord(payload?.webRuntime)?.clientGatewayPublicUrl, origin),
    pending: pendingPairings(payload?.pairings, now),
    clients: trusted.flatMap((raw) => {
      const row = shapePairedClient(raw);
      return row ? [row] : [];
    }),
    discoveryFailed: !discovery.ok
  };
}
