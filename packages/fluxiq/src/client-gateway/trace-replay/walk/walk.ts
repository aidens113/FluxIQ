// Walks a recorded trace through a fresh gateway (traces and offline trials,
// P3), in recorded order, feeding what Core received, re-issuing what was asked
// of it, and letting Core derive everything else itself. Sessions that existed
// before the trace began are paired first, while nothing records. Each inbound
// text goes through `receiveRaw`, awaited one at a time (a declared difference
// from live per-socket concurrency); each artifact through
// `receiveTraceArtifact`; each action through `executeAction` and other caller
// commands through their own methods, with the recorded ids, clock, owner and
// lease fed back. A session the trace recorded the public view of when it first
// claimed it (D23) is attached with that view. Connect, disconnect, pairing
// approval and a gateway close are reproduced, and an answer wait runs out
// where the recording shows Core acting on its expiry. A disposition, a reply
// or a synthesized outcome is never fed: the replay settles before each event
// and passes over one Core already derived. What the trace cannot supply (an
// event naming no session included) is a capture gap, never guessed.

import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientHello, type ClientGatewayClientMessage, type ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import { CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS, ClientGatewayCommandContext, type ClientGatewayCommandOwnerRef } from "../../service/index.ts";
import type { ClientGatewayTraceEvent, ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../../trace/index.ts";
import { CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS } from "../session-references/index.ts";
import { ClientGatewayTraceAlignment } from "./alignment.ts";
import { readClientGatewayTraceHello } from "./hello.ts";
import { readClientGatewayTraceInboundText } from "./inbound-text.ts";
import { readClientGatewayTraceMessageStamp } from "./message-stamp.ts";
import { issueClientGatewayTraceCallerCommand } from "./caller-command.ts";
import { readClientGatewayTraceRecordedCommand } from "./recorded-command.ts";
import { readClientGatewayTraceSessions } from "./recorded-sessions.ts";
import { clientGatewayTraceStandInHello } from "./stand-in-hello.ts";
import { createClientGatewayTraceReplayGateway, type ClientGatewayTraceReplayGateway } from "./gateway.ts";
import { ClientGatewayTraceReplaySources } from "./sources.ts";
import { clientGatewayTraceStepMessages } from "./step-messages.ts";
import { ClientGatewayTraceReplayTimers } from "./timers.ts";
import type { ClientGatewayTraceRecordedSession, ClientGatewayTraceReplayOutcome } from "../types.ts";

type JsonRecord = { readonly [key: string]: unknown };

/** Commands re-issued through their own gateway method; `server.error` also comes from Core itself, so it is issued only when Core did not derive it. */
const CALLER_COMMANDS: ReadonlySet<string> = new Set(["server.start_recording", "server.stop_recording", "server.capture_snapshot", "server.ping", "server.error"]);
const REPLAY_OPERATOR = "trace.replay";
/** A replayed session's socket: what it is sent was recorded by the tap before it left. */
const REPLAY_SOCKET: ClientGatewaySocket = { send: () => undefined };
const MAX_SETTLE_TURNS = 10_000;

export class ClientGatewayTraceReplayWalk {
  private readonly manifest: ClientGatewayTraceManifest;
  private readonly events: readonly ClientGatewayTraceEvent[];
  private readonly store: ClientGatewayTraceStore;
  private readonly quietTurns: number;
  private readonly unreferencedGap: string;
  private readonly sources: ClientGatewayTraceReplaySources;
  private readonly timers = new ClientGatewayTraceReplayTimers();
  private readonly replay: ClientGatewayTraceReplayGateway;
  private readonly sessions: Map<string, ClientGatewayTraceRecordedSession>;
  private readonly originalAlignment = new ClientGatewayTraceAlignment("recorded");
  private readonly replayAlignment = new ClientGatewayTraceAlignment("replay");
  private readonly replayEvents: ClientGatewayTraceEvent[] = [];
  private readonly derivedKeys = new Set<string>();
  private readonly replaySessions = new Map<string, string>();
  private readonly gapEvents = new Map<number, string>();
  private readonly gapSessions = new Map<string, string>();
  private readonly gapCommands = new Map<string, string>();
  private readonly standIns = new Set<number>();
  private readonly results: Promise<void>[] = [];
  private readonly failures: string[] = [];
  private readonly issueFailures = new Map<number, string>();
  private absorbed = 0;

  constructor(input: { manifest: ClientGatewayTraceManifest; events: readonly ClientGatewayTraceEvent[]; store: ClientGatewayTraceStore; commandTimeoutMs: number | undefined; quietTurns: number; unreferencedGap?: string | undefined }) {
    this.manifest = input.manifest;
    this.unreferencedGap = input.unreferencedGap ?? "the event does not say which session it belongs to";
    this.events = input.events;
    this.store = input.store;
    this.quietTurns = input.quietTurns;
    this.sources = new ClientGatewayTraceReplaySources(input.manifest.clockOrigin.epochMs);
    this.replay = createClientGatewayTraceReplayGateway({ manifest: input.manifest, sources: this.sources, timers: this.timers, commandTimeoutMs: input.commandTimeoutMs });
    this.sessions = new Map(readClientGatewayTraceSessions(input.manifest, input.events).map((session) => [session.ref, session]));
  }

  async run(): Promise<ClientGatewayTraceReplayOutcome> {
    for (const event of this.events) this.originalAlignment.key(event);
    await this.attachPresentSessions();
    for (const [index, event] of this.events.entries()) {
      await this.settle();
      await this.absorb(undefined);
      if (!this.derived(event)) await this.drive(event, index);
    }
    await this.settle();
    await this.absorb(undefined);
    const replayManifest = await this.replay.recorder.close({ terminationReason: "completed", terminationDetail: null });
    await this.absorb(undefined);
    await this.closeGateway();
    await Promise.all(this.results);
    return {
      replayEvents: this.replayEvents,
      originalKeys: this.originalAlignment.all(),
      replayKeys: this.replayAlignment.all(),
      gaps: { events: this.gapEvents, sessions: this.gapSessions, commands: this.gapCommands },
      standIns: this.standIns,
      failures: this.failures,
      issueFailures: this.issueFailures,
      sessionIds: this.sessionTranslation(),
      replayManifest
    };
  }

  /** Whether Core already derived the replay's counterpart of `event`. */
  private derived(event: ClientGatewayTraceEvent): boolean {
    const key = this.originalAlignment.keyOf(event.eventId);
    return key !== undefined && this.derivedKeys.has(key);
  }

  private async drive(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    if (event.session === undefined && CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS.has(event.kind)) this.gap(event, this.unreferencedGap);
    else if (event.kind === "inbound") await this.feedInbound(event, index);
    else if (event.kind === "artifact") await this.feedArtifact(event, index);
    else if (event.kind === "outbound") await this.driveOutbound(event, index);
    else if (event.kind === "synthesized") await this.driveSynthesized(event, index);
    else if (event.kind === "lifecycle") await this.driveLifecycle(event, index);
  }

  /** Each session that existed before the trace began, paired while nothing claims it, so nothing is recorded (its hello: `./stand-in-hello.ts`). */
  private async attachPresentSessions(): Promise<void> {
    const gateway = this.replay.gateway;
    for (const session of this.sessions.values()) {
      if (session.connectedInTrace) continue;
      const clientId = session.clientId ?? `client.replay.${session.ref}`;
      this.sources.arm({ atMs: this.manifest.clockOrigin.epochMs, messages: [], commandIds: [], nonces: [] });
      const live = gateway.connect({ socket: REPLAY_SOCKET });
      const hello = readClientGatewayTraceHello(clientGatewayTraceStandInHello(session, clientId));
      if (hello !== undefined) await gateway.receive(live.sessionId, this.helloMessage(session.ref, hello));
      const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === live.sessionId);
      if (pairing === undefined) {
        this.gapSessions.set(session.ref, "the replay could not pair a session to stand in for it");
        continue;
      }
      await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: REPLAY_OPERATOR });
      this.replaySessions.set(session.ref, live.sessionId);
    }
  }

  private async feedInbound(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const sessionId = this.replaySession(event);
    const text = sessionId === undefined ? undefined : this.inboundText(event);
    if (sessionId === undefined || text === undefined) return;
    this.arm(index, this.observedMs(event), [], []);
    try {
      await this.replay.gateway.receiveRaw(sessionId, text);
    } catch {
      /* best-effort: a message Core refused to take is recorded with its disposition, which is what gets compared */
    }
    await this.settle();
    await this.absorb(this.originalAlignment.keyOf(event.eventId));
  }

  /** The text to feed for a recorded inbound event, or `undefined` (noted as a gap) when the trace withheld what Core read. */
  private inboundText(event: ClientGatewayTraceEvent): string | undefined {
    const input = readClientGatewayTraceInboundText(event);
    if ("gap" in input) return this.gap(event, input.gap);
    if (input.standIn) this.standIns.add(event.sequence);
    return input.text;
  }

  private async feedArtifact(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const sessionId = this.replaySession(event);
    if (sessionId === undefined) return;
    const entry = this.manifest.artifacts.find((artifact) => artifact.id === event.artifactIds[0]);
    const bytes = entry === undefined ? undefined : await this.store.readArtifact(this.manifest.traceId, entry.id);
    if (entry === undefined || bytes === undefined) {
      this.gap(event, "the artifact's bytes are not in the store");
      return;
    }
    this.arm(index, this.observedMs(event), [], []);
    this.replay.gateway.receiveTraceArtifact(sessionId, { sha256: entry.sha256, mediaType: entry.mediaType, bytes });
    await this.settle();
    await this.absorb(this.originalAlignment.keyOf(event.eventId));
  }

  private async driveOutbound(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    if (event.messageType === "server.execute_action") await this.issueAction(event, index);
    else if (event.messageType !== null && CALLER_COMMANDS.has(event.messageType)) await this.issueCallerCommand(event, index);
    else await this.runOutWait(event, index);
  }

  private async issueAction(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const sessionId = this.replaySession(event);
    if (sessionId === undefined) return;
    const recorded = readClientGatewayTraceRecordedCommand(event);
    if ("unreadable" in recorded) {
      this.gap(event, recorded.unreadable);
      return;
    }
    const durable = recorded.durableOwner;
    this.arm(index, readClientGatewayTraceMessageStamp(event)?.timestamp ?? this.observedMs(event), durable === null ? [recorded.commandId] : [], []);
    const context = this.replay.context;
    context.current = recorded.stamped ? this.replay.recorder : undefined;
    context.owner = durable === null ? ownerRef(event.correlation.owner) : undefined;
    context.lease = recorded.lease ?? undefined;
    try {
      const result = durable === null
        ? this.replay.gateway.executeAction(sessionId, recorded.command).result
        : this.replay.gateway.executeAction(sessionId, recorded.command, { context: ClientGatewayCommandContext.issue(durable) }).result;
      this.results.push(result.then(() => undefined, (error: unknown) => this.noteResultFailure(event, error)));
    } catch (error) {
      this.issueFailures.set(event.sequence, `the replayed gateway refused to issue it: ${messageOf(error)}`);
    } finally {
      context.current = undefined;
      context.owner = undefined;
      context.lease = undefined;
    }
    await this.settle();
    await this.absorb(undefined);
  }

  private async issueCallerCommand(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const sessionId = this.replaySession(event);
    const message = event.payload.encoding === "json" ? event.payload.value : null;
    const body = isRecord(message) ? message.payload : null;
    if (sessionId === undefined || event.messageType === null || !isRecord(body)) return;
    const nonce = event.messageType === "server.ping" && typeof body.nonce === "string" ? [body.nonce] : [];
    this.arm(index, readClientGatewayTraceMessageStamp(event)?.timestamp ?? this.observedMs(event), [], nonce);
    this.replay.context.current = this.replay.recorder;
    try {
      await issueClientGatewayTraceCallerCommand(this.replay.gateway, sessionId, event.messageType, body);
    } catch (error) {
      this.issueFailures.set(event.sequence, `the replayed gateway refused to issue it: ${messageOf(error)}`);
    } finally {
      this.replay.context.current = undefined;
    }
    await this.settle();
    await this.absorb(undefined);
  }

  private async driveSynthesized(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const value = event.payload.encoding === "json" ? event.payload.value : null;
    const outcome = isRecord(value) ? value.outcome : undefined;
    if (outcome === "refused_unsent") {
      this.gap(event, "the refusal depended on host-lease or channel-scope state the trace does not hold");
      return;
    }
    if (outcome !== "gateway_closed") {
      await this.runOutWait(event, index);
      return;
    }
    this.arm(index, this.observedMs(event), [], []);
    await this.closeGateway();
    await this.settle();
    await this.absorb(undefined);
  }

  /** An event Core produced when a command's answer wait ran out: the replay runs that wait out now. */
  private async runOutWait(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const commandId = event.correlation.commandId;
    if (commandId !== null && this.timers.pending(commandId)) {
      this.arm(index, this.observedMs(event), [], []);
      this.timers.fire(commandId);
      await this.settle();
      await this.absorb(undefined);
    }
    const unknownCapabilities = event.session === undefined || this.sessions.get(event.session)?.capabilities === null;
    if (commandId !== null && !this.derived(event) && event.messageType === "server.reconcile_command" && unknownCapabilities) {
      this.gapCommands.set(commandId, "the trace does not say what the session's capabilities were, so the replay cannot know it answers reconcile questions");
    }
  }

  private async driveLifecycle(event: ClientGatewayTraceEvent, index: number): Promise<void> {
    const value = event.payload.encoding === "json" && isRecord(event.payload.value) ? event.payload.value : {};
    if (event.messageType === "session.connected") {
      await this.connect(event, index, value);
      return;
    }
    // A claim's view is what the session was attached with; the replay's own tap records its claim when Core first claims the session.
    if (event.messageType === CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS.sessionClaimed) return;
    if (event.messageType !== "session.disconnected" && event.messageType !== "pairing.approved") {
      this.gap(event, `the replay cannot reproduce lifecycle event ${event.messageType ?? "(untyped)"}`);
      return;
    }
    const sessionId = this.replaySession(event);
    if (sessionId === undefined) return;
    this.arm(index, this.observedMs(event), [], []);
    if (event.messageType === "session.disconnected") this.replay.gateway.disconnect(sessionId, typeof value.reason === "string" ? value.reason : undefined);
    else await this.approve(event, sessionId);
    await this.settle();
    await this.absorb(undefined);
  }

  private async connect(event: ClientGatewayTraceEvent, index: number, value: JsonRecord): Promise<void> {
    const ref = event.session;
    if (ref === undefined) return; // `drive` noted the gap: an event that names no session is never fed
    if (event.redactions.length > 0) this.gap(event, "the hello's credential was withheld at capture, and Core's decision to resume the session depended on it");
    const hello = readClientGatewayTraceHello(value.hello);
    this.arm(index, this.observedMs(event), [], []);
    const session = this.replay.gateway.connect({ socket: REPLAY_SOCKET, ...(hello !== undefined ? { hello } : {}) });
    this.replaySessions.set(ref, session.sessionId);
    await this.settle();
    await this.absorb(undefined);
  }

  private async approve(event: ClientGatewayTraceEvent, sessionId: string): Promise<void> {
    const pairing = this.replay.gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId);
    if (pairing === undefined) return;
    try {
      await this.replay.gateway.approvePairing(pairing.pairingCode, { approvedByUserId: REPLAY_OPERATOR });
    } catch (error) {
      this.issueFailures.set(event.sequence, `the replayed gateway refused to issue it: ${messageOf(error)}`);
    }
  }

  private async closeGateway(): Promise<void> {
    try {
      await this.replay.gateway.close();
    } catch (error) {
      this.failures.push(`the replayed gateway failed to close: ${messageOf(error)}`);
    }
  }

  /** Arms the ids and clock of the step starting at `index`. */
  private arm(index: number, atMs: number, commandIds: readonly string[], nonces: readonly string[]): void {
    this.sources.arm({ atMs, messages: clientGatewayTraceStepMessages(this.events, index), commandIds, nonces });
  }

  /** Lets what Core started finish: done once no new event was recorded for `quietTurns` turns of the event loop. */
  private async settle(): Promise<void> {
    let quiet = 0;
    let seen = this.replay.recorder.status().lastSequence;
    for (let turn = 0; turn < MAX_SETTLE_TURNS && quiet < this.quietTurns; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const now = this.replay.recorder.status().lastSequence;
      quiet = now === seen ? quiet + 1 : 0;
      seen = now;
    }
  }

  /** Reads what the replay recorded since last time and keys it; the first input among it was fed for `inputKey`. */
  private async absorb(inputKey: string | undefined): Promise<void> {
    await this.replay.recorder.flush();
    const last = this.replay.recorder.status().lastSequence;
    if (last <= this.absorbed) return;
    const fresh = await this.replay.store.readEventRange(this.manifest.traceId, this.absorbed + 1, last);
    this.absorbed = last;
    let input = inputKey;
    for (const event of fresh) {
      const fed = event.kind === "inbound" || event.kind === "artifact" ? input : undefined;
      if (fed !== undefined) input = undefined;
      this.derivedKeys.add(this.replayAlignment.key(event, fed));
      this.replayEvents.push(event);
    }
  }

  /** The replay's session standing in for the one `event` belongs to, or `undefined`, noted as a gap. */
  private replaySession(event: ClientGatewayTraceEvent): string | undefined {
    if (event.session === undefined) return this.gap(event, this.unreferencedGap);
    const sessionId = this.replaySessions.get(event.session);
    if (sessionId === undefined) return this.gap(event, this.gapSessions.get(event.session) ?? `no session stands in for ${event.session}`);
    return sessionId;
  }

  private sessionTranslation(): Map<string, string> {
    const translation = new Map<string, string>();
    for (const [ref, replaySessionId] of this.replaySessions) {
      const recorded = this.sessions.get(ref)?.sessionId;
      if (recorded !== undefined && recorded !== null) translation.set(replaySessionId, recorded);
    }
    return translation;
  }

  private helloMessage(ref: string, payload: ClientGatewayClientHello): Extract<ClientGatewayClientMessage, { type: "client.hello" }> {
    return { id: `replay-hello-${ref}`, type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: this.sources.now(), payload };
  }

  private observedMs(event: ClientGatewayTraceEvent): number {
    return this.manifest.clockOrigin.epochMs + event.time.logicalMs;
  }

  private gap(event: ClientGatewayTraceEvent, reason: string): undefined {
    if (!this.gapEvents.has(event.sequence)) this.gapEvents.set(event.sequence, reason);
    return undefined;
  }

  private noteResultFailure(event: ClientGatewayTraceEvent, error: unknown): void {
    if (event.correlation.commandId !== null) this.gapCommands.set(event.correlation.commandId, `the replayed command failed: ${messageOf(error)}`);
  }
}

function ownerRef(owner: unknown): ClientGatewayCommandOwnerRef | undefined {
  return isOwnerRef(owner) ? owner : undefined;
}

function isOwnerRef(value: unknown): value is ClientGatewayCommandOwnerRef {
  return isRecord(value) && typeof value.projectId === "string" && typeof value.runId === "string";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
