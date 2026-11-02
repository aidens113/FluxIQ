import { describe, expect, it } from "vitest";
import type { RecordingSession, CreateRecordingSessionInput } from "@fluxiq/contracts/recording";
import type { RecordingSink } from "../../sink/index.ts";
import { createEnvelope, defineDomainIo, defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { createRecordingSession, appendRecordingEntry } from "../../index.ts";
import { RecordingIoRecorder } from "../index.ts";

describe("Recording IO recorder", () => {
  it("records a bound action input as an output-native policy action", async () => {
    const io = configuredIo();
    const service = inMemoryRecording();
    const recording = await service.create({
      recordingId: "recording.io", description: "Shows the steps the automation repeats.",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} }
    });
    const recorder = new RecordingIoRecorder({ sink: service, io, domainId: "example" });

    const updated = await recorder.recordInput(
      recording.recordingId,
      "primary-pressed",
      createEnvelope({ domainId: "example", ioId: "primary-pressed", timestampMs: 2, payload: { elementId: "confirm" } })
    );

    expect(updated.timeline).toMatchObject([{
      type: "action",
      outputId: "activate-element",
      actionType: "activate-element",
      parameters: { elementId: "confirm" },
      metadata: { policyEligible: true, inputRole: "action" }
    }]);
  });

  it("keeps the input event on the action entry when the binding asks, and not otherwise", async () => {
    // A bound command is usually everything its event carried. Where it is a
    // projection -- a declaration whose runnable part alone is dispatched -- a
    // recording mapper proposing a Flow node from the entry needs the rest, and
    // without it Core's own fallback proposes the command alone.
    const io = configuredIo();
    io.registerInput("example", defineInput({
      definition: { id: "declaration-made", title: "Declaration made", role: "action", outputId: "activate-element" },
      mode: "stream",
      outputBinding: {
        outputId: "activate-element",
        toPayload: (event) => ({ elementId: String((event.payload as { declaration: { elementId: string } }).declaration.elementId) }),
        recordInputPayload: true
      }
    }));
    const service = inMemoryRecording();
    const recording = await service.create({ description: "Shows the steps the automation repeats.", recordingId: "recording.input-payload", initialState: { timestamp: 1, namespaces: {} } });
    const recorder = new RecordingIoRecorder({ sink: service, io, domainId: "example" });

    await recorder.recordInput(recording.recordingId, "primary-pressed", createEnvelope({ ioId: "primary-pressed", payload: { elementId: "confirm", label: "Confirm" } }));
    const updated = await recorder.recordInput(recording.recordingId, "declaration-made", createEnvelope({ ioId: "declaration-made", payload: { declaration: { elementId: "confirm", name: "The user's own name for it" } } }));

    const [plain, declared] = updated.timeline;
    expect(plain?.metadata).not.toHaveProperty("inputPayload");
    expect(declared).toMatchObject({
      type: "action",
      parameters: { elementId: "confirm" },
      metadata: { inputPayload: { declaration: { elementId: "confirm", name: "The user's own name for it" } } }
    });
  });

  it("keeps state and unmapped action inputs out of executable actions", async () => {
    const io = configuredIo();
    io.registerInput("example", defineInput({
      definition: { id: "current-state", title: "Current state", role: "state" },
      mode: "stream"
    }));
    io.registerInput("example", defineInput({
      definition: { id: "unmapped-pressed", title: "Unmapped pressed", role: "action" },
      mode: "stream"
    }));
    const service = inMemoryRecording();
    const recording = await service.create({ description: "Shows the steps the automation repeats.", recordingId: "recording.observations", initialState: { timestamp: 1, namespaces: {} } });
    const recorder = new RecordingIoRecorder({ sink: service, io, domainId: "example" });

    const state = await recorder.recordInput(recording.recordingId, "current-state", createEnvelope({ ioId: "current-state", payload: { ready: true } }));
    const updated = await recorder.recordInput(recording.recordingId, "unmapped-pressed", createEnvelope({ ioId: "unmapped-pressed", payload: { button: "other" } }));

    expect(state.timeline[0]?.type).toBe("observation");
    expect(updated.timeline.every((entry) => entry.type !== "action")).toBe(true);
    expect(updated.timeline.map((entry) => entry.metadata?.policyEligible)).toEqual([false, false]);
  });

  it("keeps the recorded event's id and source on action and observation entries alike, and nothing else of the envelope's metadata", async () => {
    const { recorder, recordingId } = await identityRecorder("recording.identity");

    await recorder.recordInput(recordingId, "primary-pressed", createEnvelope({
      ioId: "primary-pressed",
      payload: { elementId: "confirm" },
      metadata: { eventId: "web.7.1007", sourceId: "tab:7:frame:0", clientGatewayMessageId: "message.1", note: "not identity" }
    }));
    const updated = await recorder.recordInput(recordingId, "current-state", createEnvelope({ ioId: "current-state", payload: { ready: true }, metadata: { eventId: "state.1", sourceId: "tab:7" } }));

    const [action, observation] = updated.timeline;
    expect(action?.type).toBe("action");
    expect(action?.metadata).toEqual({
      domainId: "example",
      inputId: "primary-pressed",
      inputRole: "action",
      envelopeId: expect.any(String),
      eventId: "web.7.1007",
      sourceId: "tab:7:frame:0",
      policyEligible: true
    });
    expect(observation?.type).toBe("observation");
    expect(observation?.metadata).toMatchObject({ eventId: "state.1", sourceId: "tab:7" });
  });

  it("gives an entry no event id when its envelope carries none", async () => {
    const { recorder, recordingId } = await identityRecorder("recording.no-event-id");

    await recorder.recordInput(recordingId, "primary-pressed", createEnvelope({ ioId: "primary-pressed", payload: { elementId: "confirm" }, metadata: { sourceId: "tab:7:frame:0" } }));
    const updated = await recorder.recordInput(recordingId, "current-state", createEnvelope({ ioId: "current-state", payload: { ready: true } }));

    const [action, observation] = updated.timeline;
    expect(action?.metadata).toMatchObject({ sourceId: "tab:7:frame:0" });
    expect(action?.metadata).not.toHaveProperty("eventId");
    expect(observation?.metadata).not.toHaveProperty("eventId");
    expect(observation?.metadata).not.toHaveProperty("sourceId");
  });

  it("copies an envelope's event id and source only as non-blank strings", async () => {
    const { recorder, recordingId } = await identityRecorder("recording.non-string-identity");

    await recorder.recordInput(recordingId, "primary-pressed", createEnvelope({ ioId: "primary-pressed", payload: { elementId: "confirm" }, metadata: { eventId: 1007, sourceId: { tabId: 7 } } }));
    const updated = await recorder.recordInput(recordingId, "current-state", createEnvelope({ ioId: "current-state", payload: { ready: true }, metadata: { eventId: " ", sourceId: null } }));

    for (const entry of updated.timeline) {
      expect(entry.metadata).not.toHaveProperty("eventId");
      expect(entry.metadata).not.toHaveProperty("sourceId");
    }
    expect(updated.timeline.map((entry) => entry.type)).toEqual(["action", "observation"]);
  });

});

function inMemoryRecording() {
  let recording: RecordingSession<unknown, unknown> | undefined;
  return {
    async create(input: CreateRecordingSessionInput<unknown, unknown>) {
      recording = createRecordingSession(input);
      return recording;
    },
    async append(input: Parameters<RecordingSink<unknown, unknown>["append"]>[0]) {
      if (!recording || recording.recordingId !== input.recordingId) throw new Error("test.recording_missing");
      const updated = appendRecordingEntry(recording, input.entry);
      recording = updated;
      return updated;
    }
  };
}

async function identityRecorder(recordingId: string) {
  const io = configuredIo();
  io.registerInput("example", defineInput({ definition: { id: "current-state", title: "Current state", role: "state" }, mode: "stream" }));
  const service = inMemoryRecording();
  await service.create({ description: "Shows the steps the automation repeats.", recordingId, initialState: { timestamp: 1, namespaces: {} } });
  return { recorder: new RecordingIoRecorder({ sink: service, io, domainId: "example" }), recordingId };
}

function configuredIo(): IoRegistry {
  const io = new IoRegistry();
  let confirmationHandler: ((event: ReturnType<typeof createEnvelope<{ elementId: string }>>) => void) | undefined;
  io.register(defineDomainIo({
    domainId: "example",
    inputs: [defineInput({
      definition: { id: "primary-pressed", title: "Primary pressed", role: "action", outputId: "activate-element" },
      mode: "stream",
      outputBinding: { outputId: "activate-element", toPayload: (event) => ({ elementId: String((event.payload as { elementId: string }).elementId) }) },
      subscribe: (handler) => {
        confirmationHandler = handler;
        return () => { confirmationHandler = undefined; };
      }
    })],
    outputs: [defineOutput<{ elementId: string }>({
      definition: { id: "activate-element", title: "Activate element", description: "Activates an element.", safety: { level: "review" } },
      mode: "request",
      dispatch: (request) => {
        if (request.payload.elementId === "confirm") confirmationHandler?.(createEnvelope({ domainId: "example", ioId: "primary-pressed", payload: { elementId: "confirm" } }));
        return { ok: request.payload.elementId === "confirm", outputId: request.outputId, payload: { accepted: true } };
      }
    })]
  }));
  return io;
}
