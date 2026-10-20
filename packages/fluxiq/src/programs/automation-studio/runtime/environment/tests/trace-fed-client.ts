// A trace-fed gateway client for unit tests (traces and offline trials, P4
// groundwork; lane T U8). Built only from a trace store's indexed reads, it is
// attached as a scoped session and answers each `server.execute_action` with
// the inbound text the trace recorded for the matching command.
//
// The match is the external call -- action type, canonical parameters and
// occurrence -- never a node id. The recorded text is fed through
// `receiveRaw`, Core's real decoder, with one change: the recorded command id
// is replaced by the new command's id. That is transport-correlation
// bookkeeping, not evidence; every other byte stays as recorded. A command the
// trace holds no answer for is answered at once with a non-retryable,
// classified failure whose code is an evidence gap from the offline-trial
// reason vocabulary, and it consumes no recorded answer.
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientHello, type ClientGatewayService, type ClientGatewaySession, type ClientGatewayTraceEvent, type ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialEvidenceReasonCode } from "../../../model/index.ts";

type RecordedCommand = {
  readonly key: string;
  readonly actionType: string;
  readonly occurrence: number;
  readonly commandId: string;
};

export class TraceFedGatewayClient {
  /** Every server message this client was sent, parsed. */
  readonly received: unknown[] = [];
  /** Every text this client handed `receiveRaw`, in order. */
  readonly fedTexts: string[] = [];
  /** Problems feeding an answer; a test expects none. */
  readonly errors: string[] = [];
  private readonly counts = new Map<string, number>();
  private readonly gateway: ClientGatewayService;
  private readonly store: ClientGatewayTraceStore;
  private readonly traceId: string;
  private readonly commands: readonly RecordedCommand[];
  private sessionId: string | undefined;
  private pending: Promise<void> = Promise.resolve();

  private constructor(gateway: ClientGatewayService, store: ClientGatewayTraceStore, traceId: string, commands: readonly RecordedCommand[]) {
    this.gateway = gateway;
    this.store = store;
    this.traceId = traceId;
    this.commands = commands;
  }

  /** Reads the trace's recorded outbound commands from the store and builds a client over them. */
  static async load(gateway: ClientGatewayService, store: ClientGatewayTraceStore, traceId: string): Promise<TraceFedGatewayClient> {
    const manifest = await store.readManifest(traceId);
    if (manifest === undefined) throw new Error(`trace ${traceId} has no manifest`);
    const events = await store.readEventRange(traceId, 1, manifest.completeness.lastSequence);
    return new TraceFedGatewayClient(gateway, store, traceId, recordedCommands(events));
  }

  /** Attaches this client under `scopeId`; it answers only what reaches it there. */
  attach(scopeId: string, hello: ClientGatewayClientHello): ClientGatewaySession {
    const session = this.gateway.attachScopedSession({ scopeId, socket: { send: (raw) => this.onSend(raw) }, hello });
    this.sessionId = session.sessionId;
    return session;
  }

  /** Resolves once every answer started so far has been fed. */
  settled(): Promise<void> {
    return this.pending;
  }

  private onSend(raw: string): void {
    const message: unknown = JSON.parse(raw);
    this.received.push(message);
    if (stringField(message, "type") !== "server.execute_action") return;
    const payload = field(message, "payload");
    const actionType = stringField(payload, "actionType") ?? "";
    const commandId = stringField(payload, "commandId") ?? "";
    const key = callKey(actionType, field(payload, "parameters") ?? {});
    const occurrence = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, occurrence);
    const recorded = this.commands.find((command) => command.key === key && command.occurrence === occurrence);
    const sessionId = this.sessionId!;
    const answer = recorded === undefined ? Promise.resolve(gapText(commandId, this.gapFor(actionType, key))) : this.recordedAnswer(recorded, commandId);
    this.pending = this.pending.then(() => answer.then((text) => this.feed(sessionId, text))).catch((error: unknown) => {
      this.errors.push(error instanceof Error ? error.message : String(error));
    });
  }

  /** An action type the trace holds with other parameters is an argument mismatch; otherwise the trace holds no such transition. */
  private gapFor(actionType: string, key: string): AutomationStudioTrialEvidenceReasonCode {
    const sameKey = this.commands.some((command) => command.key === key);
    const sameAction = this.commands.some((command) => command.actionType === actionType);
    return !sameKey && sameAction ? "argument_mismatch" : "missing_transition";
  }

  private async recordedAnswer(recorded: RecordedCommand, commandId: string): Promise<string> {
    const correlated = await this.store.readEventsByCorrelation(this.traceId, "commandId", recorded.commandId);
    const inbound = correlated.find((event) => event.kind === "inbound" && event.messageType === "client.action_result" && event.payload.encoding === "text");
    if (inbound === undefined || inbound.payload.encoding !== "text") return gapText(commandId, "missing_transition");
    const from = commandIdMember(recorded.commandId);
    const parts = inbound.payload.text.split(from);
    if (parts.length !== 2) return gapText(commandId, "incomplete_capture");
    return parts.join(commandIdMember(commandId));
  }

  private async feed(sessionId: string, text: string): Promise<void> {
    this.fedTexts.push(text);
    await this.gateway.receiveRaw(sessionId, text);
  }
}

/** The recorded `server.execute_action` commands, in delivery order, each with its occurrence among calls of the same key. */
function recordedCommands(events: readonly ClientGatewayTraceEvent[]): RecordedCommand[] {
  const counts = new Map<string, number>();
  const commands: RecordedCommand[] = [];
  for (const event of events) {
    if (event.kind !== "outbound" || event.messageType !== "server.execute_action" || event.payload.encoding !== "json") continue;
    const payload = field(event.payload.value, "payload");
    const actionType = stringField(payload, "actionType");
    const commandId = event.correlation.commandId;
    if (actionType === null || commandId === null) continue;
    const key = callKey(actionType, field(payload, "parameters") ?? {});
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    commands.push({ key, actionType, occurrence, commandId });
  }
  return commands;
}

/** The JSON member that carries a command id in an answer's text. */
function commandIdMember(commandId: string): string {
  return `"commandId":${JSON.stringify(commandId)}`;
}

/** The answer to a command the trace cannot serve: non-retryable, unacted, coded by its evidence gap. */
function gapText(commandId: string, gap: AutomationStudioTrialEvidenceReasonCode): string {
  const failure = { category: "blocked_by_capability_or_policy", code: gap, retryable: false, stage: "dispatch", effect: "unacted" };
  const result = { commandId, status: "failed", error: `The trace holds no answer for this call (${gap}).`, failure };
  return JSON.stringify({ id: `trace-gap.${commandId}`, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: result });
}

/** The external call a command makes: its action type and its parameters with every object's keys in order. */
function callKey(actionType: string, parameters: unknown): string {
  return `${actionType} ${JSON.stringify(canonical(parameters))}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value).sort();
  return Object.fromEntries(keys.map((key) => [key, canonical(Reflect.get(value, key))]));
}

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Reflect.get(value, key);
}

function stringField(value: unknown, key: string): string | null {
  const found = field(value, key);
  return typeof found === "string" ? found : null;
}
