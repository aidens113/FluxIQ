import { AsyncLocalStorage } from "node:async_hooks";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder, type ClientGatewayClientMessage, type ClientGatewayServerMessage, type ClientGatewayTraceSink } from "fluxiq/client-gateway";
import { registerTraceGateway, traceRuntime } from "./trace-runtime";

/** Public Core gateway, ordinary pairing and actual recorder/store, with an in-memory socket. */
export async function realTrace(tenant: "a" | "b") {
  const frame = new AsyncLocalStorage<ClientGatewayTraceSink>();
  const store = new ClientGatewayTraceMemoryStore();
  const traceId = "same-trace";
  const recorder = new ClientGatewayTraceRecorder({ traceId, episodeId: "same-episode", activity: "test", origin: { kind: "live" }, contractVersions: { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION }, capabilities: null, context: { schema: { name: "trace-route-fixture", version: "1" }, value: null }, streams: ["gateway", "artifact"] }, { store, now: Date.now, maxBufferedEvents: 10_000, maxBufferedArtifactBytes: 10_000_000 });
  const gateway = new ClientGatewayService({ trace: { current: () => frame.getStore() } });
  const sent: ClientGatewayServerMessage[] = [];
  const connected = gateway.connect({ socket: { send: raw => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } } });
  const hello: ClientGatewayClientMessage = { id: `hello-${tenant}`, type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { clientId: "same-client", clientType: "extension", name: "Trace fixture browser", metadata: { domainId: `domain-${tenant}` }, capabilities: [{ id: "capture", kind: "snapshot" }] } };
  await gateway.receive(connected.sessionId, hello);
  const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === connected.sessionId);
  if (!pairing) throw new Error("Real gateway fixture did not request approval.");
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: `person-${tenant}` });
  const ready = sent.find(message => message.type === "server.session_ready");
  if (ready?.type !== "server.session_ready") throw new Error("Real gateway fixture did not become ready.");
  gateway.markActiveRecording(connected.sessionId, { recordingId: "same-recording", projectId: "same-project" });
  const session = gateway.snapshot().sessions.find(item => item.sessionId === connected.sessionId);
  if (!session) throw new Error("Real gateway fixture lost its approved session.");
  traceRuntime.sessions.set(tenant, session);
  registerTraceGateway(tenant, gateway, ready.payload.token);
  await frame.run(recorder, () => gateway.captureSnapshot(session.sessionId));
  return { gateway, recorder, store, traceId, session, token: ready.payload.token };
}
