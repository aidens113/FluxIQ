import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../client-gateway/index.ts";
import { stateValue } from "../model/index.ts";
import { AutomationStudioService } from "../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "./bridge.ts";

const tempRoot = path.join(process.cwd(), ".tmp", "automation-studio-client-gateway-bridge-test");

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("AutomationStudioClientGatewayBridge", () => {
  it("stores remote client evidence in Automation Studio recordings", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    automationStudio.registerRecordingDomain({
      domainId: "example.domain",
      label: "Example domain",
      schemaVersion: "0.1",
      events: [{ eventType: "signal.observed", label: "Signal observed", payloadSchema: { type: "object" } }]
    });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.test",
      clientType: "extension",
      name: "Test extension",
      capabilities: [{ id: "sample.actions", kind: "action", actionTypes: ["sample.action"] }]
    }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });

    const recording = await bridge.startRecording({ sessionId: session.sessionId, taskId: "task.sample" });
    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      domainId: "example.domain",
      eventType: "signal.observed",
      target: { id: "target.1" },
      payload: { value: 1 }
    }));

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline).toHaveLength(1);
    expect(stored.timeline[0]).toMatchObject({ type: "domain_event", eventType: "signal.observed" });
  });

  it("records remote action results when a client command resolves", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "worker.test", clientType: "worker", name: "Worker" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
    const recording = await bridge.startRecording({ sessionId: session.sessionId });

    const resultPromise = bridge.executeAction(session.sessionId, { actionType: "sample.action", parameters: { targetId: "target.1" } });
    const command = gateway.outbound(session.sessionId).find((message) => message.type === "server.execute_action");
    expect(command?.type).toBe("server.execute_action");
    await gateway.receive(session.sessionId, clientMessage("client.action_result", {
      commandId: command?.payload.commandId ?? "",
      status: "succeeded",
      message: "completed"
    }));
    await expect(resultPromise).resolves.toMatchObject({ status: "succeeded" });

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline.some((entry) => entry.type === "action" && entry.actionType === "sample.action")).toBe(true);
  });

  it("routes websocket recording events through registered domain contracts", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    automationStudio.registerRecordingDomain({
      domainId: "example.remote",
      label: "Example remote domain",
      schemaVersion: "0.1",
      events: [
        {
          eventType: "value.observed",
          label: "Value observed",
          payloadSchema: {
            type: "object",
            required: true,
            properties: {
              value: { type: "number", required: true, label: "Observed value" }
            }
          },
          stateReducer: ({ event, previousState }) => ({
            state: {
              timestamp: event.timestamp ?? Date.now(),
              namespaces: {
                ...previousState.namespaces,
                remote: {
                  schemaId: "example.remote",
                  schemaVersion: "0.1",
                  values: {
                    value: stateValue("number", Number(event.payload?.value ?? 0), event.timestamp ?? Date.now())
                  }
                }
              }
            }
          })
        }
      ]
    });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.domain", clientType: "extension", name: "Domain extension" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
    const recording = await bridge.startRecording({ sessionId: session.sessionId });

    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      domainId: "example.remote",
      eventType: "value.observed",
      payload: { value: 12 }
    }));

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline.map((entry) => entry.type)).toEqual(["domain_event", "state_delta", "state_checkpoint"]);
  });

  it("creates and finalizes recordings from client-initiated websocket lifecycle messages", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await automationStudio.createProject({ name: "Open Project" });
    new AutomationStudioClientGatewayBridge({
      gateway,
      automationStudio,
      clientRecordingContextProvider: () => ({ ok: true, projectId: project.id })
    });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "recorder.test", clientType: "custom", name: "Recorder" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });

    await gateway.receive(session.sessionId, clientMessage("client.start_recording", {
      recordingId: "recording.client-start",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} },
      metadata: { domainId: "example.lifecycle" }
    }));
    await gateway.receive(session.sessionId, clientMessage("client.recording_entry", {
      recordingId: "recording.client-start",
      entry: { type: "marker", label: "Client checkpoint" }
    }));
    await gateway.receive(session.sessionId, clientMessage("client.stop_recording", {
      recordingId: "recording.client-start",
      endedAt: 10
    }));

    const stored = await automationStudio.getRecordingSession("recording.client-start", project.id);
    expect(stored.environment.domainId).toBe("example.lifecycle");
    expect(stored.timeline).toHaveLength(1);
    expect(stored.endedAt).toBe(10);
  });

  it("rejects client-initiated recording starts when no project is open", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "recorder.blocked", clientType: "custom", name: "Recorder" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });

    await gateway.receive(session.sessionId, clientMessage("client.start_recording", {
      recordingId: "recording.blocked",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} }
    }));

    const error = gateway.outbound(session.sessionId).find((message): message is Extract<ReturnType<ClientGatewayService["outbound"]>[number], { type: "server.error" }> => message.type === "server.error" && message.payload.code === "recording.project_required");
    expect(error?.payload.message).toContain("open project");
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "recording.project_required")).toBe(true);
    await expect(automationStudio.getRecordingSession("recording.blocked")).rejects.toThrow("Unknown Automation Studio recording");
  });

  it("keeps in-process recording ownership across a trusted-client reconnect", async () => {
    const tokens = ["continuity-token", "continuity-rotated"];
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000, createToken: () => tokens.shift() ?? "unused" });
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
    const first = gateway.connect();
    await gateway.receive(first.sessionId, clientMessage("client.hello", { clientId: "worker.continuity", clientType: "worker", name: "Continuity worker" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.continuity" });
    await bridge.startRecording({ sessionId: first.sessionId, recordingId: "recording.continuity" });
    gateway.disconnect(first.sessionId);

    const second = gateway.connect();
    await gateway.receive(second.sessionId, clientMessage("client.hello", { clientId: "worker.continuity", clientType: "worker", token: "continuity-token" }));
    const action = bridge.executeAction(second.sessionId, { actionType: "continuity.action" });
    const command = gateway.outbound(second.sessionId).find((message) => message.type === "server.execute_action");
    await gateway.receive(second.sessionId, clientMessage("client.action_result", { commandId: command?.payload.commandId ?? "", status: "succeeded" }));
    await action;

    const stored = await automationStudio.getRecordingSession("recording.continuity");
    expect(stored.timeline).toContainEqual(expect.objectContaining({ type: "action", actionType: "continuity.action" }));
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
