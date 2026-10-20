// Shared types of the client gateway trace contract: the manifest, the event
// envelope, completeness, the sink port the gateway records through, and the
// store port traces are read from. Domain-neutral: a domain's payloads stay
// opaque inside an event, named by their declared schema.

import type {
  CLIENT_GATEWAY_TRACE_COMPLETENESS_STATUSES,
  CLIENT_GATEWAY_TRACE_ISSUE_CODES,
  CLIENT_GATEWAY_TRACE_LOSS_REASONS,
  CLIENT_GATEWAY_TRACE_RECORDER_STATES
} from "./completeness-vocabulary.ts";
import type {
  CLIENT_GATEWAY_TRACE_ACTIVITIES,
  CLIENT_GATEWAY_TRACE_DERIVATIONS,
  CLIENT_GATEWAY_TRACE_EVENT_KINDS,
  CLIENT_GATEWAY_TRACE_REDACTION_REASONS,
  CLIENT_GATEWAY_TRACE_TERMINATION_REASONS
} from "./vocabulary.ts";

export type ClientGatewayTraceActivity = (typeof CLIENT_GATEWAY_TRACE_ACTIVITIES)[number];
export type ClientGatewayTraceEventKind = (typeof CLIENT_GATEWAY_TRACE_EVENT_KINDS)[number];
export type ClientGatewayTraceTerminationReason = (typeof CLIENT_GATEWAY_TRACE_TERMINATION_REASONS)[number];
export type ClientGatewayTraceRedactionReason = (typeof CLIENT_GATEWAY_TRACE_REDACTION_REASONS)[number];
export type ClientGatewayTraceDerivation = (typeof CLIENT_GATEWAY_TRACE_DERIVATIONS)[number];
export type ClientGatewayTraceLossReason = (typeof CLIENT_GATEWAY_TRACE_LOSS_REASONS)[number];
export type ClientGatewayTraceCompletenessStatus = (typeof CLIENT_GATEWAY_TRACE_COMPLETENESS_STATUSES)[number];
export type ClientGatewayTraceIssueCode = (typeof CLIENT_GATEWAY_TRACE_ISSUE_CODES)[number];
export type ClientGatewayTraceRecorderState = (typeof CLIENT_GATEWAY_TRACE_RECORDER_STATES)[number];

/** A deep-frozen JSON value. */
export type ClientGatewayTraceJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ClientGatewayTraceJsonValue[]
  | { readonly [key: string]: ClientGatewayTraceJsonValue };

/** A named, versioned schema: a payload contract or the program's context. */
export type ClientGatewayTraceSchemaRef = {
  readonly name: string;
  readonly version: string;
};

/**
 * Whether a trace is what a live episode delivered (`live`) or something
 * produced from traces: a replay's diagnostic trace, or a trace that left Core
 * and came back (`derived`). A derived trace is never read as live (T24).
 */
export type ClientGatewayTraceOrigin =
  | { readonly kind: "live" }
  | { readonly kind: "derived"; readonly derivation: ClientGatewayTraceDerivation; readonly sourceTraceIds: readonly string[] };

/** A closed range of delivery sequences; `to: null` is open-ended (to the trace's end). */
export type ClientGatewayTraceSequenceRange = {
  readonly from: number;
  readonly to: number | null;
};

/** The point every event's logical time is measured from. */
export type ClientGatewayTraceClockOrigin = {
  readonly epochMs: number;
  readonly observedAt: string;
};

/** Opaque program context (task inputs, goal contract version), named by its schema. */
export type ClientGatewayTraceContext = {
  readonly schema: ClientGatewayTraceSchemaRef;
  readonly value: ClientGatewayTraceJsonValue;
};

/** One captured artifact: its integrity, its type, and the sequence it arrived at. */
export type ClientGatewayTraceArtifactEntry = {
  readonly id: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly sequence: number;
  /** The live resource's own identity (a content address, an object key), or `null`. Never dereferenced on replay. */
  readonly resourceKey: string | null;
};

/** A point in the trace an observation can be reconstructed from. */
export type ClientGatewayTraceCheckpoint = {
  readonly id: string;
  readonly sequence: number;
  readonly observationRevision: string | null;
};

/** Sequences the recorder assigned and could not keep. */
export type ClientGatewayTraceLoss = {
  readonly reason: ClientGatewayTraceLossReason;
  readonly range: ClientGatewayTraceSequenceRange;
  readonly detail: string;
};

/**
 * The recorder's own claim about the trace. Readers never trust a `complete`
 * claim alone: they evaluate the evidence (`evaluateClientGatewayTraceCompleteness`).
 */
export type ClientGatewayTraceCompletenessClaim = {
  readonly status: ClientGatewayTraceCompletenessStatus;
  /** The highest sequence the recorder assigned; 0 before the first event. */
  readonly lastSequence: number;
  readonly losses: readonly ClientGatewayTraceLoss[];
};

/** What identifies and qualifies one trace. Episode ids are live run ids. */
export type ClientGatewayTraceManifest = {
  readonly traceId: string;
  readonly episodeId: string;
  readonly activity: ClientGatewayTraceActivity;
  readonly origin: ClientGatewayTraceOrigin;
  readonly traceSchemaVersion: number;
  readonly captureBoundaryVersion: number;
  /** Contract name to version: protocol, domain and payload contracts. */
  readonly contractVersions: Readonly<Record<string, string>>;
  /** The session's capability snapshot as Core held it. */
  readonly capabilities: ClientGatewayTraceJsonValue;
  readonly context: ClientGatewayTraceContext;
  readonly streams: readonly string[];
  readonly clockOrigin: ClientGatewayTraceClockOrigin;
  readonly artifacts: readonly ClientGatewayTraceArtifactEntry[];
  readonly checkpoints: readonly ClientGatewayTraceCheckpoint[];
  readonly completeness: ClientGatewayTraceCompletenessClaim;
  readonly startedAt: string;
  readonly closedAt: string | null;
  readonly terminationReason: ClientGatewayTraceTerminationReason | null;
  readonly terminationDetail: string | null;
};

/** Where an event came from on the client side: the client envelope's id and sequence. */
export type ClientGatewayTraceSource = {
  readonly id: string | null;
  readonly sequence: number | null;
};

export type ClientGatewayTraceTime = {
  /** Milliseconds since the trace's clock origin, as Core observed it. */
  readonly logicalMs: number;
  readonly observedAt: string;
  /** The client's own timestamp, where the message carried one. */
  readonly sourceTimestamp: string | null;
};

/**
 * Explicit correlations only. A cause is recorded only when it is known; the
 * next state change is never assumed to follow from the previous command.
 */
export type ClientGatewayTraceCorrelation = {
  readonly commandId: string | null;
  readonly recordingId: string | null;
  readonly causationEventId: string | null;
  /** Opaque owner of a command (a run binding), or `null`. */
  readonly owner: ClientGatewayTraceJsonValue;
  readonly observationRevision: string | null;
  /** The observation revision a delta applies to, or `null`. */
  readonly baseRevision: string | null;
};

/**
 * An event's payload. `text` is the raw text as received: it keeps absent
 * versus `null`, number spellings, unknown fields and key order. `json` is a
 * deep-frozen clone of a structured message. `none` carries nothing.
 */
export type ClientGatewayTracePayload =
  | { readonly encoding: "text"; readonly text: string }
  | { readonly encoding: "json"; readonly value: ClientGatewayTraceJsonValue }
  | { readonly encoding: "none" };

/** A withheld field (JSON pointer) and why. A declared fidelity limitation. */
export type ClientGatewayTraceRedaction = {
  readonly path: string;
  readonly reason: ClientGatewayTraceRedactionReason;
};

export type ClientGatewayTraceProvenance = {
  readonly episodeId: string;
  readonly origin: ClientGatewayTraceOrigin["kind"];
};

/** One delivery to or from Core, in authoritative delivery order. */
export type ClientGatewayTraceEvent = {
  readonly traceId: string;
  readonly eventId: string;
  readonly stream: string;
  /** Authoritative delivery sequence: one counter for every stream and kind in the trace, contiguous from 1. */
  readonly sequence: number;
  readonly source: ClientGatewayTraceSource;
  readonly time: ClientGatewayTraceTime;
  readonly kind: ClientGatewayTraceEventKind;
  readonly messageType: string | null;
  readonly correlation: ClientGatewayTraceCorrelation;
  readonly payloadSchema: ClientGatewayTraceSchemaRef | null;
  readonly payload: ClientGatewayTracePayload;
  readonly artifactIds: readonly string[];
  /**
   * Artifacts the message names by digest (lower-case hex SHA-256) rather than
   * by id: what a client said it uploaded for a traced command. Each must have
   * been delivered into this trace at or before this event, or the trace is
   * missing evidence.
   */
  readonly referencedDigests: readonly string[];
  readonly provenance: ClientGatewayTraceProvenance;
  readonly redactions: readonly ClientGatewayTraceRedaction[];
};

/** Correlation as the gateway supplies it; `owner` is cloned on record. */
export type ClientGatewayTraceCorrelationInput = {
  commandId: string | null;
  recordingId: string | null;
  causationEventId: string | null;
  owner: unknown;
  observationRevision: string | null;
  baseRevision: string | null;
};

export type ClientGatewayTraceSourceInput = {
  id: string | null;
  sequence: number | null;
  timestamp: string | null;
};

export type ClientGatewayTracePayloadInput =
  | { encoding: "text"; text: string }
  | { encoding: "json"; value: unknown }
  | { encoding: "none" };

/** What the gateway hands the sink for one event; the sink assigns sequence, id and time. */
export type ClientGatewayTraceEventInput = {
  stream: string;
  kind: Exclude<ClientGatewayTraceEventKind, "artifact">;
  messageType: string | null;
  source: ClientGatewayTraceSourceInput;
  correlation: ClientGatewayTraceCorrelationInput;
  payloadSchema: ClientGatewayTraceSchemaRef | null;
  payload: ClientGatewayTracePayloadInput;
  artifactIds: readonly string[];
  /** Artifact digests (lower-case hex SHA-256) the message references; none when absent. */
  referencedDigests?: readonly string[];
  redactions: readonly ClientGatewayTraceRedaction[];
};

/** Captured content arriving. The sink copies the bytes and computes their digest. */
export type ClientGatewayTraceArtifactInput = {
  stream: string;
  messageType: string | null;
  mediaType: string;
  bytes: Uint8Array;
  resourceKey: string | null;
  source: ClientGatewayTraceSourceInput;
  correlation: ClientGatewayTraceCorrelationInput;
};

/** The answer to one record call. The sink never throws into the gateway. */
export type ClientGatewayTraceRecordResult =
  | { readonly status: "recorded"; readonly sequence: number; readonly eventId: string; readonly artifactId: string | null }
  | { readonly status: "lost"; readonly sequence: number; readonly eventId: string; readonly reason: ClientGatewayTraceLossReason }
  | { readonly status: "refused"; readonly reason: "closed" };

export type ClientGatewayTraceCheckpointInput = {
  id: string;
  sequence: number;
  observationRevision: string | null;
};

export type ClientGatewayTraceCheckpointResult =
  | { readonly status: "marked" }
  | { readonly status: "refused"; readonly reason: "closed" | "unknown_sequence" | "duplicate_id" };

export type ClientGatewayTraceCloseInput = {
  terminationReason: ClientGatewayTraceTerminationReason;
  terminationDetail: string | null;
};

/** What the sink shows about itself at any moment. */
export type ClientGatewayTraceSinkStatus = {
  readonly traceId: string;
  readonly state: ClientGatewayTraceRecorderState;
  readonly lastSequence: number;
  readonly bufferedEvents: number;
  readonly bufferedArtifactBytes: number;
  readonly losses: readonly ClientGatewayTraceLoss[];
  readonly failure: { readonly message: string; readonly sequence: number } | null;
  readonly completeness: ClientGatewayTraceCompletenessStatus;
};

/**
 * The port the client gateway records through (wired in P2). `record` and
 * `recordArtifact` are synchronous: they assign the delivery sequence and take
 * an immutable copy before returning, so later mutation of the live object
 * cannot alter the trace. `flush` persists; `close` ends the trace.
 */
export type ClientGatewayTraceSink = {
  record(input: ClientGatewayTraceEventInput): ClientGatewayTraceRecordResult;
  recordArtifact(input: ClientGatewayTraceArtifactInput): ClientGatewayTraceRecordResult;
  markCheckpoint(input: ClientGatewayTraceCheckpointInput): ClientGatewayTraceCheckpointResult;
  flush(): Promise<void>;
  close(input: ClientGatewayTraceCloseInput): Promise<ClientGatewayTraceManifest>;
  status(): ClientGatewayTraceSinkStatus;
};

/** An artifact a store actually holds, with the digest of the bytes it holds. */
export type ClientGatewayTraceArtifactPresence = {
  readonly id: string;
  readonly sha256: string;
  readonly byteLength: number;
};

/** The compatibility decision a caller made over the manifest's contract versions. */
export type ClientGatewayTraceCompatibility =
  | { readonly status: "compatible" }
  | {
      readonly status: "incompatible";
      readonly contracts: readonly { readonly name: string; readonly recordedVersion: string | null; readonly detail: string }[];
    };

export type ClientGatewayTraceCompletenessInput = {
  manifest: ClientGatewayTraceManifest;
  events: readonly ClientGatewayTraceEvent[];
  availableArtifacts: readonly ClientGatewayTraceArtifactPresence[];
  compatibility: ClientGatewayTraceCompatibility;
  /** True only when the caller knows a recorder is still writing this trace; otherwise an unclosed trace is truncated. */
  recorderActive: boolean;
};

/** One reason a trace is incomplete, tagged by sequence range or artifact. */
export type ClientGatewayTraceCompletenessIssue = {
  readonly code: ClientGatewayTraceIssueCode;
  readonly range: ClientGatewayTraceSequenceRange | null;
  readonly artifactId: string | null;
  readonly detail: string;
};

/** A scope whose evidence is present but withheld: it cannot pass exact parity. */
export type ClientGatewayTraceFidelityLimitation = {
  readonly code: "redaction_limited";
  readonly range: ClientGatewayTraceSequenceRange;
  readonly path: string;
  readonly reason: ClientGatewayTraceRedactionReason;
};

export type ClientGatewayTraceCompleteness = {
  readonly status: ClientGatewayTraceCompletenessStatus;
  readonly issues: readonly ClientGatewayTraceCompletenessIssue[];
  readonly limitations: readonly ClientGatewayTraceFidelityLimitation[];
};

/** The correlation fields a store indexes. */
export type ClientGatewayTraceCorrelationKey = "commandId" | "recordingId" | "causationEventId";

/** The write side a recorder persists through. Artifacts, then events, then the manifest. */
export type ClientGatewayTraceStoreWriter = {
  writeArtifact(traceId: string, artifactId: string, bytes: Uint8Array): Promise<void>;
  appendEvents(traceId: string, events: readonly ClientGatewayTraceEvent[]): Promise<void>;
  writeManifest(manifest: ClientGatewayTraceManifest): Promise<void>;
};

/** Persisted traces with indexed reads, so a replay loads only what it needs. */
export type ClientGatewayTraceStore = ClientGatewayTraceStoreWriter & {
  readManifest(traceId: string): Promise<ClientGatewayTraceManifest | undefined>;
  /** Events with `from <= sequence <= to`, in sequence order. */
  readEventRange(traceId: string, from: number, to: number): Promise<readonly ClientGatewayTraceEvent[]>;
  readEventsByCorrelation(traceId: string, key: ClientGatewayTraceCorrelationKey, value: string): Promise<readonly ClientGatewayTraceEvent[]>;
  /** A fresh copy of the artifact's bytes, or `undefined` when the store does not hold it. */
  readArtifact(traceId: string, artifactId: string): Promise<Uint8Array | undefined>;
  listArtifacts(traceId: string): Promise<readonly ClientGatewayTraceArtifactPresence[]>;
};
