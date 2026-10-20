// The trace recorder: the sink the client gateway records through (source plan
// 5.4). `record` assigns the delivery sequence and takes a deep-frozen copy
// synchronously, so the order is the order Core received things in and later
// mutation of a live object cannot reach the trace (T04). Events wait in a
// bounded in-memory buffer until `flush` writes them to a store: artifacts,
// then events, then the manifest, so a reader never meets a reference to bytes
// not yet written.
//
// Nothing is dropped silently. The sink never throws into the gateway; an
// event it cannot keep -- a payload it cannot copy, a full buffer, a store
// that failed -- still takes its sequence and is declared as a loss, which
// marks the trace incomplete at once. Repeated identical events are separate
// deliveries with their own ids and sequences.

import { clientGatewayTraceArtifactDigest } from "./artifact-digest.ts";
import { cloneClientGatewayTraceJson } from "./clone-json.ts";
import type {
  ClientGatewayTraceActivity,
  ClientGatewayTraceArtifactEntry,
  ClientGatewayTraceArtifactInput,
  ClientGatewayTraceCheckpoint,
  ClientGatewayTraceCheckpointInput,
  ClientGatewayTraceCheckpointResult,
  ClientGatewayTraceClockOrigin,
  ClientGatewayTraceCloseInput,
  ClientGatewayTraceCompletenessStatus,
  ClientGatewayTraceContext,
  ClientGatewayTraceCorrelationInput,
  ClientGatewayTraceEvent,
  ClientGatewayTraceEventInput,
  ClientGatewayTraceEventKind,
  ClientGatewayTraceJsonValue,
  ClientGatewayTraceLoss,
  ClientGatewayTraceLossReason,
  ClientGatewayTraceManifest,
  ClientGatewayTraceOrigin,
  ClientGatewayTracePayload,
  ClientGatewayTracePayloadInput,
  ClientGatewayTraceProvenance,
  ClientGatewayTraceRecordResult,
  ClientGatewayTraceRedaction,
  ClientGatewayTraceSchemaRef,
  ClientGatewayTraceSink,
  ClientGatewayTraceSinkStatus,
  ClientGatewayTraceSourceInput,
  ClientGatewayTraceStoreWriter,
  ClientGatewayTraceTerminationReason
} from "./types.ts";
import { CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION, CLIENT_GATEWAY_TRACE_SCHEMA_VERSION } from "./versions.ts";

/** What a trace is about, fixed when it starts. Episode ids are live run ids. */
export type ClientGatewayTraceRecorderStart = {
  traceId: string;
  episodeId: string;
  activity: ClientGatewayTraceActivity;
  origin: ClientGatewayTraceOrigin;
  contractVersions: Readonly<Record<string, string>>;
  capabilities: unknown;
  context: { schema: ClientGatewayTraceSchemaRef; value: unknown };
  streams: readonly string[];
};

export type ClientGatewayTraceRecorderOptions = {
  store: ClientGatewayTraceStoreWriter;
  /** Epoch milliseconds. */
  now: () => number;
  /** Events held awaiting flush, at most. Past it an event is declared lost, never dropped silently. */
  maxBufferedEvents: number;
  /** Artifact bytes held awaiting flush, at most. */
  maxBufferedArtifactBytes: number;
};

type Identity = {
  readonly traceId: string;
  readonly episodeId: string;
  readonly activity: ClientGatewayTraceActivity;
  readonly origin: ClientGatewayTraceOrigin;
  readonly contractVersions: Readonly<Record<string, string>>;
  readonly capabilities: ClientGatewayTraceJsonValue;
  readonly context: ClientGatewayTraceContext;
  readonly streams: readonly string[];
  readonly clockOrigin: ClientGatewayTraceClockOrigin;
  readonly provenance: ClientGatewayTraceProvenance;
};

type PendingArtifact = { readonly id: string; readonly bytes: Uint8Array };
type Batch = { events: ClientGatewayTraceEvent[]; artifacts: PendingArtifact[]; artifactBytes: number };
type Ending = { closedAt: string; reason: ClientGatewayTraceTerminationReason; detail: string | null };
/** What an event names elsewhere: captured artifacts by id, client-uploaded ones by digest. */
type References = { readonly artifactIds: readonly string[]; readonly referencedDigests: readonly string[] };
type EventFields = { stream: string; messageType: string | null; source: ClientGatewayTraceSourceInput; correlation: ClientGatewayTraceCorrelationInput; session?: string };

const REFUSED_CLOSED: ClientGatewayTraceRecordResult = Object.freeze({ status: "refused", reason: "closed" });
const NO_PAYLOAD: ClientGatewayTracePayload = Object.freeze({ encoding: "none" });
const NO_REDACTIONS: readonly ClientGatewayTraceRedaction[] = Object.freeze([]);
const NO_DIGESTS: readonly string[] = Object.freeze([]);

export class ClientGatewayTraceRecorder implements ClientGatewayTraceSink {
  private readonly store: ClientGatewayTraceStoreWriter;
  private readonly now: () => number;
  private readonly maxBufferedEvents: number;
  private readonly maxBufferedArtifactBytes: number;
  private readonly identity: Identity;
  private readonly startedAt: string;
  private readonly artifacts: ClientGatewayTraceArtifactEntry[] = [];
  private readonly checkpoints: ClientGatewayTraceCheckpoint[] = [];
  private losses: ClientGatewayTraceLoss[] = [];
  private failure: { readonly message: string; readonly sequence: number } | null = null;
  private lastSequence = 0;
  private pending: Batch = emptyBatch();
  private inFlight: Batch = emptyBatch();
  private writable = true;
  private closing = false;
  private ending: Ending | null = null;
  private flushChain: Promise<void> = Promise.resolve();

  constructor(start: ClientGatewayTraceRecorderStart, options: ClientGatewayTraceRecorderOptions) {
    if (!Number.isInteger(options.maxBufferedEvents) || options.maxBufferedEvents < 1) throw new Error("maxBufferedEvents must be a positive integer");
    if (!Number.isInteger(options.maxBufferedArtifactBytes) || options.maxBufferedArtifactBytes < 0) throw new Error("maxBufferedArtifactBytes must be a non-negative integer");
    if (start.traceId.length === 0 || start.episodeId.length === 0) throw new Error("a trace needs a trace id and an episode id");
    if (start.streams.length === 0 || new Set(start.streams).size !== start.streams.length) throw new Error("a trace declares one or more distinct streams");
    for (const [name, version] of Object.entries(start.contractVersions)) {
      if (typeof version !== "string") throw new Error(`contract ${name} has no version string`);
    }
    this.store = options.store;
    this.now = options.now;
    this.maxBufferedEvents = options.maxBufferedEvents;
    this.maxBufferedArtifactBytes = options.maxBufferedArtifactBytes;
    const epochMs = options.now();
    this.startedAt = new Date(epochMs).toISOString();
    this.identity = Object.freeze({
      traceId: start.traceId,
      episodeId: start.episodeId,
      activity: start.activity,
      origin: freezeOrigin(start.origin),
      contractVersions: Object.freeze({ ...start.contractVersions }),
      capabilities: cloneClientGatewayTraceJson(start.capabilities),
      context: Object.freeze({ schema: freezeSchema(start.context.schema), value: cloneClientGatewayTraceJson(start.context.value) }),
      streams: Object.freeze([...start.streams]),
      clockOrigin: Object.freeze({ epochMs, observedAt: this.startedAt }),
      provenance: Object.freeze({ episodeId: start.episodeId, origin: start.origin.kind })
    });
  }

  record(input: ClientGatewayTraceEventInput): ClientGatewayTraceRecordResult {
    if (this.closing) return REFUSED_CLOSED;
    const sequence = this.nextSequence();
    const eventId = `${this.identity.traceId}#${sequence}`;
    try {
      const references: References = { artifactIds: input.artifactIds, referencedDigests: input.referencedDigests ?? NO_DIGESTS };
      const event = this.buildEvent(sequence, eventId, input.kind, input, copyPayload(input.payload), references, input.redactions, input.payloadSchema);
      return this.buffer(event, null);
    } catch (error) {
      return this.lose(sequence, eventId, "recorder_failure", `event could not be copied: ${messageOf(error)}`);
    }
  }

  recordArtifact(input: ClientGatewayTraceArtifactInput): ClientGatewayTraceRecordResult {
    if (this.closing) return REFUSED_CLOSED;
    const sequence = this.nextSequence();
    const eventId = `${this.identity.traceId}#${sequence}`;
    const artifactId = `${this.identity.traceId}#artifact-${sequence}`;
    try {
      const bytes = new Uint8Array(input.bytes);
      const entry: ClientGatewayTraceArtifactEntry = Object.freeze({
        id: artifactId,
        sha256: clientGatewayTraceArtifactDigest(bytes),
        mediaType: input.mediaType,
        byteLength: bytes.byteLength,
        sequence,
        resourceKey: input.resourceKey
      });
      const event = this.buildEvent(sequence, eventId, "artifact", input, NO_PAYLOAD, { artifactIds: [artifactId], referencedDigests: NO_DIGESTS }, NO_REDACTIONS, null);
      const result = this.buffer(event, { id: artifactId, bytes });
      if (result.status === "recorded") this.artifacts.push(entry);
      return result;
    } catch (error) {
      return this.lose(sequence, eventId, "recorder_failure", `artifact could not be copied: ${messageOf(error)}`);
    }
  }

  markCheckpoint(input: ClientGatewayTraceCheckpointInput): ClientGatewayTraceCheckpointResult {
    if (this.closing) return Object.freeze({ status: "refused", reason: "closed" });
    if (!Number.isInteger(input.sequence) || input.sequence < 1 || input.sequence > this.lastSequence) return Object.freeze({ status: "refused", reason: "unknown_sequence" });
    if (this.checkpoints.some((checkpoint) => checkpoint.id === input.id)) return Object.freeze({ status: "refused", reason: "duplicate_id" });
    this.checkpoints.push(Object.freeze({ id: input.id, sequence: input.sequence, observationRevision: input.observationRevision }));
    return Object.freeze({ status: "marked" });
  }

  flush(): Promise<void> {
    const run = this.flushChain.then(() => this.flushOnce());
    this.flushChain = run;
    return run;
  }

  /** Flushes, closes and persists the final manifest. A failed final write rejects: the stored trace then reads as truncated. */
  async close(input: ClientGatewayTraceCloseInput): Promise<ClientGatewayTraceManifest> {
    if (this.closing) throw new Error(`trace ${this.identity.traceId} is already closed`);
    this.closing = true;
    await this.flush();
    this.losses = closeOpenLosses(this.losses, this.lastSequence);
    this.ending = { closedAt: new Date(this.now()).toISOString(), reason: input.terminationReason, detail: input.terminationDetail };
    const manifest = this.manifest();
    await this.store.writeManifest(manifest);
    return manifest;
  }

  status(): ClientGatewayTraceSinkStatus {
    return Object.freeze({
      traceId: this.identity.traceId,
      state: this.ending !== null ? "closed" : this.writable ? "recording" : "failed",
      lastSequence: this.lastSequence,
      bufferedEvents: this.pending.events.length + this.inFlight.events.length,
      bufferedArtifactBytes: this.pending.artifactBytes + this.inFlight.artifactBytes,
      losses: Object.freeze([...this.losses]),
      failure: this.failure,
      completeness: this.claimStatus()
    });
  }

  private nextSequence(): number {
    this.lastSequence += 1;
    return this.lastSequence;
  }

  private claimStatus(): ClientGatewayTraceCompletenessStatus {
    if (this.losses.length > 0 || this.failure !== null) return "incomplete";
    return this.ending === null ? "open" : "complete";
  }

  private buildEvent(
    sequence: number,
    eventId: string,
    kind: ClientGatewayTraceEventKind,
    fields: EventFields,
    payload: ClientGatewayTracePayload,
    references: References,
    redactions: readonly ClientGatewayTraceRedaction[],
    payloadSchema: ClientGatewayTraceSchemaRef | null
  ): ClientGatewayTraceEvent {
    if (!this.identity.streams.includes(fields.stream)) throw new Error(`stream "${fields.stream}" is not declared`);
    const observedMs = this.now();
    const correlation = fields.correlation;
    return Object.freeze({
      traceId: this.identity.traceId,
      eventId,
      stream: fields.stream,
      sequence,
      source: Object.freeze({ id: fields.source.id, sequence: fields.source.sequence }),
      time: Object.freeze({ logicalMs: observedMs - this.identity.clockOrigin.epochMs, observedAt: new Date(observedMs).toISOString(), sourceTimestamp: fields.source.timestamp }),
      kind,
      messageType: fields.messageType,
      correlation: Object.freeze({
        commandId: correlation.commandId,
        recordingId: correlation.recordingId,
        causationEventId: correlation.causationEventId,
        owner: correlation.owner === undefined ? null : cloneClientGatewayTraceJson(correlation.owner),
        observationRevision: correlation.observationRevision,
        baseRevision: correlation.baseRevision
      }),
      payloadSchema: payloadSchema === null ? null : freezeSchema(payloadSchema),
      payload,
      artifactIds: Object.freeze([...references.artifactIds]),
      referencedDigests: Object.freeze([...references.referencedDigests]),
      provenance: this.identity.provenance,
      redactions: Object.freeze(redactions.map((redaction) => Object.freeze({ path: redaction.path, reason: redaction.reason }))),
      ...(typeof fields.session === "string" ? { session: fields.session } : {})
    });
  }

  private buffer(event: ClientGatewayTraceEvent, artifact: PendingArtifact | null): ClientGatewayTraceRecordResult {
    if (!this.writable) return this.lose(event.sequence, event.eventId, "recorder_failure", "the store failed earlier");
    const heldEvents = this.pending.events.length + this.inFlight.events.length;
    const heldBytes = this.pending.artifactBytes + this.inFlight.artifactBytes + (artifact === null ? 0 : artifact.bytes.byteLength);
    if (heldEvents >= this.maxBufferedEvents || heldBytes > this.maxBufferedArtifactBytes) {
      return this.lose(event.sequence, event.eventId, "buffer_overflow", `the buffer was full (${heldEvents} events awaiting flush)`);
    }
    this.pending.events.push(event);
    if (artifact !== null) {
      this.pending.artifacts.push(artifact);
      this.pending.artifactBytes += artifact.bytes.byteLength;
    }
    return Object.freeze({ status: "recorded", sequence: event.sequence, eventId: event.eventId, artifactId: artifact === null ? null : artifact.id });
  }

  /** Declares `sequence` lost, extending an adjacent loss of the same reason into one range. */
  private lose(sequence: number, eventId: string, reason: ClientGatewayTraceLossReason, detail: string): ClientGatewayTraceRecordResult {
    const covered = this.losses.some((loss) => loss.range.from <= sequence && (loss.range.to === null || loss.range.to >= sequence));
    const previous = this.losses.at(-1);
    if (!covered && previous !== undefined && previous.reason === reason && previous.range.to === sequence - 1) {
      this.losses[this.losses.length - 1] = freezeLoss(reason, previous.range.from, sequence, previous.detail);
    } else if (!covered) {
      this.losses.push(freezeLoss(reason, sequence, sequence, detail));
    }
    if (reason === "recorder_failure" && this.failure === null) this.failure = Object.freeze({ message: detail, sequence });
    return Object.freeze({ status: "lost", sequence, eventId, reason });
  }

  private async flushOnce(): Promise<void> {
    if (!this.writable) return;
    const batch = this.pending;
    const firstUnsaved = batch.events[0]?.sequence ?? this.lastSequence + 1;
    this.pending = emptyBatch();
    this.inFlight = batch;
    try {
      for (const artifact of batch.artifacts) await this.store.writeArtifact(this.identity.traceId, artifact.id, artifact.bytes);
      if (batch.events.length > 0) await this.store.appendEvents(this.identity.traceId, batch.events);
      await this.store.writeManifest(this.manifest());
    } catch (error) {
      const detail = `the store failed: ${messageOf(error)}`;
      this.writable = false;
      this.pending = emptyBatch();
      this.losses.push(freezeLoss("recorder_failure", firstUnsaved, null, detail));
      if (this.failure === null) this.failure = Object.freeze({ message: detail, sequence: firstUnsaved });
    } finally {
      this.inFlight = emptyBatch();
    }
  }

  private manifest(): ClientGatewayTraceManifest {
    const identity = this.identity;
    return Object.freeze({
      traceId: identity.traceId,
      episodeId: identity.episodeId,
      activity: identity.activity,
      origin: identity.origin,
      traceSchemaVersion: CLIENT_GATEWAY_TRACE_SCHEMA_VERSION,
      captureBoundaryVersion: CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION,
      contractVersions: identity.contractVersions,
      capabilities: identity.capabilities,
      context: identity.context,
      streams: identity.streams,
      clockOrigin: identity.clockOrigin,
      artifacts: Object.freeze([...this.artifacts]),
      checkpoints: Object.freeze([...this.checkpoints]),
      completeness: Object.freeze({ status: this.claimStatus(), lastSequence: this.lastSequence, losses: Object.freeze([...this.losses]) }),
      startedAt: this.startedAt,
      closedAt: this.ending === null ? null : this.ending.closedAt,
      terminationReason: this.ending === null ? null : this.ending.reason,
      terminationDetail: this.ending === null ? null : this.ending.detail
    });
  }
}

function emptyBatch(): Batch {
  return { events: [], artifacts: [], artifactBytes: 0 };
}

function freezeLoss(reason: ClientGatewayTraceLossReason, from: number, to: number | null, detail: string): ClientGatewayTraceLoss {
  return Object.freeze({ reason, range: Object.freeze({ from, to }), detail });
}

/** At close an open-ended loss ends at the last sequence; one that covers no sequence is dropped (the recorded failure still marks the trace incomplete). */
function closeOpenLosses(losses: readonly ClientGatewayTraceLoss[], lastSequence: number): ClientGatewayTraceLoss[] {
  const closed: ClientGatewayTraceLoss[] = [];
  for (const loss of losses) {
    if (loss.range.to !== null) closed.push(loss);
    else if (loss.range.from <= lastSequence) closed.push(freezeLoss(loss.reason, loss.range.from, lastSequence, loss.detail));
  }
  return closed;
}

function freezeSchema(schema: ClientGatewayTraceSchemaRef): ClientGatewayTraceSchemaRef {
  return Object.freeze({ name: schema.name, version: schema.version });
}

function freezeOrigin(origin: ClientGatewayTraceOrigin): ClientGatewayTraceOrigin {
  if (origin.kind === "live") return Object.freeze({ kind: "live" });
  return Object.freeze({ kind: "derived", derivation: origin.derivation, sourceTraceIds: Object.freeze([...origin.sourceTraceIds]) });
}

function copyPayload(input: ClientGatewayTracePayloadInput): ClientGatewayTracePayload {
  if (input.encoding === "text") {
    if (typeof input.text !== "string") throw new Error("a text payload must be a string");
    return Object.freeze({ encoding: "text", text: input.text });
  }
  if (input.encoding === "json") return Object.freeze({ encoding: "json", value: cloneClientGatewayTraceJson(input.value) });
  return NO_PAYLOAD;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
