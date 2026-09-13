import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../../client-gateway/index.ts";
import { defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { AutomationStudioService } from "../../runtime/service.ts";
import { AutomationStudioClientGatewayBridge } from "../bridge.ts";

// A client that stops one recording and starts the next while Core is still handling
// what came before. Each message stays with the recording it was sent for.

const tempRoot = path.join(process.cwd(), ".tmp", "automation-studio-client-gateway-bridge-restart-test");

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("AutomationStudioClientGatewayBridge, when a client restarts recording", () => {
  it.each(["client", "web panel"] as const)("keeps open a recording started while a %s Stop is closing the one before it", async (stopper) => {
    const client = await clientWithOpenRecording(`extension.restart-${stopper.replace(" ", "-")}`);
    const finalizing = holdFinalization(client.automationStudio);

    const stopping = stopper === "client"
      ? client.gateway.receive(client.sessionId, clientMessage("client.stop_recording", { recordingId: client.recordingId }))
      : client.bridge.stopRecording(client.sessionId);
    await finalizing.reached;
    await client.gateway.receive(client.sessionId, startMessage("recording.next"));
    finalizing.release();
    await stopping;
    await client.gateway.receive(client.sessionId, clickMessage());

    expect((await client.automationStudio.getRecordingSession(client.recordingId, client.projectId)).endedAt).toBeDefined();
    expect(timelineKinds(await client.automationStudio.getRecordingSession("recording.next", client.projectId))).toEqual(["action"]);
    expect(discardAudit(client.gateway)).toEqual([]);
  });

  it.each(["client", "web panel"] as const)("never stores a message received before a %s start in the recording that start opens", async (starter) => {
    const client = await clientWithOpenRecording(`extension.before-start-${starter.replace(" ", "-")}`);
    const appending = holdFirstAppend(client.automationStudio);

    // The held click keeps the client's messages busy, so the page state received after it waits its turn.
    const clicking = client.gateway.receive(client.sessionId, clickMessage());
    await appending.reached;
    const updating = client.gateway.receive(client.sessionId, pageStateMessage());
    const stopping = client.gateway.receive(client.sessionId, clientMessage("client.stop_recording", { recordingId: client.recordingId }));
    const starting = starter === "client"
      ? client.gateway.receive(client.sessionId, startMessage("recording.next"))
      : client.bridge.startRecording({ sessionId: client.sessionId, recordingId: "recording.next", projectId: client.projectId, domainId: "extension.example" });
    // Long enough for a start that did not wait to open its recording while the click is held.
    await Promise.race([starting, new Promise((resolve) => setTimeout(resolve, 300))]);
    appending.release();
    await Promise.all([clicking, updating, stopping, starting]);

    expect(timelineKinds(await client.automationStudio.getRecordingSession(client.recordingId, client.projectId))).toEqual(["action", "input.state"]);
    expect(timelineKinds(await client.automationStudio.getRecordingSession("recording.next", client.projectId))).toEqual([]);
    expect(discardAudit(client.gateway)).toEqual([]);
  });
});

/** A paired client with a recording it started itself, open in a project, on a bridge with no post-stop drain. */
async function clientWithOpenRecording(clientId: string) {
  const gateway = new ClientGatewayService();
  const automationStudio = new AutomationStudioService({ dataDir: path.join(tempRoot, clientId), seedFixture: false });
  const project = await automationStudio.createProject({ name: clientId });
  const bridge = new AutomationStudioClientGatewayBridge({ gateway, automationStudio, io: ioRegistry(), stopDrainMs: 0, clientRecordingContextProvider: () => ({ ok: true, projectId: project.id }) });
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId }));
  await gateway.approvePairing(gateway.snapshot().pairings[0]?.pairingCode ?? "", { approvedByUserId: "user.test" });
  const recordingId = `recording.${clientId}`;
  await gateway.receive(session.sessionId, startMessage(recordingId));
  return { gateway, automationStudio, bridge, sessionId: session.sessionId, projectId: project.id, recordingId };
}

/** A promise that settles when `open` is called. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => { open = () => resolve(); });
  return { opened, open: () => open() };
}

/** Holds `finalizeRecording` after the service has finalized, until `release`: Stop has not yet closed the recording in the bridge. */
function holdFinalization(automationStudio: AutomationStudioService) {
  const finalize = automationStudio.finalizeRecording.bind(automationStudio);
  const reach = gate();
  const hold = gate();
  vi.spyOn(automationStudio, "finalizeRecording").mockImplementation(async (input) => {
    const result = await finalize(input);
    reach.open();
    await hold.opened;
    return result;
  });
  return { reached: reach.opened, release: hold.open };
}

/** Holds the first `appendRecordingEvents` call before the service takes its lock, until `release`. Later calls pass straight through. */
function holdFirstAppend(automationStudio: AutomationStudioService) {
  const append = automationStudio.appendRecordingEvents.bind(automationStudio);
  const reach = gate();
  const hold = gate();
  let first = true;
  vi.spyOn(automationStudio, "appendRecordingEvents").mockImplementation(async (input) => {
    if (first) {
      first = false;
      reach.open();
      await hold.opened;
    }
    return append(input);
  });
  return { reached: reach.opened, release: hold.open };
}

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

function startMessage(recordingId: string) {
  return clientMessage("client.start_recording", { recordingId, domainId: "extension.example", initialState: { timestamp: 1, namespaces: {} } });
}

function clickMessage() {
  return clientMessage("client.recording_event", { domainId: "extension.example", eventType: "dom.click", payload: { elementId: "confirm" }, metadata: { inputId: "element-pressed" } });
}

function pageStateMessage() {
  return clientMessage("client.state_update", { recording: true, state: { ready: true }, metadata: { domainId: "extension.example", inputId: "page-state" } });
}

function discardAudit(gateway: ClientGatewayService) {
  return gateway.snapshot().auditLog.filter((entry) => entry.type.startsWith("recording.") && entry.type.endsWith("_discarded"));
}

/** A stored timeline in order: an observation by its observation type, any other entry by its type. */
function timelineKinds(recording: Awaited<ReturnType<AutomationStudioService["getRecordingSession"]>>) {
  return recording.timeline.map((entry) => entry.type === "observation" ? entry.observationType : entry.type);
}

function ioRegistry(): IoRegistry {
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
