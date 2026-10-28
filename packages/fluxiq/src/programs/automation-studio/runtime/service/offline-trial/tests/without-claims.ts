// Test support: a recorded trace as it would read had it been captured before
// claim records existed, so an offline trial's session view can be shown to
// come from the caller when the trace recorded none.

import { ClientGatewayTraceMemoryStore, type ClientGatewayTraceEvent } from "../../../../../../client-gateway/index.ts";

function isClaimRecord(event: ClientGatewayTraceEvent): boolean {
  return event.kind === "lifecycle" && event.messageType === "session.claimed";
}

/** A copy of `traceId` (which holds no artifact) in a fresh store without its claim records, numbered again, its last sequence lowered to match: a trace captured before they existed. */
export async function withoutClaims(source: ClientGatewayTraceMemoryStore, traceId: string): Promise<ClientGatewayTraceMemoryStore> {
  const copy = new ClientGatewayTraceMemoryStore();
  const events = await source.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
  if (!events.some(isClaimRecord)) throw new Error("the recorded trace holds no claim record to remove");
  const kept = events.filter((event) => !isClaimRecord(event)).map((event, index) => ({ ...event, sequence: index + 1 }));
  if ((await source.listArtifacts(traceId)).length > 0) throw new Error("the recorded trace holds artifacts, which this copy would drop");
  await copy.appendEvents(traceId, kept);
  const manifest = await source.readManifest(traceId);
  if (manifest === undefined) throw new Error("the recorded trace has no manifest");
  await copy.writeManifest({ ...manifest, completeness: { ...manifest.completeness, lastSequence: kept.length } });
  return copy;
}
