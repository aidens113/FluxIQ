// A channel-scoped session (traces and offline trials, P1) replays or scripts a
// client. What it sends, and the answers to what is sent to it, must never be
// taken in as live observations: no recording is opened for it and nothing it
// produces is appended to one.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../../client-gateway/index.ts";
import { AutomationStudioService } from "../../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "../bridge.ts";

const services: AutomationStudioService[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(services.splice(0).map((service) => service.close()));
});

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

function setup() {
  let current: string | undefined;
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1000, channelScope: { current: () => current } });
  const automationStudio = new AutomationStudioService({ seedFixture: false });
  services.push(automationStudio);
  const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, stopDrainMs: 0 });
  const writes = [
    vi.spyOn(automationStudio, "createRecording"),
    vi.spyOn(automationStudio, "appendRecordingEvent"),
    vi.spyOn(automationStudio, "appendRecordingEvents"),
    vi.spyOn(automationStudio, "appendRecordingDomainEvent")
  ];
  const sent: string[] = [];
  const scoped = gateway.attachScopedSession({
    scopeId: "scope.bridge",
    socket: { send: (raw) => { sent.push(raw); } },
    hello: { clientType: "custom", name: "Scripted client", capabilities: [{ id: "synthetic.actions", kind: "action", actionTypes: ["synthetic.act"] }] }
  });
  return { gateway, bridge, writes, scoped, sent, enter: (scopeId: string | undefined) => { current = scopeId; } };
}

describe("AutomationStudioClientGatewayBridge and channel-scoped sessions", () => {
  it("opens no recording and appends nothing for what a scoped session sends", async () => {
    const { gateway, writes, scoped, sent } = setup();

    await gateway.receive(scoped.sessionId, message("client.start_recording", { description: "Shows the steps the automation repeats.", recordingId: "recording.scoped", initialState: { timestamp: 1, namespaces: {} } }));
    await gateway.receive(scoped.sessionId, message("client.recording_entry", { recordingId: "recording.scoped", entry: { type: "marker", label: "replayed" } }));
    await gateway.receive(scoped.sessionId, message("client.recording_event", { recordingId: "recording.scoped", domainId: "synthetic", eventType: "synthetic.observed", payload: { n: 1 } }));
    await gateway.receive(scoped.sessionId, message("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } }));
    await gateway.receive(scoped.sessionId, message("client.state_update", { state: { n: 1 } }));
    await gateway.receive(scoped.sessionId, message("client.error", { message: "replayed error" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const write of writes) expect(write).not.toHaveBeenCalled();
    expect(sent.map((raw) => (JSON.parse(raw) as { type: string }).type)).toEqual([]);
  });

  it("refuses to start a recording on a scoped session", async () => {
    const { bridge, writes, scoped } = setup();

    await expect(bridge.startRecording({ description: "Shows the steps the automation repeats.", sessionId: scoped.sessionId })).rejects.toThrow("recording.scoped_session_refused");
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("returns a scoped session's answer to the caller inside its scope without appending it to any recording", async () => {
    const { gateway, bridge, writes, scoped, sent, enter } = setup();
    enter("scope.bridge");

    const pending = bridge.executeAction(scoped.sessionId, { actionType: "synthetic.act", parameters: { n: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const command = JSON.parse(sent[0]!) as { type: string; payload: { commandId: string } };
    expect(command.type).toBe("server.execute_action");
    await gateway.receive(scoped.sessionId, message("client.action_result", { commandId: command.payload.commandId, status: "succeeded", payload: { n: 2 } }));

    await expect(pending).resolves.toMatchObject({ status: "succeeded", payload: { n: 2 } });
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("answers outside the scope with the gateway's refusal, unsent, and appends nothing", async () => {
    const { bridge, writes, scoped, sent } = setup();

    await expect(bridge.executeAction(scoped.sessionId, { actionType: "synthetic.act" })).resolves.toMatchObject({ status: "failed", failure: { code: "channel_scope.scoped_session" } });
    expect(sent).toEqual([]);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
});
