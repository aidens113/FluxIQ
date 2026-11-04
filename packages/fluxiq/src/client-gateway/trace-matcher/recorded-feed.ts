// What a recorded trace is fed to a trial's gateway through: a scoped session whose
// socket is the caller, the recorded inputs and artifacts given to Core's real intake in
// recorded order on the trial's clock, recorded command ids translated, and a recorded
// reconcile answer held until the gateway asks that question. Both readers of a trace use
// it: the strict matcher (`./matcher.ts`) and the state engine (`../trace-state/engine.ts`).
// They differ in which recorded answer stands for a command, never in how it is fed.
//
// A recorded event or artifact that cannot be read or fed when its point comes is handed
// to `onFailedDelivery`, and the rest of the segment is still fed, so the command it
// answers is not left waiting. What the gateway does with an input it was handed (it may
// throw, as it may have for the original) stays a note in `refusedDeliveries`.

import type { ClientGatewayClientHello, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTraceEvent, ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../trace/index.ts";
import { readClientGatewayTraceInboundText } from "../trace-replay/index.ts";
import { translateClientGatewayTraceCommandIds } from "./command-id-translation.ts";
import type {
  ClientGatewayTraceMatcherClock,
  ClientGatewayTraceMatcherDelivery,
  ClientGatewayTraceMatcherGap,
  ClientGatewayTraceMatcherGapReason,
  ClientGatewayTraceMatcherGateway
} from "./types.ts";

/** The command a delivery came after: the one whose recorded segment holds it. */
export type ClientGatewayTraceDeliveredAfter = Pick<ClientGatewayTraceMatcherGap, "ordinal" | "commandId" | "actionType">;

/** What the trace delivered before its first operation came after: no command. */
export const CLIENT_GATEWAY_TRACE_OPENING: ClientGatewayTraceDeliveredAfter = Object.freeze({ ordinal: 0, commandId: "", actionType: "" });

/** A recorded reconcile answer held for its question, with the command its segment came after. */
type HeldDelivery = { readonly delivery: ClientGatewayTraceMatcherDelivery; readonly after: ClientGatewayTraceDeliveredAfter };

export type ClientGatewayTraceRecordedFeedInput = {
  readonly store: ClientGatewayTraceStore;
  readonly traceId: string;
  readonly gateway: ClientGatewayTraceMatcherGateway;
  readonly clock: ClientGatewayTraceMatcherClock;
  readonly manifest: () => ClientGatewayTraceManifest | null;
  readonly onFailedDelivery: (after: ClientGatewayTraceDeliveredAfter, reason: ClientGatewayTraceMatcherGapReason, recordedSequence: number) => void;
};

export class ClientGatewayTraceRecordedFeed {
  private readonly input: ClientGatewayTraceRecordedFeedInput;
  /** Each answered operation's recorded command id to the id the trial's gateway gave it. */
  private readonly ids = new Map<string, string>();
  /** Command ids the trial's gateway asked a reconcile question about. */
  private readonly asked = new Set<string>();
  /** Recorded reconcile answers waiting for their question, by the trial's command id. */
  private readonly held = new Map<string, HeldDelivery[]>();
  /** The recorded sequences handed to the gateway, in the order they were handed. */
  readonly delivered: number[] = [];
  /** Notes of what the gateway would not take, and of what failed around it. */
  readonly refusedDeliveries: string[] = [];
  private sessionId: string | undefined;

  constructor(input: ClientGatewayTraceRecordedFeedInput) {
    this.input = input;
  }

  /** Attaches the feed's session under `scopeId`, with `socket` as its transport. */
  attach(scopeId: string, socket: ClientGatewaySocket, hello: ClientGatewayClientHello): ClientGatewaySession {
    const session = this.input.gateway.attachScopedSession({ scopeId, socket, hello });
    this.sessionId = session.sessionId;
    return session;
  }

  /** Says which command id the trial's gateway gave a recorded command, for what is fed next. */
  translate(recordedCommandId: string, commandId: string): void {
    this.ids.set(recordedCommandId, commandId);
  }

  /**
   * Feeds `segment` (recorded after `after`) in recorded order, moving the clock to each
   * event's logical time measured from `fromMs`; an input whose sequence `replaced` names
   * is fed with that text in place of its recorded one.
   */
  async deliver(segment: readonly ClientGatewayTraceMatcherDelivery[], fromMs: number, after: ClientGatewayTraceDeliveredAfter, replaced?: ReadonlyMap<number, string>): Promise<void> {
    let at = fromMs;
    for (const delivery of segment) {
      if (delivery.atMs > at) {
        await this.input.clock.advance(delivery.atMs - at);
        at = delivery.atMs;
      }
      if (delivery.kind === "artifact") await this.feedArtifact(delivery, after);
      else if (delivery.kind === "input") await this.feedInput(delivery, after, replaced?.get(delivery.event.sequence));
    }
  }

  /** The trial's gateway asked about `commandId`: its recorded answers held for that question, to feed now. */
  release(commandId: string): readonly { readonly feed: () => Promise<void>; readonly after: ClientGatewayTraceDeliveredAfter }[] {
    this.asked.add(commandId);
    const held = this.held.get(commandId) ?? [];
    this.held.delete(commandId);
    return held.map((entry) => ({ feed: () => this.feedInput(entry.delivery, entry.after), after: entry.after }));
  }

  /** Feeds a text that is not recorded, as a gap's answer. */
  async receive(text: string, what: string): Promise<void> {
    if (this.sessionId === undefined) {
      this.refusedDeliveries.push(`${what}: the matcher's session is not attached`);
      return;
    }
    try {
      await this.input.gateway.receiveRaw(this.sessionId, text);
    } catch (error) {
      this.refusedDeliveries.push(`${what}: the gateway refused it: ${messageOf(error)}`);
    }
  }

  /** The gap that makes a segment unusable: an input the trace withheld or cannot write back. */
  unreadable(segment: readonly ClientGatewayTraceMatcherDelivery[]): ClientGatewayTraceMatcherGapReason | undefined {
    for (const delivery of segment) {
      if (delivery.kind !== "input") continue;
      const reason = unreadableReason(delivery.event);
      if (reason !== undefined) return reason;
    }
    return undefined;
  }

  /** Feeds a recorded input, or `replacement` in its place, with recorded command ids translated. */
  private async feedInput(delivery: ClientGatewayTraceMatcherDelivery, after: ClientGatewayTraceDeliveredAfter, replacement?: string): Promise<void> {
    const sequence = delivery.event.sequence;
    const read = replacement === undefined ? readClientGatewayTraceInboundText(delivery.event) : { text: replacement };
    if ("gap" in read) return this.input.onFailedDelivery(after, unreadableReason(delivery.event) ?? "incomplete_capture", sequence);
    const text = translateClientGatewayTraceCommandIds(read.text, this.ids);
    const question = delivery.event.messageType === "client.reconcile_result" ? reconciledCommandId(text) : undefined;
    if (question !== undefined && !this.asked.has(question)) {
      this.held.set(question, [...(this.held.get(question) ?? []), { delivery, after }]);
      return;
    }
    if (this.sessionId === undefined) return this.input.onFailedDelivery(after, "incomplete_capture", sequence);
    this.delivered.push(sequence);
    await this.receive(text, `sequence ${sequence}`);
  }

  /** Feeds a recorded artifact; one the store does not give back, or whose bytes the gateway refuses, is a `missing_artifact` gap. */
  private async feedArtifact(delivery: ClientGatewayTraceMatcherDelivery, after: ClientGatewayTraceDeliveredAfter): Promise<void> {
    const sequence = delivery.event.sequence;
    const artifactId = delivery.event.artifactIds[0];
    const entry = this.input.manifest()?.artifacts.find((artifact) => artifact.id === artifactId);
    const bytes = entry === undefined ? undefined : await this.input.store.readArtifact(this.input.traceId, entry.id);
    if (entry === undefined || bytes === undefined) return this.input.onFailedDelivery(after, "missing_artifact", sequence);
    if (this.sessionId === undefined) return this.input.onFailedDelivery(after, "incomplete_capture", sequence);
    const intake = this.input.gateway.receiveTraceArtifact(this.sessionId, { sha256: entry.sha256, mediaType: entry.mediaType, bytes });
    if (intake.status !== "accepted") return this.input.onFailedDelivery(after, "missing_artifact", sequence);
    this.delivered.push(sequence);
  }
}

/** Why a recorded input cannot be written back: withheld at capture, or not captured readably; `undefined` when it can. */
function unreadableReason(event: ClientGatewayTraceEvent): ClientGatewayTraceMatcherGapReason | undefined {
  const read = readClientGatewayTraceInboundText(event);
  if (!("gap" in read)) return undefined;
  return event.redactions.length > 0 ? "redacted_input" : "incomplete_capture";
}

/** The command a reconcile answer's text names, read only to hold it for its question; the text itself is fed unchanged. */
function reconciledCommandId(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    const payload = isRecord(value) ? value.payload : undefined;
    return isRecord(payload) && typeof payload.commandId === "string" ? payload.commandId : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
