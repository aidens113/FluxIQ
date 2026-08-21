import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEnvelope, defineDomainIo, defineInput, defineOutput, IoRegistry } from "../../../io/index.ts";
import { RuntimeService } from "../../../runtime/index.ts";
import { AutomationStudioService } from "./service.ts";
import { AutomationStudioIoRecorder } from "./io-bridge.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "./io-policy.ts";
import { runAutomationStudioGraph } from "./executor.ts";

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
