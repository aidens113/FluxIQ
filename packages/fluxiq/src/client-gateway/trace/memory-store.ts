// An in-memory trace store with the indexed reads a replay needs (source plan
// 5.5): an event range by sequence, events by correlation id, artifact bytes
// by id, and the manifest. It keeps deep-frozen copies of what it is handed and
// returns fresh copies of artifact bytes, so neither a writer nor a reader can
// alter stored evidence. The persisted store is P2; this one serves tests and
// in-process use.

import { clientGatewayTraceArtifactDigest } from "./artifact-digest.ts";
import { cloneClientGatewayTraceJson } from "./clone-json.ts";
import type {
  ClientGatewayTraceArtifactPresence,
  ClientGatewayTraceCorrelationKey,
  ClientGatewayTraceEvent,
  ClientGatewayTraceManifest,
  ClientGatewayTraceStore
} from "./types.ts";

type StoredArtifact = { readonly bytes: Uint8Array; readonly presence: ClientGatewayTraceArtifactPresence };

type StoredTrace = {
  manifest: ClientGatewayTraceManifest | undefined;
  readonly events: ClientGatewayTraceEvent[];
  /** `key \0 value` to positions in `events`. */
  readonly correlation: Map<string, number[]>;
  readonly artifacts: Map<string, StoredArtifact>;
};

const CORRELATION_KEYS: readonly ClientGatewayTraceCorrelationKey[] = ["commandId", "recordingId", "causationEventId"];

export class ClientGatewayTraceMemoryStore implements ClientGatewayTraceStore {
  private readonly traces = new Map<string, StoredTrace>();

  async writeArtifact(traceId: string, artifactId: string, bytes: Uint8Array): Promise<void> {
    const trace = this.traceFor(traceId);
    const copy = new Uint8Array(bytes);
    const presence = Object.freeze({ id: artifactId, sha256: clientGatewayTraceArtifactDigest(copy), byteLength: copy.byteLength });
    const existing = trace.artifacts.get(artifactId);
    if (existing !== undefined && existing.presence.sha256 !== presence.sha256) {
      throw new Error(`artifact ${artifactId} of trace ${traceId} is already stored with different contents`);
    }
    trace.artifacts.set(artifactId, { bytes: copy, presence });
  }

  /** Appends in strictly increasing sequence order; all or nothing. */
  async appendEvents(traceId: string, events: readonly ClientGatewayTraceEvent[]): Promise<void> {
    const trace = this.traceFor(traceId);
    let last = trace.events.at(-1)?.sequence ?? 0;
    for (const event of events) {
      if (event.traceId !== traceId) throw new Error(`event ${event.eventId} belongs to trace ${event.traceId}, not ${traceId}`);
      if (!Number.isInteger(event.sequence) || event.sequence <= last) throw new Error(`event sequence ${event.sequence} does not follow ${last} in trace ${traceId}`);
      last = event.sequence;
    }
    for (const event of events) {
      const position = trace.events.length;
      trace.events.push(frozenCopy(event));
      for (const key of CORRELATION_KEYS) {
        const value = event.correlation[key];
        if (value === null) continue;
        const indexKey = `${key}\u0000${value}`;
        const positions = trace.correlation.get(indexKey) ?? [];
        positions.push(position);
        trace.correlation.set(indexKey, positions);
      }
    }
  }

  async writeManifest(manifest: ClientGatewayTraceManifest): Promise<void> {
    this.traceFor(manifest.traceId).manifest = frozenCopy(manifest);
  }

  async readManifest(traceId: string): Promise<ClientGatewayTraceManifest | undefined> {
    return this.traces.get(traceId)?.manifest;
  }

  async readEventRange(traceId: string, from: number, to: number): Promise<readonly ClientGatewayTraceEvent[]> {
    const events = this.existing(traceId).events;
    const range: ClientGatewayTraceEvent[] = [];
    for (let position = firstAtOrAfter(events, from); position < events.length; position += 1) {
      const event = events[position];
      if (event === undefined || event.sequence > to) break;
      range.push(event);
    }
    return Object.freeze(range);
  }

  async readEventsByCorrelation(traceId: string, key: ClientGatewayTraceCorrelationKey, value: string): Promise<readonly ClientGatewayTraceEvent[]> {
    const trace = this.existing(traceId);
    const positions = trace.correlation.get(`${key}\u0000${value}`) ?? [];
    const matches: ClientGatewayTraceEvent[] = [];
    for (const position of positions) {
      const event = trace.events[position];
      if (event !== undefined) matches.push(event);
    }
    return Object.freeze(matches);
  }

  async readArtifact(traceId: string, artifactId: string): Promise<Uint8Array | undefined> {
    const stored = this.existing(traceId).artifacts.get(artifactId);
    return stored === undefined ? undefined : new Uint8Array(stored.bytes);
  }

  async listArtifacts(traceId: string): Promise<readonly ClientGatewayTraceArtifactPresence[]> {
    return Object.freeze([...this.existing(traceId).artifacts.values()].map((stored) => stored.presence));
  }

  private traceFor(traceId: string): StoredTrace {
    const known = this.traces.get(traceId);
    if (known !== undefined) return known;
    const created: StoredTrace = { manifest: undefined, events: [], correlation: new Map(), artifacts: new Map() };
    this.traces.set(traceId, created);
    return created;
  }

  /** A trace nothing was written for is an error, not an empty answer. */
  private existing(traceId: string): StoredTrace {
    const known = this.traces.get(traceId);
    if (known === undefined) throw new Error(`trace ${traceId} is not in this store`);
    return known;
  }
}

/** Position of the first event whose sequence is at least `sequence`. */
function firstAtOrAfter(events: readonly ClientGatewayTraceEvent[], sequence: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const event = events[middle];
    if (event !== undefined && event.sequence < sequence) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Manifests and events are plain JSON data; the store keeps its own deep-frozen copy. */
function frozenCopy<T extends ClientGatewayTraceManifest | ClientGatewayTraceEvent>(value: T): T {
  return cloneClientGatewayTraceJson(value) as unknown as T;
}
