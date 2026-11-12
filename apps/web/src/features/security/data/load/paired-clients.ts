import { asRecord } from "../../../home/model";
import { shapePairedClient, type Guarded, type PairedClientRow } from "../../model";

/** The paired browsers (`GET /api/client-gateway/snapshot`, its `trustedClients`). Throws when the read fails for any reason but being refused. */
export async function loadPairedClients(signal: AbortSignal): Promise<Guarded<PairedClientRow[]>> {
  const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store", signal });
  if (response.status === 403) return { state: "denied" };
  if (!response.ok) throw new Error("client gateway snapshot failed");
  const body = asRecord(await response.json());
  if (body?.ok !== true) throw new Error("client gateway snapshot failed");
  const trusted = asRecord(body.payload)?.trustedClients;
  const rows = (Array.isArray(trusted) ? trusted : []).flatMap((raw) => {
    const row = shapePairedClient(raw);
    return row ? [row] : [];
  });
  return { state: "ready", data: rows };
}
