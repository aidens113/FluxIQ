// The gateway-internal trace tap (traces and offline trials, P2; D1, D8, D12,
// D14). It owns routing, so the program only has to say which trace the
// dispatching async context records into (`ClientGatewayTraceCaptureSource`).
//
// - Outbound: recorded into the current trace, which then claims the target
//   session (by session id and client id, so a claim survives a reconnect) and
//   is remembered as the trace of each command id it sent. Outside every
//   traced episode, a message to a claimed session goes to its claimants.
// - Inbound: an action result or reconcile answer goes to the traces its
//   command id was sent from; anything else to every trace claiming the
//   session. The raw text is what is recorded; the disposition follows it,
//   with the digests of what Core delivered for it (P3). The artifact digests
//   a result references ride on its event.
// - Lifecycle goes to the claimants, Core-synthesized outcomes to the traces of
//   their command id. Credentials are redacted here (D7).
// - Every event that belongs to a session names it by the opaque reference its
//   trace gave it (`session-1`, ...), never by session id or token (P3).
// - When a trace first claims a session, it records the session's public view
//   (`session.claimed`, `./session-view.ts`), so a replay attaches the session
//   as it was (P3 D23).
//
// With no source the tap does nothing at all. It never throws into the
// gateway: a sink's own failures stay the sink's, and a sink that answers
// `closed` (or reads as closed when a new trace claims) loses its claims.

import type { ClientGatewayClientMessage, ClientGatewayServerMessage } from "@fluxiq/contracts/client-gateway";
import {
  clientGatewayTraceArtifactDigest,
  type ClientGatewayTraceArtifactInput,
  type ClientGatewayTraceCaptureSource,
  type ClientGatewayTraceEventInput,
  type ClientGatewayTraceEventKind,
  type ClientGatewayTracePayloadInput,
  type ClientGatewayTraceRecordResult,
  type ClientGatewayTraceRedaction,
  type ClientGatewayTraceSchemaRef,
  type ClientGatewayTraceSink
} from "../../trace/index.ts";
import { clientGatewayTraceStampedAction } from "./action-stamp.ts";
import { CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS } from "./credential-fields.ts";
import { redactClientGatewayTraceCredentials } from "./credential-redaction.ts";
import { clientGatewayTraceReferencedDigests } from "./referenced-digests.ts";
import { CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS } from "./lifecycle-events.ts";
import { CLIENT_GATEWAY_TRACE_TAP_SCHEMAS } from "./schemas.ts";
import { clientGatewayTraceSessionView } from "./session-view.ts";
import { CLIENT_GATEWAY_TRACE_TAP_STREAMS } from "./streams.ts";
import type {
  ClientGatewayTraceArtifactIntake,
  ClientGatewayTraceArtifactUpload,
  ClientGatewayTraceDelivery,
  ClientGatewayTraceDisposition,
  ClientGatewayTraceInboundCapture,
  ClientGatewayTraceInboundTarget,
  ClientGatewayTraceLifecycleTarget,
  ClientGatewayTraceTapOptions
} from "./types.ts";

type ActionMessage = Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>;
type Claim = { readonly sessionIds: Set<string>; readonly clientIds: Set<string> };
type Route = { sinks: ClientGatewayTraceSink[]; readonly owner: unknown };
type Fields = {
  readonly type: string | null;
  readonly id: string | null;
  readonly timestamp: string | null;
  readonly commandId: string | null;
  readonly recordingId: string | null;
  /** The client id a hello claims to speak for. */
  readonly helloClientId: string | null;
  /** The artifact digests a result references in its `metadata.trace`. */
  readonly referencedDigests: readonly string[];
};
type Recorded = ClientGatewayTraceRecordResult | { readonly status: "sink_threw"; readonly error: unknown };
type Envelope = { payload: ClientGatewayTracePayloadInput; redactions: readonly ClientGatewayTraceRedaction[] };

/** Results and reconcile answers belong to the trace their command was sent from. */
const ROUTED_BY_COMMAND: ReadonlySet<string> = new Set(["client.action_result", "client.reconcile_result"]);
/** Display-only, and nothing answers it (D1): never recorded. */
const UNTRACED_OUTBOUND: ReadonlySet<string> = new Set(["server.activity"]);
const NO_REDACTIONS: readonly ClientGatewayTraceRedaction[] = Object.freeze([]);
const NO_DELIVERY: ClientGatewayTraceDelivery = Object.freeze({ result: null, event: null });

export class ClientGatewayTraceTap {
  private readonly source: ClientGatewayTraceCaptureSource | undefined;
  private readonly clientIdOf: (sessionId: string) => string | undefined;
  private readonly sessionViewOf: ClientGatewayTraceTapOptions["sessionViewOf"];
  private readonly claims = new Map<ClientGatewayTraceSink, Claim>();
  private readonly routes = new Map<string, Route>();
  /** Per trace, the opaque reference it gave each session it met (`session-1`, ...), so an event says whose it is without a session id or token. */
  private readonly sessionRefs = new Map<ClientGatewayTraceSink, Map<string, string>>();

  constructor(options: ClientGatewayTraceTapOptions) {
    this.source = options.source;
    this.clientIdOf = options.clientIdOf;
    this.sessionViewOf = options.sessionViewOf;
  }

  /**
   * An action command about to be sent: under a traced episode, a copy marked
   * `metadata.trace = { artifacts: true, scope: <that trace's id> }`, its
   * command id remembered as that trace's with `owner`. Outside one, the
   * message itself. A sink that cannot say which trace it is gets no stamp:
   * an unscoped request would let a client skip an upload this trace never
   * received, so the client is asked for nothing instead.
   */
  stampAction(message: ActionMessage, owner: unknown): ActionMessage {
    const sink = this.source?.current();
    if (sink === undefined) return message;
    this.routes.set(message.payload.commandId, { sinks: [sink], owner: owner ?? null });
    let scope: string;
    try {
      scope = sink.status().traceId;
    } catch {
      /* best-effort: the sink's failure is its own to report; the command goes out unstamped */
      return message;
    }
    return clientGatewayTraceStampedAction(message, scope);
  }

  /** A message Core is sending to `sessionId`, recorded as built, before it leaves. */
  outboundMessage(sessionId: string, message: ClientGatewayServerMessage): void {
    if (this.source === undefined || UNTRACED_OUTBOUND.has(message.type)) return;
    const fields = readFields(message);
    const sinks = this.outboundSinks(sessionId, fields.commandId);
    if (sinks.length === 0) return;
    const envelope = structuredEnvelope(fields.type, message);
    const input = this.envelopeInput("outbound", fields, envelope);
    for (const sink of sinks) this.recordInto(sink, input, sessionId);
    if (fields.commandId !== null && !this.routes.has(fields.commandId)) this.routes.set(fields.commandId, { sinks: [...sinks], owner: null });
  }

  /** Raw text that parsed, recorded before anything acts on it. `undefined`: no trace took it. */
  inboundText(sessionId: string, text: string, parsed: unknown): ClientGatewayTraceInboundCapture | undefined {
    if (!this.mayHaveTargets()) return undefined;
    const fields = readFields(parsed);
    const sinks = this.inboundSinks(sessionId, fields);
    if (sinks.length === 0) return undefined;
    const credentialed = fields.type !== null && Object.hasOwn(CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS, fields.type);
    const envelope: Envelope = credentialed ? structuredEnvelope(fields.type, parsed) : { payload: { encoding: "text", text }, redactions: NO_REDACTIONS };
    return this.capture(sessionId, sinks, fields, envelope);
  }

  /** A message handed to `receive` in process, recorded as its JSON text at entry. */
  inboundMessage(sessionId: string, message: ClientGatewayClientMessage): ClientGatewayTraceInboundCapture | undefined {
    if (!this.mayHaveTargets()) return undefined;
    const fields = readFields(message);
    const sinks = this.inboundSinks(sessionId, fields);
    if (sinks.length === 0) return undefined;
    const credentialed = fields.type !== null && Object.hasOwn(CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS, fields.type);
    const envelope = credentialed ? structuredEnvelope(fields.type, message) : textEnvelope(message);
    return this.capture(sessionId, sinks, fields, envelope);
  }

  /**
   * Text that did not parse, recorded to the session's claimants with a
   * `parse_failed` disposition. Core read nothing in it beyond failing, and it
   * may carry a credential no screen recognises (a malformed hello), so only
   * its size and digest are kept, as a declared redaction of the whole
   * message; the disposition names the error's kind only, because a parser's
   * message can quote the text (lead, P2 D18).
   */
  parseFailed(sessionId: string, text: string, error: unknown): void {
    if (!this.mayHaveTargets()) return;
    const fields = readFields(undefined);
    const sinks = this.claimants(sessionId, null);
    if (sinks.length === 0) return;
    const bytes = new TextEncoder().encode(text);
    const unparsed = { unparsed: { byteLength: bytes.byteLength, sha256: clientGatewayTraceArtifactDigest(bytes) } };
    const capture = this.capture(sessionId, sinks, fields, { payload: { encoding: "json", value: unparsed }, redactions: [{ path: "", reason: "secret" }] });
    this.disposition(capture, { disposition: "parse_failed", error: errorKind(error) });
  }

  /**
   * What Core did with a captured inbound message, caused by it in each trace
   * that took it, with the digests of what Core delivered for it (P3).
   */
  disposition(capture: ClientGatewayTraceInboundCapture, disposition: ClientGatewayTraceDisposition): void {
    const delivered = disposition.delivered ?? NO_DELIVERY;
    for (const target of capture.targets) {
      this.recordInto(target.sink, {
        stream: CLIENT_GATEWAY_TRACE_TAP_STREAMS.gateway,
        kind: "disposition",
        messageType: capture.messageType,
        source: { id: null, sequence: null, timestamp: null },
        correlation: { commandId: capture.commandId, recordingId: capture.recordingId, causationEventId: target.eventId, owner: this.ownerOf(capture.commandId), observationRevision: null, baseRevision: null },
        payloadSchema: CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.disposition,
        payload: { encoding: "json", value: { disposition: disposition.disposition, error: disposition.error, delivered: { result: delivered.result, event: delivered.event } } },
        artifactIds: [],
        redactions: NO_REDACTIONS
      }, capture.sessionId);
    }
  }

  /**
   * Connect, disconnect, pairing approval, revocation: to every trace claiming
   * the session or the client. Each field on `credentialPaths` (paths into the
   * recorded value) is redacted as a credential.
   */
  lifecycle(target: ClientGatewayTraceLifecycleTarget, event: string, detail: Record<string, unknown>, credentialPaths: readonly (readonly string[])[] = []): void {
    if (!this.mayHaveTargets()) return;
    const sinks = this.claimants(target.sessionId, target.clientId);
    if (sinks.length === 0) return;
    const redacted = redactClientGatewayTraceCredentials({ event, sessionId: target.sessionId, clientId: target.clientId, ...detail }, credentialPaths);
    const input = this.tapInput("lifecycle", event, null, CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.lifecycle, redacted.value, redacted.redactions);
    for (const sink of sinks) this.recordInto(sink, input, target.sessionId);
  }

  /**
   * An outcome Core produced itself -- an answer that never came, a gateway
   * close, a durable command left uncertain or an answer suppressed, a command
   * refused unsent -- to the traces of its command id, else to the current one.
   */
  synthesized(commandId: string | null, messageType: string | null, outcome: Record<string, unknown>): void {
    if (this.source === undefined) return;
    const routed = commandId === null ? undefined : this.routes.get(commandId);
    const current = routed === undefined ? this.source.current() : undefined;
    const sinks = routed !== undefined ? routed.sinks : current !== undefined ? [current] : [];
    if (sinks.length === 0) return;
    const input = this.tapInput("synthesized", messageType, commandId, CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.synthesized, outcome, NO_REDACTIONS);
    for (const sink of [...sinks]) this.recordInto(sink, input);
  }

  /** A trace artifact a client uploaded: its digest checked, then recorded into every trace claiming the session. */
  artifact(sessionId: string, upload: ClientGatewayTraceArtifactUpload): ClientGatewayTraceArtifactIntake {
    if (clientGatewayTraceArtifactDigest(upload.bytes) !== upload.sha256) return { status: "refused", reason: "digest_mismatch" };
    if (!this.mayHaveTargets()) return { status: "accepted", traces: 0 };
    const input: ClientGatewayTraceArtifactInput = {
      stream: CLIENT_GATEWAY_TRACE_TAP_STREAMS.artifact,
      messageType: null,
      mediaType: upload.mediaType,
      bytes: upload.bytes,
      resourceKey: upload.sha256,
      source: { id: null, sequence: null, timestamp: null },
      correlation: { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null }
    };
    let traces = 0;
    for (const sink of this.claimants(sessionId, null)) {
      const recorded = this.settle(sink, () => sink.recordArtifact({ ...input, session: this.sessionRef(sink, sessionId) }));
      if (recorded.status === "recorded") traces += 1;
    }
    return { status: "accepted", traces };
  }

  private mayHaveTargets(): boolean {
    return this.source !== undefined && (this.claims.size > 0 || this.routes.size > 0);
  }

  private outboundSinks(sessionId: string, commandId: string | null): ClientGatewayTraceSink[] {
    const routed = commandId === null ? undefined : this.routes.get(commandId);
    const current = this.source?.current();
    const chosen = routed !== undefined ? [...routed.sinks] : current !== undefined ? [current] : [];
    for (const sink of chosen) this.claim(sink, sessionId);
    return chosen.length > 0 ? chosen : this.claimants(sessionId, null);
  }

  private inboundSinks(sessionId: string, fields: Fields): ClientGatewayTraceSink[] {
    const routed = fields.type !== null && ROUTED_BY_COMMAND.has(fields.type) && fields.commandId !== null ? this.routes.get(fields.commandId) : undefined;
    return routed !== undefined ? [...routed.sinks] : this.claimants(sessionId, fields.helloClientId);
  }

  private claimants(sessionId: string, extraClientId: string | null): ClientGatewayTraceSink[] {
    const clientId = this.clientIdOf(sessionId);
    const found: ClientGatewayTraceSink[] = [];
    for (const [sink, claim] of this.claims) {
      const byClient = (clientId !== undefined && claim.clientIds.has(clientId)) || (extraClientId !== null && claim.clientIds.has(extraClientId));
      if (claim.sessionIds.has(sessionId) || byClient) found.push(sink);
    }
    return found;
  }

  private claim(sink: ClientGatewayTraceSink, sessionId: string): void {
    let claim = this.claims.get(sink);
    if (claim === undefined) {
      this.dropClosed();
      claim = { sessionIds: new Set(), clientIds: new Set() };
      this.claims.set(sink, claim);
    }
    const first = !claim.sessionIds.has(sessionId);
    claim.sessionIds.add(sessionId);
    const clientId = this.clientIdOf(sessionId);
    if (clientId !== undefined) claim.clientIds.add(clientId);
    if (first) this.recordClaimedView(sink, sessionId);
  }

  /** The session's public view, into the trace that just claimed it; nothing when the session record cannot be read. */
  private recordClaimedView(sink: ClientGatewayTraceSink, sessionId: string): void {
    const session = this.sessionViewOf?.(sessionId);
    if (session === undefined) return;
    const event = CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS.sessionClaimed;
    const value = { event, sessionId, clientId: session.clientId, view: clientGatewayTraceSessionView(session) };
    this.recordInto(sink, this.tapInput("lifecycle", event, null, CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.lifecycle, value, NO_REDACTIONS), sessionId);
  }

  /** A new trace is claiming: drop every claim whose trace has closed since. */
  private dropClosed(): void {
    for (const sink of [...this.claims.keys()]) {
      if (readsClosed(sink)) this.drop(sink);
    }
  }

  private drop(sink: ClientGatewayTraceSink): void {
    this.claims.delete(sink);
    this.sessionRefs.delete(sink);
    for (const [commandId, route] of this.routes) {
      route.sinks = route.sinks.filter((held) => held !== sink);
      if (route.sinks.length === 0) this.routes.delete(commandId);
    }
  }

  private ownerOf(commandId: string | null): unknown {
    return commandId === null ? null : this.routes.get(commandId)?.owner ?? null;
  }

  private capture(sessionId: string, sinks: readonly ClientGatewayTraceSink[], fields: Fields, envelope: Envelope): ClientGatewayTraceInboundCapture {
    const input = this.envelopeInput("inbound", fields, envelope);
    const targets: ClientGatewayTraceInboundTarget[] = [];
    for (const sink of sinks) {
      const recorded = this.recordInto(sink, input, sessionId);
      if (recorded.status === "recorded" || recorded.status === "lost") targets.push({ sink, eventId: recorded.eventId });
    }
    return { sessionId, messageType: fields.type, commandId: fields.commandId, recordingId: fields.recordingId, targets };
  }

  private envelopeInput(kind: "inbound" | "outbound", fields: Fields, envelope: Envelope): ClientGatewayTraceEventInput {
    return {
      stream: CLIENT_GATEWAY_TRACE_TAP_STREAMS.gateway,
      kind,
      messageType: fields.type,
      source: { id: fields.id, sequence: null, timestamp: fields.timestamp },
      correlation: { commandId: fields.commandId, recordingId: fields.recordingId, causationEventId: null, owner: this.ownerOf(fields.commandId), observationRevision: null, baseRevision: null },
      payloadSchema: CLIENT_GATEWAY_TRACE_TAP_SCHEMAS.envelope,
      payload: envelope.payload,
      artifactIds: [],
      referencedDigests: fields.referencedDigests,
      redactions: envelope.redactions
    };
  }

  private tapInput(
    kind: Exclude<ClientGatewayTraceEventKind, "artifact" | "inbound" | "outbound">,
    messageType: string | null,
    commandId: string | null,
    payloadSchema: ClientGatewayTraceSchemaRef,
    value: unknown,
    redactions: readonly ClientGatewayTraceRedaction[]
  ): ClientGatewayTraceEventInput {
    return {
      stream: CLIENT_GATEWAY_TRACE_TAP_STREAMS.gateway,
      kind,
      messageType,
      source: { id: null, sequence: null, timestamp: null },
      correlation: { commandId, recordingId: null, causationEventId: null, owner: this.ownerOf(commandId), observationRevision: null, baseRevision: null },
      payloadSchema,
      payload: { encoding: "json", value },
      artifactIds: [],
      redactions
    };
  }

  /** Records `input` into `sink`, marked with that trace's reference to `sessionId` when the event belongs to a session. */
  private recordInto(sink: ClientGatewayTraceSink, input: ClientGatewayTraceEventInput, sessionId: string | null = null): Recorded {
    const marked = sessionId === null ? input : { ...input, session: this.sessionRef(sink, sessionId) };
    return this.settle(sink, () => sink.record(marked));
  }

  /** The opaque reference `sink`'s trace gives `sessionId`: the next `session-<n>` the first time it meets it. */
  private sessionRef(sink: ClientGatewayTraceSink, sessionId: string): string {
    let refs = this.sessionRefs.get(sink);
    if (refs === undefined) {
      refs = new Map();
      this.sessionRefs.set(sink, refs);
    }
    let ref = refs.get(sessionId);
    if (ref === undefined) {
      ref = `session-${refs.size + 1}`;
      refs.set(sessionId, ref);
    }
    return ref;
  }

  /** Runs one sink call; a sink that answers `closed` loses its claims, and one that throws keeps its failure to itself. */
  private settle(sink: ClientGatewayTraceSink, call: () => ClientGatewayTraceRecordResult): Recorded {
    let recorded: Recorded;
    try {
      recorded = call();
    } catch (error) {
      recorded = { status: "sink_threw", error };
    }
    if (recorded.status === "refused") this.drop(sink);
    return recorded;
  }
}

function readsClosed(sink: ClientGatewayTraceSink): boolean {
  try {
    return sink.status().state === "closed";
  } catch {
    /* best-effort: a sink that cannot report its status is unusable, so it is dropped; its failure is its own to report */
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | null {
  const field = value?.[key];
  return typeof field === "string" ? field : null;
}

function timestampOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readFields(message: unknown): Fields {
  const envelope = isRecord(message) ? message : undefined;
  const payload = isRecord(envelope?.payload) ? envelope.payload : undefined;
  const type = stringField(envelope, "type");
  return {
    type,
    id: stringField(envelope, "id"),
    timestamp: timestampOf(envelope?.timestamp),
    commandId: stringField(payload, "commandId"),
    recordingId: stringField(payload, "recordingId"),
    helloClientId: type === "client.hello" ? stringField(payload, "clientId") : null,
    referencedDigests: clientGatewayTraceReferencedDigests(message)
  };
}

/** A structured copy (the sink clones it), with any credential of its type redacted. */
function structuredEnvelope(type: string | null, message: unknown): Envelope {
  const paths = type !== null && Object.hasOwn(CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS, type) ? CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS[type] : undefined;
  if (paths === undefined) return { payload: { encoding: "json", value: message }, redactions: NO_REDACTIONS };
  const redacted = redactClientGatewayTraceCredentials(message, paths);
  return { payload: { encoding: "json", value: redacted.value }, redactions: redacted.redactions };
}

/** An in-process message as JSON text at entry; one that cannot be written as JSON goes to the sink as a value, which declares it lost. */
function textEnvelope(message: unknown): Envelope {
  let text: string | undefined;
  try {
    text = JSON.stringify(message);
  } catch (error) {
    return { payload: { encoding: "json", value: { unserializable: messageOf(error) } }, redactions: NO_REDACTIONS };
  }
  if (typeof text !== "string") return { payload: { encoding: "json", value: message }, redactions: NO_REDACTIONS };
  return { payload: { encoding: "text", text }, redactions: NO_REDACTIONS };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The kind of an error (its class name), never its message. */
function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
