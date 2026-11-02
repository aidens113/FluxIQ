// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../../client-gateway/index.ts";
import { AutomationStudioService } from "../../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "../index.ts";

let directory = "";
const services: AutomationStudioService[] = [];
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "recording-context-")); });
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()));
  await rm(directory, { recursive: true, force: true });
});
const header = (id: string) => ({ id, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now() });

async function setup() {
  const service = new AutomationStudioService({ dataDir: directory, seedFixture: false });
  services.push(service);
  const gateway = new ClientGatewayService();
  const session = gateway.connect();
  await gateway.receive(session.sessionId, { ...header("hello"), type: "client.hello", payload: { clientId: "context-client", clientType: "custom", name: "Context client" } });
  const pairing = gateway.snapshot().pairings[0];
  if (!pairing) throw new Error("test.pairing_missing");
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "operator" });
  return { service, gateway, session };
}

it.each(["provider", "requested"] as const)("uses the %s-approved project through create, ack, entry and Stop, with the original provider receiver", async destination => {
  const h = await setup();
  const projectP = await h.service.createProject({ name: "Provider project" });
  const projectQ = await h.service.createProject({ name: "Requested project" });
  const approved = destination === "provider" ? projectP.id : projectQ.id;
  const decoy = destination === "provider" ? projectQ.id : projectP.id;
  await h.service.createRecording({ projectId: decoy, recordingId: "same-id", description: "An existing demonstration", initialState: { timestamp: 1, namespaces: {} } });
  let receiver: unknown;
  const requests: unknown[] = [];
  const bridge = new AutomationStudioClientGatewayBridge({
    gateway: h.gateway, automationStudio: h.service, stopDrainMs: 0,
    clientRecordingContextProvider: function (this: unknown, input) {
      receiver = this;
      requests.push(input.request);
      return { ok: true, projectId: approved };
    }
  });
  const create = vi.spyOn(h.service, "createRecording");
  const start = { recordingId: "same-id", projectId: projectQ.id, description: "A new demonstration" };
  await h.gateway.receive(h.session.sessionId, { ...header("start"), type: "client.start_recording", payload: start });
  expect(receiver).toBe(bridge);
  expect(requests).toEqual([start]);
  expect(requests[0]).toBe(start);
  expect(create.mock.calls[0]?.[0].projectId).toBe(approved);
  const ack = h.gateway.outbound(h.session.sessionId).find(message => message.type === "server.start_recording");
  expect(ack?.payload).toMatchObject({ recordingId: "same-id", projectId: approved });
  await h.gateway.receive(h.session.sessionId, { ...header("entry"), type: "client.recording_entry", payload: { recordingId: "same-id", projectId: decoy, entry: { type: "marker", label: "owned entry" } } });
  await h.gateway.receive(h.session.sessionId, { ...header("stop"), type: "client.stop_recording", payload: { recordingId: "same-id", projectId: decoy } });
  const stored = await h.service.getRecordingSession("same-id", approved);
  expect(stored.timeline).toMatchObject([{ type: "marker", label: "owned entry" }]);
  expect(stored.endedAt).toBeDefined();
  const untouched = await h.service.getRecordingSession("same-id", decoy);
  expect(untouched.timeline).toEqual([]);
  expect(untouched.endedAt).toBeUndefined();
});

it("preserves explicit client projects without a provider and trusted host request/session precedence", async () => {
  const h = await setup();
  const projectP = await h.service.createProject({ name: "First project" });
  const projectQ = await h.service.createProject({ name: "Second project" });
  const bridge = new AutomationStudioClientGatewayBridge({ gateway: h.gateway, automationStudio: h.service, stopDrainMs: 0 });
  await h.gateway.receive(h.session.sessionId, { ...header("explicit"), type: "client.start_recording", payload: { recordingId: "explicit", projectId: projectP.id, description: "A demonstration" } });
  await bridge.stopRecording(h.session.sessionId);
  expect((await h.service.getRecordingSession("explicit", projectP.id)).endedAt).toBeDefined();
  const provider = vi.fn(() => ({ ok: true as const, projectId: projectQ.id }));
  bridge.setClientRecordingContextProvider(provider);
  await bridge.startRecording({ sessionId: h.session.sessionId, recordingId: "inherit", description: "Inherit the trusted session" });
  await bridge.stopRecording(h.session.sessionId);
  expect((await h.service.getRecordingSession("inherit", projectP.id)).endedAt).toBeDefined();
  await bridge.startRecording({ sessionId: h.session.sessionId, projectId: projectQ.id, recordingId: "host-explicit", description: "Use the trusted host project" });
  await bridge.stopRecording(h.session.sessionId);
  expect((await h.service.getRecordingSession("host-explicit", projectQ.id)).endedAt).toBeDefined();
  expect(provider).not.toHaveBeenCalled();
});
