// Test support for the client gateway trace contract: a recorder over an
// in-memory store with a stepping clock, and event inputs written field by name.

import type {
  ClientGatewayTraceArtifactInput,
  ClientGatewayTraceCorrelationInput,
  ClientGatewayTraceEventInput,
  ClientGatewayTraceEventKind,
  ClientGatewayTracePayloadInput,
  ClientGatewayTraceRecorderOptions,
  ClientGatewayTraceRecorderStart,
  ClientGatewayTraceStoreWriter
} from "../index.ts";
import { ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder } from "../index.ts";

export const TRACE_ID = "trace-1";
const EPISODE_ID = "run-live-1";

function noCorrelation(): ClientGatewayTraceCorrelationInput {
  return { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null };
}

export function correlation(fields: Partial<ClientGatewayTraceCorrelationInput>): ClientGatewayTraceCorrelationInput {
  return { ...noCorrelation(), ...fields };
}

export function eventInput(
  payload: ClientGatewayTracePayloadInput,
  kind: Exclude<ClientGatewayTraceEventKind, "artifact"> = "inbound",
  fields: Partial<ClientGatewayTraceEventInput> = {}
): ClientGatewayTraceEventInput {
  const base: ClientGatewayTraceEventInput = {
    stream: "gateway",
    kind,
    messageType: "client.state_update",
    source: { id: "msg-1", sequence: null, timestamp: "2026-10-19T10:00:00.000Z" },
    correlation: noCorrelation(),
    payloadSchema: { name: "client-gateway.envelope", version: "1" },
    payload,
    artifactIds: [],
    redactions: []
  };
  return { ...base, ...fields };
}

export function textEvent(text: string, fields: Partial<ClientGatewayTraceEventInput> = {}): ClientGatewayTraceEventInput {
  return eventInput({ encoding: "text", text }, "inbound", fields);
}

export function artifactInput(bytes: Uint8Array): ClientGatewayTraceArtifactInput {
  return {
    stream: "artifact",
    messageType: "state_asset",
    mediaType: "image/png",
    bytes,
    resourceKey: "sha256-of-live-object",
    source: { id: null, sequence: null, timestamp: null },
    correlation: noCorrelation()
  };
}

function recorderStart(fields: Partial<ClientGatewayTraceRecorderStart> = {}): ClientGatewayTraceRecorderStart {
  const base: ClientGatewayTraceRecorderStart = {
    traceId: TRACE_ID,
    episodeId: EPISODE_ID,
    activity: "test",
    origin: { kind: "live" },
    contractVersions: { protocol: "1", domain: "web-automation@3" },
    capabilities: { actions: ["observe", "read"], tracing: true },
    context: { schema: { name: "task-context", version: "1" }, value: { goalContractVersion: "g-1", inputs: { query: "lamps" } } },
    streams: ["gateway", "control", "artifact"]
  };
  return { ...base, ...fields };
}

/** A clock that advances 10 ms per reading from a fixed origin. */
function steppingClock(startMs = Date.parse("2026-10-19T10:00:00.000Z")): () => number {
  let reading = startMs - 10;
  return () => {
    reading += 10;
    return reading;
  };
}

export function newRecorder(
  options: Partial<ClientGatewayTraceRecorderOptions> = {},
  start: Partial<ClientGatewayTraceRecorderStart> = {}
): { recorder: ClientGatewayTraceRecorder; store: ClientGatewayTraceMemoryStore } {
  const store = new ClientGatewayTraceMemoryStore();
  const writer: ClientGatewayTraceStoreWriter = options.store ?? store;
  const recorder = new ClientGatewayTraceRecorder(recorderStart(start), {
    store: writer,
    now: options.now ?? steppingClock(),
    maxBufferedEvents: options.maxBufferedEvents ?? 100,
    maxBufferedArtifactBytes: options.maxBufferedArtifactBytes ?? 1_000_000
  });
  return { recorder, store };
}

/** A store writer whose writes fail from the `failAfter`-th call on. */
export function failingWriter(inner: ClientGatewayTraceStoreWriter, failAfter: number): ClientGatewayTraceStoreWriter {
  let calls = 0;
  const gate = (): void => {
    calls += 1;
    if (calls > failAfter) throw new Error("disk full");
  };
  return {
    async writeArtifact(traceId, artifactId, bytes) {
      gate();
      await inner.writeArtifact(traceId, artifactId, bytes);
    },
    async appendEvents(traceId, events) {
      gate();
      await inner.appendEvents(traceId, events);
    },
    async writeManifest(manifest) {
      gate();
      await inner.writeManifest(manifest);
    }
  };
}
