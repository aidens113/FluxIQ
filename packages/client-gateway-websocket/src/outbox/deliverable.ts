import type { ClientGatewayOutboxBinding, ClientGatewayOutboxEntry } from "./types.ts";

/**
 * Splits queued entries, in queue order, into those a flush may deliver now and
 * those it drops.
 *
 * An entry is delivered when its lineage and project equal `current`'s and its
 * recording is none, the current recording, or a recording whose own
 * `client.stop_recording` is queued under the same lineage and project (it
 * ended while the socket was down). Every other entry is dropped: it belongs to
 * a trust lineage, project or recording the client is no longer in, and
 * sending it would file it under the wrong owner.
 */
export function clientGatewayOutboxDeliverable(
  entries: readonly ClientGatewayOutboxEntry[],
  current: ClientGatewayOutboxBinding
): { deliver: ClientGatewayOutboxEntry[]; dropped: ClientGatewayOutboxEntry[] } {
  const ours = (entry: ClientGatewayOutboxEntry) =>
    entry.binding.session === current.session && entry.binding.projectId === current.projectId;
  const endedInQueue = new Set<string>();
  for (const entry of entries) {
    if (entry.message.type === "client.stop_recording" && ours(entry)) endedInQueue.add(entry.message.payload.recordingId);
  }
  const deliver: ClientGatewayOutboxEntry[] = [];
  const dropped: ClientGatewayOutboxEntry[] = [];
  for (const entry of entries) {
    const recordingId = entry.binding.recordingId;
    const recordingMatches = recordingId === null || recordingId === current.recordingId || endedInQueue.has(recordingId);
    (ours(entry) && recordingMatches ? deliver : dropped).push(entry);
  }
  return { deliver, dropped };
}
