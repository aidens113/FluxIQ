import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEnvelope, defineDomainIo, defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { RuntimeService } from "../../../../runtime/index.ts";
import { AutomationStudioService } from "../service.ts";
import { AutomationStudioIoRecorder } from "../io-bridge.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "../io-policy.ts";
import { runAutomationStudioGraph } from "../executor.ts";

describe("Automation Studio IO bridge", () => {
  it("records a bound action input as an output-native policy action", async () => {
    const io = configuredIo();
    const service = new AutomationStudioService({ seedFixture: false });
    const recording = await service.createRecording({
      recordingId: "recording.io",
      startedAt: 1,
      initialState: { timestamp: 1, namespaces: {} }
    });
    const recorder = new AutomationStudioIoRecorder({ automationStudio: service, io, domainId: "example" });

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
    const service = new AutomationStudioService({ seedFixture: false });
    const recording = await service.createRecording({ recordingId: "recording.input-payload", initialState: { timestamp: 1, namespaces: {} } });
    const recorder = new AutomationStudioIoRecorder({ automationStudio: service, io, domainId: "example" });

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
    const service = new AutomationStudioService({ seedFixture: false });
    const recording = await service.createRecording({ recordingId: "recording.observations", initialState: { timestamp: 1, namespaces: {} } });
    const recorder = new AutomationStudioIoRecorder({ automationStudio: service, io, domainId: "example" });

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

  it("dispatches only registered output nodes during policy runtime", async () => {
    const io = configuredIo();
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.io",
      ownerKind: "task" as const,
      ownerId: "task.io",
      name: "IO flow",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createIoPolicyEffectDispatcher(io, "example") });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.outputs).toMatchObject({ outputId: "activate-element", ok: true });
  });

  it("matches canonical element targets before output dispatch", async () => {
    const io = new IoRegistry();
    let dispatchedTarget: any;
    io.registerOutput("example", defineOutput({
      definition: { id: "click-element", title: "Click element", metadata: { elementTarget: true } },
      mode: "request",
      dispatch: (request) => {
        dispatchedTarget = (request.payload as any).target;
        return { ok: true, outputId: request.outputId, payload: { selected: dispatchedTarget?.selectedCandidate?.candidateId } };
      }
    }));
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.element-match",
      ownerKind: "task" as const,
      ownerId: "task.element-match",
      name: "Element match",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{
        id: "output",
        definitionId: "builtin.policy.action",
        parameterValues: {
          outputId: "click-element",
          parameters: {
            target: {
              kind: "element",
              fingerprint: { visibleText: "Save", testId: "save" },
              candidates: [
                { candidateId: "cancel", visibleText: "Cancel", testId: "cancel" },
                { candidateId: "save", visibleText: "Save", testId: "save" }
              ]
            }
          }
        }
      }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createIoPolicyEffectDispatcher(io, "example") });

    expect(trace.status).toBe("succeeded");
    expect(dispatchedTarget?.selectedCandidate).toMatchObject({ candidateId: "save", matchedSignals: expect.arrayContaining(["visibleText", "testId"]) });
    expect(trace.attempts[0]?.outputs).toMatchObject({ elementTargetResolution: { status: "matched", candidateId: "save" } });
  });

  it("rejects declared element outputs without an element fingerprint", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", defineOutput({
      definition: { id: "click-element", title: "Click element", metadata: { elementTarget: true } },
      mode: "request",
      dispatch: () => ({ ok: true, outputId: "click-element" })
    }));
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.element-missing",
      ownerKind: "task" as const,
      ownerId: "task.element-missing",
      name: "Element missing",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "click-element", parameters: {} } }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createIoPolicyEffectDispatcher(io, "example") });

    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.outputs.error).toContain("declares element targeting");
  });

  it("routes registered policy outputs through runtime when a matching capability exists", async () => {
    const io = configuredIo();
    const runtime = new RuntimeService();
    runtime.registerAdapter({
      adapterId: "example.runtime",
      label: "Example Runtime",
      transport: "direct",
      domainId: "example",
      capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
      execute: (command) => ({
        commandId: command.commandId ?? "command.runtime",
        status: "succeeded",
        payload: { dispatchedBy: "runtime", parameters: command.parameters ?? {} }
      })
    });
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.runtime-io",
      ownerKind: "task" as const,
      ownerId: "task.runtime-io",
      name: "Runtime IO flow",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "from-runtime" } } }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(io, "example", runtime) });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.outputs).toMatchObject({
      outputId: "activate-element",
      ok: true,
      runtimeStatus: "succeeded",
      result: { dispatchedBy: "runtime" }
    });
    expect(runtime.commandAttemptsList()).toMatchObject([{ adapterId: "example.runtime", status: "succeeded" }]);
  });

  it("falls back to IO dispatch when runtime has no matching output capability", async () => {
    const io = configuredIo();
    const runtime = new RuntimeService();
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.runtime-fallback",
      ownerKind: "task" as const,
      ownerId: "task.runtime-fallback",
      name: "Runtime fallback flow",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(io, "example", runtime) });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.outputs).toMatchObject({ outputId: "activate-element", ok: true, result: { accepted: true } });
    expect(runtime.commandAttemptsList()).toEqual([]);
  });

  it("uses the bound action input as runtime output confirmation, never as state", async () => {
    const io = configuredIo();
    const flow = {
      schemaVersion: "0.1" as const,
      flowId: "flow.confirmation",
      ownerKind: "task" as const,
      ownerId: "task.confirmation",
      name: "Confirmation flow",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" }, confirmationInputId: "primary-pressed", confirmationTimeoutMs: 100 } }],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createIoPolicyEffectDispatcher(io, "example") });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.outputs).toMatchObject({ confirmationInputId: "primary-pressed", confirmation: true });
  });

  it("does not propose a recorded output that is absent from the active importer runtime", async () => {
    const io = configuredIo();
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-io-policy-"));
    const service = new AutomationStudioService({ dataDir: root, seedFixture: false }).bindIoRuntime(io, "example");
    try {
    const project = await service.createProject({ name: "Output validation" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.unregistered-output", taskId: "task.output-validation", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "not-registered", outputId: "not-registered", parameters: {}, origin: "operator", startedAt: 2, timestamp: 2 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });

    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });

    expect(proposal.policy.nodes).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function identityRecorder(recordingId: string) {
  const io = configuredIo();
  io.registerInput("example", defineInput({ definition: { id: "current-state", title: "Current state", role: "state" }, mode: "stream" }));
  const service = new AutomationStudioService({ seedFixture: false });
  await service.createRecording({ recordingId, initialState: { timestamp: 1, namespaces: {} } });
  return { recorder: new AutomationStudioIoRecorder({ automationStudio: service, io, domainId: "example" }), recordingId };
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
