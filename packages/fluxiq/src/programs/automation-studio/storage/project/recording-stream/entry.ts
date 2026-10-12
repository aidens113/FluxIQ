import { createHash } from "node:crypto";
import type { AutomationStudioChunkEvent } from "../event-chunk-store.ts";

/** The recording envelope and identity rules shared by chunk replay and its derived index. */
export const automationStudioRecordingEntry = {
  encode(entry: AutomationStudioChunkEvent, sequence: number): AutomationStudioChunkEvent {
    return { sequence, timestamp: entry.timestamp, schemaVersion: "automation-studio.recording-entry.v1", entry };
  },
  removal(removed: string[] | { id: string; publicSequence: number; bodyDigest: string; incarnationCursor: number }[], sequence: number): AutomationStudioChunkEvent {
    return typeof removed[0] === "string" ? { sequence, schemaVersion: "automation-studio.recording-removal.v1", removedIds: removed }
      : { sequence, schemaVersion: "automation-studio.recording-removal.v2", removed };
  },
  decode(event: AutomationStudioChunkEvent): AutomationStudioChunkEvent | null {
    if (typeof event.id === "string" || typeof event.type === "string") return event;
    if (event.schemaVersion === "automation-studio.recording-removal.v1" || event.schemaVersion === "automation-studio.recording-removal.v2") return null;
    if (event.schemaVersion !== "automation-studio.recording-entry.v1" || !event.entry || typeof event.entry !== "object" || Array.isArray(event.entry)) throw new Error("Invalid recording storage envelope.");
    return event.entry as AutomationStudioChunkEvent;
  },
  digest(entry: AutomationStudioChunkEvent): string {
    return createHash("sha256").update(JSON.stringify(canonical(JSON.parse(JSON.stringify(entry))))).digest("hex");
  },
  captureDigest(entry: AutomationStudioChunkEvent): string {
    const { id: _id, recordingId: _recording, sequence: _sequence, timestamp: _timestamp, monotonicOffsetMs: _offset, ...input } = entry;
    // Caller-supplied event/correlation/metadata remain input identity; generated fields do not.
    return createHash("sha256").update(JSON.stringify(canonical(JSON.parse(JSON.stringify(input))))).digest("hex");
  },
  packetKey(entry: AutomationStudioChunkEvent): string | null {
    const metadata = entry.metadata as { eventId?: unknown } | undefined;
    const event = typeof metadata?.eventId === "string" ? metadata.eventId : null;
    const correlation = typeof entry.correlationId === "string" ? entry.correlationId : null;
    return event || correlation ? JSON.stringify([entry.sourceId ?? null, event, correlation]) : null;
  },
  samePacket(left: string | null, right: string | null): boolean {
    if (left === null || right === null) return false;
    const a = JSON.parse(left) as unknown[];
    const b = JSON.parse(right) as unknown[];
    return a[0] === b[0] && ((a[1] !== null && a[1] === b[1]) || (a[2] !== null && a[2] === b[2]));
  },
  removalProofs(event: AutomationStudioChunkEvent): { id: string; publicSequence?: number; bodyDigest?: string; incarnationCursor?: number }[] {
    if (event.schemaVersion === "automation-studio.recording-removal.v1" && Array.isArray(event.removedIds) && event.removedIds.every(id => typeof id === "string")) return event.removedIds.map(id => ({ id }));
    if (event.schemaVersion !== "automation-studio.recording-removal.v2" || !Array.isArray(event.removed)) throw new Error("Invalid recording removal control.");
    return event.removed.map(item => {
      const proof = item as { id: string; publicSequence: number; bodyDigest: string; incarnationCursor: number };
      if (!proof || typeof proof.id !== "string" || !Number.isSafeInteger(proof.publicSequence) || proof.publicSequence < 0 || !Number.isSafeInteger(proof.incarnationCursor) || proof.incarnationCursor < 1 || typeof proof.bodyDigest !== "string" || !/^[a-f0-9]{64}$/.test(proof.bodyDigest)) throw new Error("Invalid recording removal proof.");
      return proof;
    });
  },
  actionLike(event: unknown): boolean {
    const value = event as { type?: unknown; actionType?: unknown; eventType?: unknown };
    return value.type === "action" || value.type === "domain_event" || typeof value.actionType === "string" || typeof value.eventType === "string";
  },
  stateLike(event: unknown): boolean {
    const value = event as { type?: unknown; observationType?: unknown };
    return value.type === "state_checkpoint" || value.observationType === "client.state_snapshot";
  }
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => [key, canonical(nested)]));
  return value;
}
