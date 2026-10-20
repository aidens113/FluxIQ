// Test support for the trace replay: a copy of a recorded trace in a fresh
// memory store, holding exactly the events a test hands it (changed, removed,
// reordered or inserted) with the recording's artifacts and manifest; and the
// claim record of a session (P3 D23), which a test may add or take away.

import { ClientGatewayTraceMemoryStore, type ClientGatewayTraceEvent } from "../../index.ts";
import type { OpenTrace } from "../../tests/trace-tap-support.ts";

/** Whether `event` is the session view a trace recorded when it first claimed a session. */
export function isClaimRecord(event: ClientGatewayTraceEvent): boolean {
  return event.kind === "lifecycle" && event.messageType === "session.claimed";
}

/** `events` in their order, numbered again from 1, so a removed or inserted event leaves no gap. */
export function renumberedEvents(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceEvent[] {
  return events.map((event, index) => ({ ...event, sequence: index + 1 }));
}

export async function recordedTraceEvents(trace: OpenTrace): Promise<readonly ClientGatewayTraceEvent[]> {
  return trace.store.readEventRange(trace.traceId, 1, Number.MAX_SAFE_INTEGER);
}

/** A store holding `events` (in sequence order) beside the artifacts and manifest `trace` recorded. */
export async function copiedTraceStore(trace: OpenTrace, events: readonly ClientGatewayTraceEvent[]): Promise<ClientGatewayTraceMemoryStore> {
  const copy = new ClientGatewayTraceMemoryStore();
  for (const artifact of await trace.store.listArtifacts(trace.traceId)) {
    const bytes = await trace.store.readArtifact(trace.traceId, artifact.id);
    if (bytes !== undefined) await copy.writeArtifact(trace.traceId, artifact.id, bytes);
  }
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  await copy.appendEvents(trace.traceId, ordered);
  const manifest = await trace.store.readManifest(trace.traceId);
  if (manifest === undefined) throw new Error("the recorded trace has no manifest");
  await copy.writeManifest(manifest);
  return copy;
}
