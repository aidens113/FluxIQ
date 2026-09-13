import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../../client-gateway/index.ts";
import { defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { stateValue } from "../../model/index.ts";
import { AutomationStudioService } from "../../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "../bridge.ts";

const tempRoot = path.join(process.cwd(), ".tmp", "automation-studio-client-gateway-bridge-test");

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("AutomationStudioClientGatewayBridge", () => {
  it("routes gateway inputId metadata through registered IO bindings", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const io = new IoRegistry();
    io.register({
      domainId: "extension.example",
      inputs: [defineInput({
        definition: { id: "element-pressed", title: "Element pressed", role: "action", outputId: "ui.activate" },
        mode: "stream",
        outputBinding: { outputId: "ui.activate", toPayload: (event) => ({ elementId: String((event.payload as { elementId: string }).elementId) }) }
      }), defineInput({
        definition: { id: "page-state", title: "Page state", role: "state" },
        mode: "stream"
      })],
      outputs: [defineOutput({
        definition: { id: "ui.activate", title: "Activate" },
        mode: "request",
        dispatch: (request) => ({ ok: true, outputId: request.outputId })
      })]
    });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.io", clientType: "extension", name: "Extension" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
    const recording = await bridge.startRecording({ sessionId: session.sessionId, domainId: "extension.example" });

    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      domainId: "extension.example",
      eventType: "dom.click",
      payload: { elementId: "confirm" },
      metadata: { inputId: "element-pressed" }
    }));
    await gateway.receive(session.sessionId, clientMessage("client.state_update", {
      state: { ready: true },
      metadata: { domainId: "extension.example", inputId: "page-state" }
    }));

    const stored = await automationStudio.getRecordingSession(recording.recordingId);
    expect(stored.timeline).toMatchObject([{
      type: "action",
      outputId: "ui.activate",
      parameters: { elementId: "confirm" },
      metadata: { inputId: "element-pressed", policyEligible: true }
    }, {
      type: "observation",
      observationType: "input.state",
      metadata: { inputId: "page-state", policyEligible: false }
    }]);
  });

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

  it("does not flush queued snapshots before ingesting a recording action", async () => {
    vi.useFakeTimers();
    try {
      const gateway = new ClientGatewayService();
      const automationStudio = new AutomationStudioService({ seedFixture: false });
      const appendBatchSpy = vi.spyOn(automationStudio, "appendRecordingEvents");
      automationStudio.registerRecordingDomain({
        domainId: "example.remote",
        label: "Example remote domain",
        schemaVersion: "0.1",
        events: [{ eventType: "clicked", label: "Clicked" }]
      });
      const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio });
      const session = gateway.connect();
      await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.domain", clientType: "extension", name: "Domain extension" }));
      await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
      const recording = await bridge.startRecording({ sessionId: session.sessionId });

      await gateway.receive(session.sessionId, clientMessage("client.snapshot", {
        kind: "state",
        timestamp: 2,
        state: { timestamp: 2, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { ready: { type: "boolean", value: true, observedAt: 2 } } } } }
      }));
      await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
        domainId: "example.remote",
        eventType: "clicked",
        timestamp: 3,
        payload: { target: "button.save" }
      }));

      expect(appendBatchSpy).not.toHaveBeenCalled();
      expect((await automationStudio.getRecordingSession(recording.recordingId)).timeline.map((entry) => entry.type)).toEqual(["domain_event"]);

      await vi.advanceTimersByTimeAsync(25);
      expect(appendBatchSpy).toHaveBeenCalledTimes(1);
      expect((await automationStudio.getRecordingSession(recording.recordingId)).timeline.map((entry) => entry.type)).toEqual(["domain_event", "observation"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates and finalizes recordings from client-initiated websocket lifecycle messages", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await automationStudio.createProject({ name: "Open Project" });
    const flow = await automationStudio.createFlow({ projectId: project.id, name: "Recorded Flow" });
    new AutomationStudioClientGatewayBridge({
      gateway,
      automationStudio,
      clientRecordingContextProvider: () => ({ ok: true, projectId: project.id, taskId: flow.flowId })
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
    expect(stored.taskId).toBe(flow.flowId);
    expect((await automationStudio.getFlow(project.id, flow.flowId)).expansion?.recordingIds).toEqual([stored.recordingId]);
    expect(stored.environment.domainId).toBe("example.lifecycle");
    expect(stored.timeline).toHaveLength(1);
    expect(stored.endedAt).toBe(10);
  });

  it("batches high-frequency client snapshots before finalizing", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const appendBatchSpy = vi.spyOn(automationStudio, "appendRecordingEvents");
    const project = await automationStudio.createProject({ name: "Buffered Project" });
    new AutomationStudioClientGatewayBridge({
      gateway,
      automationStudio,
      clientRecordingContextProvider: () => ({ ok: true, projectId: project.id })
    });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "recorder.buffered", clientType: "custom", name: "Buffered Recorder" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });

    await gateway.receive(session.sessionId, clientMessage("client.start_recording", {
      recordingId: "recording.buffered",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} }
    }));
    for (let index = 0; index < 20; index += 1) {
      await gateway.receive(session.sessionId, clientMessage("client.snapshot", {
        kind: "state",
        timestamp: index + 2,
        state: { timestamp: index + 2, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { index: { type: "integer", value: index, observedAt: index + 2 } } } } }
      }));
    }
    await gateway.receive(session.sessionId, clientMessage("client.stop_recording", {
      recordingId: "recording.buffered",
      endedAt: 50
    }));

    const stored = await automationStudio.getRecordingSession("recording.buffered", project.id);
    expect(stored.timeline).toHaveLength(20);
    expect(stored.endedAt).toBe(50);
    expect(appendBatchSpy).toHaveBeenCalledTimes(1);
    expect(appendBatchSpy.mock.calls[0]?.[0].entries).toHaveLength(20);
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

it("reports a client action that arrives after its recording was finalized", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: lateEventIoRegistry(), stopDrainMs: 0 });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.late", clientType: "extension", name: "Late extension" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
    const recording = await bridge.startRecording({ sessionId: session.sessionId, domainId: "extension.example" });
    await bridge.stopRecording(session.sessionId);

    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      domainId: "extension.example",
      eventType: "dom.click",
      payload: { elementId: "confirm" },
      metadata: { inputId: "element-pressed" }
    }));

    expect((await automationStudio.getRecordingSession(recording.recordingId)).timeline).toHaveLength(0);
    const discarded = gateway.snapshot().auditLog.filter((entry) => entry.type === "recording.action_discarded");
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.message).toContain(recording.recordingId);
    expect(discarded[0]?.metadata).toMatchObject({
      sessionId: session.sessionId,
      recordingId: recording.recordingId,
      eventType: "dom.click",
      inputId: "element-pressed",
      discardedEvents: 1,
      discardedActions: 1
    });
  });

  it("reports discarded evidence once but every discarded action", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: lateEventIoRegistry(), stopDrainMs: 0 });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.trickle", clientType: "extension", name: "Trickle extension" }));
    await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
    await bridge.startRecording({ sessionId: session.sessionId, recordingId: "recording.trickle", domainId: "extension.example" });
    await bridge.stopRecording(session.sessionId);

    for (let index = 0; index < 2; index += 1) {
      await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
        domainId: "extension.example",
        eventType: "dom.state",
        payload: { ready: true },
        metadata: { inputId: "page-state" }
      }));
    }
    await gateway.receive(session.sessionId, clientMessage("client.recording_event", {
      domainId: "extension.example",
      eventType: "dom.click",
      payload: { elementId: "confirm" },
      metadata: { inputId: "element-pressed" }
    }));

    const discarded = gateway.snapshot().auditLog.filter((entry) => entry.type.startsWith("recording.") && entry.type.endsWith("_discarded"));
    expect(discarded.map((entry) => entry.type)).toEqual(["recording.event_discarded", "recording.action_discarded"]);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: "recording.trickle", discardedEvents: 1, discardedActions: 0 });
    expect(discarded[1]?.metadata).toMatchObject({ recordingId: "recording.trickle", discardedEvents: 3, discardedActions: 1 });
  });

  it("reports an action that reaches Core while Stop is finalizing, instead of failing the receive", async () => {
    const race = await recordingHeldAtFinalization("extension.race");

    await expect(race.gateway.receive(race.session.sessionId, lateClick())).resolves.toBeUndefined();
    race.release();
    await race.stopping;
    await race.gateway.receive(race.session.sessionId, lateClick());

    const stored = await race.automationStudio.getRecordingSession(race.recording.recordingId);
    expect(stored.endedAt).toBeDefined();
    expect(stored.timeline).toHaveLength(0);
    expect(serverErrors(race.gateway, race.session.sessionId)).toEqual([]);
    const discarded = race.gateway.snapshot().auditLog.filter((entry) => entry.type === "recording.action_discarded");
    expect(discarded).toHaveLength(2);
    expect(discarded[0]?.message).toContain(race.recording.recordingId);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, inputId: "element-pressed", discardedEvents: 1, discardedActions: 1 });
    // Stop closing the recording afterwards must not restart the count.
    expect(discarded[1]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, discardedEvents: 2, discardedActions: 2 });
  });

  it("discards a queued snapshot whose timer flush lands after finalization", async () => {
    const race = await recordingHeldAtFinalization("extension.queued");

    await race.gateway.receive(race.session.sessionId, clientMessage("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } }));
    await vi.waitFor(() => {
      expect(race.gateway.snapshot().auditLog.map((entry) => entry.type)).toContain("recording.event_discarded");
    }, { timeout: 2000 });
    race.release();
    await race.stopping;

    expect((await race.automationStudio.getRecordingSession(race.recording.recordingId)).timeline).toHaveLength(0);
    const discarded = race.gateway.snapshot().auditLog.filter((entry) => entry.type === "recording.event_discarded");
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, eventType: "client.state_snapshot", executable: false, discardedEvents: 1 });
  });

  it("discards evidence a state update flushes and records, and a client error, while Stop is finalizing", async () => {
    const race = await recordingHeldAtFinalization("extension.evidence");
    const sessionId = race.session.sessionId;

    await race.gateway.receive(sessionId, clientMessage("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } }));
    await expect(race.gateway.receive(sessionId, clientMessage("client.state_update", {
      state: { ready: true },
      metadata: { domainId: "extension.example", inputId: "page-state" }
    }))).resolves.toBeUndefined();
    await expect(race.gateway.receive(sessionId, clientMessage("client.error", { message: "Tab closed" }))).resolves.toBeUndefined();
    race.release();
    await race.stopping;
    await race.gateway.receive(sessionId, lateClick());

    expect((await race.automationStudio.getRecordingSession(race.recording.recordingId)).timeline).toHaveLength(0);
    expect(serverErrors(race.gateway, sessionId)).toEqual([]);
    const discarded = race.gateway.snapshot().auditLog.filter((entry) => entry.type.startsWith("recording.") && entry.type.endsWith("_discarded"));
    expect(discarded.map((entry) => entry.type)).toEqual(["recording.event_discarded", "recording.action_discarded"]);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, eventType: "client.state_snapshot", discardedEvents: 1, discardedActions: 0 });
    expect(discarded[1]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, discardedEvents: 4, discardedActions: 1 });
  });

  it("discards a domain event that reaches Core while Stop is finalizing, instead of writing it into the finalized recording", async () => {
    const race = await recordingHeldAtFinalization("extension.domain-event");
    race.automationStudio.registerRecordingDomain({ domainId: "extension.example", label: "Example", schemaVersion: "0.1", events: [{ eventType: "dom.scrolled", label: "Scrolled" }] });

    await expect(race.gateway.receive(race.session.sessionId, clientMessage("client.recording_event", {
      domainId: "extension.example",
      eventType: "dom.scrolled",
      payload: { top: 120 }
    }))).resolves.toBeUndefined();
    race.release();
    await race.stopping;

    expect((await race.automationStudio.getRecordingSession(race.recording.recordingId)).timeline).toHaveLength(0);
    expect(serverErrors(race.gateway, race.session.sessionId)).toEqual([]);
    const discarded = race.gateway.snapshot().auditLog.filter((entry) => entry.type.startsWith("recording.") && entry.type.endsWith("_discarded"));
    expect(discarded.map((entry) => entry.type)).toEqual(["recording.event_discarded"]);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: race.recording.recordingId, eventType: "dom.scrolled", domainId: "extension.example", executable: false, discardedEvents: 1, discardedActions: 0 });
  });

  it("still fails the receive when an append to an open recording fails for any other reason", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: lateEventIoRegistry(), stopDrainMs: 0 });
    const session = await pairedSession(gateway, "extension.broken");
    await bridge.startRecording({ sessionId: session.sessionId, domainId: "extension.example" });
    vi.spyOn(automationStudio, "appendRecordingEvents").mockRejectedValue(new Error("Recording storage is unavailable."));

    await expect(gateway.receive(session.sessionId, lateClick())).rejects.toThrow("Recording storage is unavailable.");
    expect(gateway.snapshot().auditLog.some((entry) => entry.type.endsWith("_discarded"))).toBe(false);
  });

  it("keeps what a client sends while Core is still opening its recording, and acknowledges the start once it is open", async () => {
    const start = await clientStartInFlight("extension.slow-start");
    const sessionId = start.session.sessionId;

    const waiting = [
      start.gateway.receive(sessionId, clickFor(start.recordingId)),
      start.gateway.receive(sessionId, clientMessage("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } })),
      start.gateway.receive(sessionId, clientMessage("client.state_update", { recording: true, state: { ready: true }, metadata: { domainId: "extension.example", inputId: "page-state" } }))
    ];
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(start.gateway.outbound(sessionId).map((message) => message.type)).not.toContain("server.start_recording");
    start.release();
    await start.starting;
    await Promise.all(waiting);
    await start.gateway.receive(sessionId, clientMessage("client.stop_recording", { recordingId: start.recordingId }));

    const stored = await start.automationStudio.getRecordingSession(start.recordingId, start.projectId);
    expect(stored.endedAt).toBeDefined();
    expect(stored.timeline.map((entry) => entry.type === "observation" ? entry.observationType : entry.type).sort()).toEqual(["action", "client.state_snapshot", "input.state"]);
    expect(discardAudit(start.gateway)).toEqual([]);
    const acknowledgements = start.gateway.outbound(sessionId).filter((message) => message.type === "server.start_recording");
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0]?.payload).toMatchObject({ recordingId: start.recordingId, projectId: start.projectId, domainId: "extension.example" });
  });

  it("discards what waited on a client start that Core refused, under the refused recording's id", async () => {
    const start = await clientStartInFlight("extension.refused", { refuse: true });
    const sessionId = start.session.sessionId;

    const waiting = [
      start.gateway.receive(sessionId, clientMessage("client.state_update", { recording: true, state: { ready: true }, metadata: { domainId: "extension.example", inputId: "page-state" } })),
      start.gateway.receive(sessionId, clientMessage("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } })),
      start.gateway.receive(sessionId, clickFor(start.recordingId))
    ];
    start.release();
    await start.starting;
    await Promise.all(waiting);
    await start.gateway.receive(sessionId, lateClick());

    expect(serverErrors(start.gateway, sessionId).map((message) => (message.payload as { code?: string }).code)).toEqual(["recording.project_required"]);
    await expect(start.automationStudio.getRecordingSession(start.recordingId)).rejects.toThrow("Unknown Automation Studio recording");
    const discarded = discardAudit(start.gateway);
    expect(discarded.map((entry) => entry.type)).toEqual(["recording.event_discarded", "recording.action_discarded", "recording.action_discarded"]);
    expect(discarded[0]?.message).toContain(`recording ${start.recordingId}, which this client did not have open`);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: start.recordingId, eventType: "client.state_update", inputId: "page-state", executable: false, discardedEvents: 1, discardedActions: 0 });
    // The snapshot is counted rather than reported again: evidence is reported once per recording.
    expect(discarded[1]?.metadata).toMatchObject({ recordingId: start.recordingId, eventType: "dom.click", discardedEvents: 3, discardedActions: 1 });
    // A click that names no recording is still attributed to the refused one.
    expect(discarded[2]?.metadata).toMatchObject({ recordingId: start.recordingId, discardedEvents: 4, discardedActions: 2 });
  });

  it("finalizes a start the client stopped while Core was still opening it, without telling the client to start", async () => {
    const start = await clientStartInFlight("extension.quick-stop");
    const sessionId = start.session.sessionId;

    const stopping = start.gateway.receive(sessionId, clientMessage("client.stop_recording", { recordingId: start.recordingId }));
    // Long enough for a Stop that did not wait to try finalizing a recording that does not exist yet.
    await new Promise((resolve) => setTimeout(resolve, 10));
    start.release();
    await start.starting;
    await expect(stopping).resolves.toBeUndefined();

    expect((await start.automationStudio.getRecordingSession(start.recordingId, start.projectId)).endedAt).toBeDefined();
    expect(start.gateway.outbound(sessionId).map((message) => message.type)).not.toContain("server.start_recording");
    expect(serverErrors(start.gateway, sessionId)).toEqual([]);
  });

  it("audits a snapshot and a state update that arrive after their recording closed, and names a message's own recording", async () => {
    const gateway = new ClientGatewayService();
    const automationStudio = new AutomationStudioService({ seedFixture: false });
    const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: lateEventIoRegistry(), stopDrainMs: 0 });
    const session = await pairedSession(gateway, "extension.after-close");
    const recording = await bridge.startRecording({ sessionId: session.sessionId, domainId: "extension.example" });
    await bridge.stopRecording(session.sessionId);

    // Page state from a client that says it is not recording was never meant for a recording.
    await gateway.receive(session.sessionId, clientMessage("client.state_update", { recording: false, state: { ready: true } }));
    expect(discardAudit(gateway)).toEqual([]);
    await gateway.receive(session.sessionId, clientMessage("client.snapshot", { kind: "state", timestamp: 2, state: { timestamp: 2, namespaces: {} } }));
    await gateway.receive(session.sessionId, clientMessage("client.state_update", { recording: true, state: { ready: true } }));
    await gateway.receive(session.sessionId, clickFor("recording.elsewhere"));

    const discarded = discardAudit(gateway);
    expect(discarded.map((entry) => entry.type)).toEqual(["recording.event_discarded", "recording.action_discarded"]);
    expect(discarded[0]?.message).toContain(`after recording ${recording.recordingId} was finalized`);
    expect(discarded[0]?.metadata).toMatchObject({ recordingId: recording.recordingId, eventType: "client.state_snapshot", discardedEvents: 1 });
    expect(discarded[1]?.message).toContain("recording recording.elsewhere, which this client did not have open");
    expect(discarded[1]?.metadata).toMatchObject({ recordingId: "recording.elsewhere", discardedEvents: 3, discardedActions: 1 });
    expect(discarded[1]?.metadata).not.toHaveProperty("sinceFinalizedMs");
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

async function pairedSession(gateway: ClientGatewayService, clientId: string) {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId }));
  await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
  return session;
}

/**
 * A recording whose client-initiated Stop has finalized it in the service and
 * is held there, before the bridge closes it: the moment a late message can
 * still find the recording open. `release` lets Stop finish.
 */
async function recordingHeldAtFinalization(clientId: string) {
  const gateway = new ClientGatewayService();
  const automationStudio = new AutomationStudioService({ seedFixture: false });
  const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: lateEventIoRegistry(), stopDrainMs: 0 });
  const session = await pairedSession(gateway, clientId);
  const recording = await bridge.startRecording({ sessionId: session.sessionId, domainId: "extension.example" });
  const finalize = automationStudio.finalizeRecording.bind(automationStudio);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = () => resolve(); });
  let reach = () => {};
  const reached = new Promise<void>((resolve) => { reach = () => resolve(); });
  vi.spyOn(automationStudio, "finalizeRecording").mockImplementation(async (input) => {
    const result = await finalize(input);
    reach();
    await held;
    return result;
  });
  const stopping = gateway.receive(session.sessionId, clientMessage("client.stop_recording", { recordingId: recording.recordingId }));
  await reached;
  return { gateway, automationStudio, session, recording, stopping, release: () => release() };
}

function lateClick() {
  return clientMessage("client.recording_event", {
    domainId: "extension.example",
    eventType: "dom.click",
    payload: { elementId: "confirm" },
    metadata: { inputId: "element-pressed" }
  });
}

function clickFor(recordingId: string) {
  return clientMessage("client.recording_event", {
    recordingId,
    domainId: "extension.example",
    eventType: "dom.click",
    payload: { elementId: "confirm" },
    metadata: { inputId: "element-pressed" }
  });
}

function discardAudit(gateway: ClientGatewayService) {
  return gateway.snapshot().auditLog.filter((entry) => entry.type.startsWith("recording.") && entry.type.endsWith("_discarded"));
}

/**
 * A client-initiated start Core is still handling: held inside the project lookup,
 * which then refuses it, when `refuse` is set; otherwise held inside
 * `createRecording` before the recording exists. Messages received now reach the
 * bridge ahead of the open recording, as the WebSocket host lets them. `release`
 * lets the start finish.
 */
async function clientStartInFlight(clientId: string, options: { refuse?: boolean } = {}) {
  const gateway = new ClientGatewayService();
  const automationStudio = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  const project = await automationStudio.createProject({ name: "Slow start" });
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = () => resolve(); });
  let reach = () => {};
  const reached = new Promise<void>((resolve) => { reach = () => resolve(); });
  new AutomationStudioClientGatewayBridge({
    gateway,
    automationStudio,
    io: lateEventIoRegistry(),
    stopDrainMs: 0,
    clientRecordingContextProvider: async () => {
      if (!options.refuse) return { ok: true, projectId: project.id };
      reach();
      await held;
      return { ok: false, message: "Recording cannot start because no project is open.", code: "recording.project_required" };
    }
  });
  if (!options.refuse) {
    const create = automationStudio.createRecording.bind(automationStudio);
    vi.spyOn(automationStudio, "createRecording").mockImplementation(async (input) => {
      reach();
      await held;
      return create(input);
    });
  }
  const session = await pairedSession(gateway, clientId);
  const recordingId = `recording.${clientId}`;
  const starting = gateway.receive(session.sessionId, clientMessage("client.start_recording", { recordingId, domainId: "extension.example", initialState: { timestamp: 1, namespaces: {} } }));
  await reached;
  return { gateway, automationStudio, session, projectId: project.id, recordingId, starting, release: () => release() };
}

function serverErrors(gateway: ClientGatewayService, sessionId: string) {
  return gateway.outbound(sessionId).filter((message) => message.type === "server.error");
}

function lateEventIoRegistry(): IoRegistry {
  const io = new IoRegistry();
  io.register({
    domainId: "extension.example",
    inputs: [defineInput({
      definition: { id: "element-pressed", title: "Element pressed", role: "action", outputId: "ui.activate" },
      mode: "stream",
      outputBinding: { outputId: "ui.activate", toPayload: (event) => ({ elementId: String((event.payload as { elementId: string }).elementId) }) }
    }), defineInput({
      definition: { id: "page-state", title: "Page state", role: "state" },
      mode: "stream"
    })],
    outputs: [defineOutput({
      definition: { id: "ui.activate", title: "Activate" },
      mode: "request",
      dispatch: (request) => ({ ok: true, outputId: request.outputId })
    })]
  });
  return io;
}
