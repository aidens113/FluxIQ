import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { installPrimaryRouter, createFailingCanonicalFlow, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("a run a person asked the model into, with no grant", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("calls the model for a diagnosis-only run with nothing issued or revoked, and persists no session identity", async () => {
    const resolved: unknown[] = [];
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: (input) => {
        resolved.push(input);
        return {
          provider: { metadata: { provider: "mock", model: "caller-model" }, runTask: async (request) => { taskKinds.push(request.taskKind); expect(request).toMatchObject({ tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 }); return { response: { kind: "diagnosis", summary: "safe" }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }; } },
          tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
          maxCallsPerRun: 1,
          maxEstimatedCostUsd: 0.1,
          timeoutMs: 10000
        };
      }
    });
    const project = await service.createProject({ name: "Caller diagnosis" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.caller-diagnosis", metadata: adaptiveTrainingMetadata() });
    const llmExecution = { actorUserId: "user.test", actorSessionId: "session.sensitive", intent: "diagnosis_only" as const };
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, llmExecution });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(detail?.actionAttempts).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: "divide", status: "failed" })]));
    // The resolver is told who the call is for, and nothing that authorizes it.
    expect(resolved).toEqual([expect.objectContaining({ caller: { actorUserId: "user.test", actorSessionId: "session.sensitive" } })]);
    expect(resolved[0]).not.toHaveProperty("executionGrant");
    expect(detail?.adaptationIds).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain("session.sensitive");
    // A dry run, side-effect authorization and a named domain are statements
    // about how the run executes, not about a lasting consequence: those are
    // gated action by action by `permittedConsequences` and the action
    // permission gate.
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution, dryRunLlm: true })).resolves.toMatchObject({ flowId: flow.flowId });
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution, authorizedExternalSideEffects: true })).resolves.toMatchObject({ flowId: flow.flowId });
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution, authorizedDomainIds: ["example"] })).resolves.toMatchObject({ flowId: flow.flowId });
    // With no grant to spend, an idempotency key is accepted with a model run
    // like with any other run.
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution, idempotencyKey: "live-diagnosis" })).resolves.toMatchObject({ flowId: flow.flowId });
  }, 60_000);

  it("executes the existing scoped domain action before diagnosis without LLM retry or mutation", async () => {
    const sequence: string[] = [];
    const taskKinds: string[] = [];
    const hostPoints: string[] = [];
    let dispatchCount = 0;
    const io = new IoRegistry();
    io.registerOutput("example", {
      definition: { id: "click", title: "Click" },
      mode: "request",
      dispatch: (request) => {
        dispatchCount += 1;
        sequence.push(`action:${dispatchCount}`);
        return dispatchCount === 1
          ? { ok: false, domainId: "example", outputId: request.outputId, error: "Loopback target drift." }
          : { ok: true, domainId: "example", outputId: request.outputId, payload: { clicked: true } };
      }
    });
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: {
          metadata: { provider: "mock", model: "diagnosis-causality-model" },
          runTask: async (request) => {
            taskKinds.push(request.taskKind);
            sequence.push("diagnosis");
            expect(sequence).toEqual(["action:1", "diagnosis"]);
            expect(request.context.recentActions).toEqual(expect.arrayContaining([
              expect.objectContaining({ nodeId: "click", status: "failed" })
            ]));
            expect(request.context.recentActions?.[0]).not.toHaveProperty("outputs");
            expect(request.context.recentActions?.[0]).not.toHaveProperty("metadata");
            expect(request.context.recentActions?.[0]).not.toHaveProperty("message");
            expect(request.estimatedInputTokens).toBeLessThanOrEqual(request.tokenLimits.maxInputTokens);
            // The diagnosis is told what the recovery's permission gate permits --
            // this run permitted nothing -- not the side-effect flag the gate replaced.
            expect(request.context.policyGates).toMatchObject({ allowModifyActionTargets: true, actionPermissions: { permitted: [] } });
            expect(request.context.policyGates).not.toHaveProperty("allowExternalSideEffects");
            return { response: { kind: "diagnosis", summary: "The recorded target drifted." }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
          }
        },
        tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
        maxCallsPerRun: 1,
        maxEstimatedCostUsd: 0.1,
        timeoutMs: 10000
      }),
      hostRuntime: {
        capabilities: ["state-snapshot"],
        captureStateSnapshot: ({ node, attemptId, point }) => {
          hostPoints.push(`${node.id}:${point}`);
          return { stateSnapshotId: `${attemptId}.${point}`, stateRef: `state://${attemptId}/${point}`, capturedAt: 1 };
        }
      }
    }).bindIoRuntime(io, "example");
    const project = await service.createProject({ name: "Diagnosis action causality", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.diagnosis-action-causality", name: "Diagnosis action causality" });
    const configured = await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    const installed = await installPrimaryRouter(service, project.id, configured.flowId, {
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "click", definitionId: "builtin.policy.action", parameterValues: { outputId: "click", parameters: { target: "scenario-button" } } }
      ],
      edges: [{ id: "start.click", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "click", targetPortId: "in" }]
    });
    const graphBefore = JSON.stringify(installed.graph);
    const llmExecution = { actorUserId: "user.test", actorSessionId: "session.test", intent: "diagnosis_only" as const };

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: configured.flowId, llmExecution });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(run.status).toBe("failed");
    expect(dispatchCount).toBe(1);
    expect(sequence).toEqual(["action:1", "diagnosis"]);
    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(detail?.actionAttempts?.filter((attempt) => attempt.nodeId === "click")).toHaveLength(1);
    expect(hostPoints).toEqual(expect.arrayContaining(["click:before_action", "click:after_action"]));
    expect(detail?.actionAttempts?.find((attempt) => attempt.nodeId === "click")?.metadata).toMatchObject({ stateRefs: { beforeAction: { stateRef: expect.stringContaining("state://") }, afterAction: { stateRef: expect.stringContaining("state://") } } });
    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.changeProposalIds).toEqual([]);
    expect(detail?.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(JSON.stringify(await service.getFlow(project.id, installed.graph.flowId))).toBe(graphBefore);

    const ordinary = await service.runRuntimeSession({ projectId: project.id, flowId: configured.flowId, adaptiveMode: "no_llm_intervention" });
    expect(ordinary.status).toBe("succeeded");
    expect(dispatchCount).toBe(2);
    expect(taskKinds).toEqual(["runtime_diagnosis"]);
  });

  it("executes an existing domain-native node before diagnosis-only annotation", async () => {
    let nativeExecutionCount = 0;
    const taskKinds: string[] = [];
    const definition = {
      schemaVersion: "0.1" as const,
      id: "example.native-failure",
      version: "1.0.0",
      label: "Native failure",
      description: "Produces a bounded deterministic failure",
      category: "Example",
      source: { kind: "importer" as const, domainId: "example", packageId: "example.package", implementationKey: "fail" },
      availability: { kind: "domain" as const, domainId: "example" },
      capabilities: { executable: true as const },
      inputs: [],
      outputs: [{ id: "error", label: "Error", valueType: "string" as const }],
      parameters: []
    };
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [definition] };
    const native = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        fail: () => {
          nativeExecutionCount += 1;
          return { status: "failed", outputs: { error: "Native loopback failure." } };
        }
      }
    });
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: {
          metadata: { provider: "mock", model: "native-diagnosis-model" },
          runTask: async (request) => {
            taskKinds.push(request.taskKind);
            expect(nativeExecutionCount).toBe(1);
            expect(request.context.recentActions).toEqual(expect.arrayContaining([
              expect.objectContaining({ nodeId: "native-failure", status: "failed" })
            ]));
            expect(request.context.recentActions?.[0]).not.toHaveProperty("outputs");
            return { response: { kind: "diagnosis", summary: "The native action failed." }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
          }
        },
        tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
        maxCallsPerRun: 1,
        maxEstimatedCostUsd: 0.1,
        timeoutMs: 10000
      })
    }).bindNativeNodeRuntime(native);
    const project = await service.createProject({ name: "Native diagnosis", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.native-diagnosis", name: "Native diagnosis" });
    const configured = await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    await installPrimaryRouter(service, project.id, configured.flowId, {
      nodes: [{ id: "native-failure", definitionId: definition.id }],
      edges: []
    });

    const run = await service.runRuntimeSession({
      projectId: project.id,
      flowId: configured.flowId,
      llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent: "diagnosis_only" }
    });

    expect(run.status).toBe("failed");
    expect(nativeExecutionCount).toBe(1);
    expect(taskKinds).toEqual(["runtime_diagnosis"]);
  });

  it("runs a model run attached to a pre-staged session exactly as a run with no model would", async () => {
    let dispatchCount = 0;
    let providerResolutionCount = 0;
    const io = new IoRegistry();
    io.registerOutput("example", {
      definition: { id: "click", title: "Click" },
      mode: "request",
      dispatch: (request) => {
        dispatchCount += 1;
        return { ok: true, domainId: "example", outputId: request.outputId };
      }
    });
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => {
        providerResolutionCount += 1;
        return undefined;
      }
    }).bindIoRuntime(io, "example");
    const project = await service.createProject({ name: "Staged model run", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.staged-model-run", name: "Staged model run" });
    const configured = await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    await installPrimaryRouter(service, project.id, configured.flowId, {
      nodes: [{ id: "click", definitionId: "builtin.policy.action", parameterValues: { outputId: "click", parameters: {} } }],
      edges: []
    });
    const queued = await service.startRuntimeSession({ projectId: project.id, flowId: configured.flowId, authorizedDomainIds: ["other-domain"] });
    const llmExecution = { actorUserId: "user.test", actorSessionId: "session.test", intent: "diagnosis_only" as const };

    // A domain authorization another caller staged is not a lasting
    // consequence; the action permission gate is what stops an action a person
    // did not allow, and it still runs. So a model run may resume a staged run,
    // which is the only run worth repairing.
    const attached = await service.runRuntimeSession({ projectId: project.id, flowId: configured.flowId, runId: queued.runId, llmExecution });
    expect(attached.runId).toBe(queued.runId);
    // It executes the Flow's action, as the same run with no model would.
    expect(dispatchCount).toBe(1);
  });

  // One call count still applies to a run: the one its provider resolver
  // declares, as a plain budget limit. The
  // training settings' intervention limit used to be read as a provider-call
  // cap too, and no longer is -- it counts interventions -- so the single call
  // here is declared where a real host declares it.
  it("shares one atomic call budget across diagnosis and patch requests", async () => {
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        maxCallsPerRun: 1,
        provider: {
          metadata: { provider: "mock", model: "one-call-model" },
          runTask: async (request) => {
            taskKinds.push(request.taskKind);
            return request.taskKind === "runtime_patch"
              ? { response: { kind: "runtime_patch", summary: "Should be blocked.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "divide", reason: "Blocked by run budget." }] }, usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } }
              : { response: { kind: "diagnosis", summary: "The denominator is zero." }, usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } };
          }
        }
      })
    });
    const project = await service.createProject({ name: "Atomic LLM budget" });
    const flow = await createFailingCanonicalFlow(service, project.id, {
      flowId: "flow.atomic-llm-budget",
      metadata: adaptiveTrainingMetadata()
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.interventions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "runtime_patch", validation: { ok: false, issues: [expect.stringContaining("llm_budget.run_call_limit")] } })
    ]));
  });
});
