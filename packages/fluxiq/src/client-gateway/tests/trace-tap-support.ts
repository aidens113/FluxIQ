// Test support for the gateway trace tap: a capture source over an async
// context, a recorder over a memory store declaring the tap's streams, a paired
// client whose socket keeps what it was sent, and client messages written by
// field name.

import { AsyncLocalStorage } from "node:async_hooks";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayTraceMemoryStore,
  ClientGatewayTraceRecorder,
  type ClientGatewayClientMessage,
  type ClientGatewayServerMessage,
  type ClientGatewayService,
  type ClientGatewayTraceCaptureSource,
  type ClientGatewayTraceEvent,
  type ClientGatewayTraceSink
} from "../index.ts";
import { CLIENT_GATEWAY_TRACE_TAP_STREAMS } from "../service/index.ts";

export type TraceScope = {
  source: ClientGatewayTraceCaptureSource;
  within<T>(sink: ClientGatewayTraceSink, work: () => T): T;
};

/** The program's side of D8 in miniature: the open trace held in an async context frame. */
export function traceScope(): TraceScope {
  const frame = new AsyncLocalStorage<ClientGatewayTraceSink>();
  return {
    source: { current: () => frame.getStore() },
    within: (sink, work) => frame.run(sink, work)
  };
}

export type OpenTrace = {
  traceId: string;
  recorder: ClientGatewayTraceRecorder;
  store: ClientGatewayTraceMemoryStore;
  events(): Promise<readonly ClientGatewayTraceEvent[]>;
};

export function openTrace(traceId: string): OpenTrace {
  const store = new ClientGatewayTraceMemoryStore();
  const recorder = new ClientGatewayTraceRecorder({
    traceId,
    episodeId: `run.${traceId}`,
    activity: "test",
    origin: { kind: "live" },
    contractVersions: { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION },
    capabilities: null,
    context: { schema: { name: "test-context", version: "1" }, value: null },
    streams: [CLIENT_GATEWAY_TRACE_TAP_STREAMS.gateway, CLIENT_GATEWAY_TRACE_TAP_STREAMS.artifact]
  }, { store, now: () => Date.now(), maxBufferedEvents: 10_000, maxBufferedArtifactBytes: 10_000_000 });
  return {
    traceId,
    recorder,
    store,
    events: async () => {
      await recorder.flush();
      return store.readEventRange(traceId, 1, recorder.status().lastSequence);
    }
  };
}

export type PairedClient = {
  sessionId: string;
  clientId: string;
  /** The bearer token Core handed the client when it paired. */
  token: string;
  /** Every message the socket was sent, parsed. */
  sent: ClientGatewayServerMessage[];
};

/** A client connected over a socket, said hello and was approved; the socket keeps what it was sent. */
export async function pairClient(gateway: ClientGatewayService, clientId: string, metadata: Record<string, string> = { domainId: "example.domain" }): Promise<PairedClient> {
  const sent: ClientGatewayServerMessage[] = [];
  const socket = { send: (raw: string) => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } };
  const session = gateway.connect({ socket });
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId, metadata }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId);
  if (pairing) await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.trace" });
  const ready = sent.find((item) => item.type === "server.session_ready");
  const token = ready?.type === "server.session_ready" ? ready.payload.token : "";
  gateway.clearOutbound(session.sessionId);
  return { sessionId: session.sessionId, clientId, token, sent };
}

export function clientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `${type}.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

export function ofKind(events: readonly ClientGatewayTraceEvent[], kind: ClientGatewayTraceEvent["kind"], messageType?: string): ClientGatewayTraceEvent[] {
  return events.filter((event) => event.kind === kind && (messageType === undefined || event.messageType === messageType));
}

export async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 400 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 1));
}
