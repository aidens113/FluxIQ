import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../client-gateway";
import { AutomationStudioService } from "../runtime/service";
import { AutomationStudioClientGatewayBridge } from "./bridge";

describe("AutomationStudioClientGatewayBridge", () => {
  it("stores remote client evidence in Automation Studio recordings", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.test",
      clientType: "browser-extension",
      name: "Test extension",
      capabilities: [{ id: "browser.actions", kind: "action", actionTypes: ["click"] }]
    }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "");

    const recording = await bridge.startRecording({ sessionId: session.sessionId, taskId: "task.web" });
    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      eventType: "click",
      target: { selector: "#submit" },
      payload: { button: 0 }
    }));

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline).toHaveLength(1);
    expect(stored.timeline[0]).toMatchObject({ type: "domain_event", eventType: "click" });
  });

  it("records remote action results when a client command resolves", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "worker.test", clientType: "worker", name: "Worker" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "");
    const recording = await bridge.startRecording({ sessionId: session.sessionId });

    const resultPromise = bridge.executeAction(session.sessionId, { actionType: "click", parameters: { selector: "#save" } });
    const command = gateway.outbound(session.sessionId).find((message) => message.type === "server.execute_action");
    expect(command?.type).toBe("server.execute_action");
    await gateway.receive(session.sessionId, clientMessage("client.action_result", {
      commandId: command?.payload.commandId ?? "",
      status: "succeeded",
      message: "clicked"
    }));
    await expect(resultPromise).resolves.toMatchObject({ status: "succeeded" });

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline.some((entry) => entry.type === "action" && entry.actionType === "click")).toBe(true);
  });
});

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
