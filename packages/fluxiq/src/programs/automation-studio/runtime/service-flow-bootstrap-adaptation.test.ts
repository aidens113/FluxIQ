import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../api/contracts.ts";
import { registerAutomationStudioApi } from "../api/handlers.ts";
import {
  AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
  AutomationStudioNodeRegistry,
  type AutomationStudioNodeDefinition
} from "../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan, type AutomationStudioFlowBootstrapPlan } from "./flow-bootstrap.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import { AutomationStudioService } from "./service.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function readyNativeRuntime() {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "example.action",
    version: "1.0.0",
    label: "Example action",
    description: "Execute a deterministic example action.",
    category: "action",
    source: {
      kind: "importer",
      domainId: "example",
      packageId: "example.package",
      implementationKey: "action"
    },
    availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: []
  };
  return new AutomationStudioNativeNodeRuntime().register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [action]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      action: () => ({ status: "success", route: "success", outputs: { success: true } })
    }
  });
}
function service(): AutomationStudioService {
  const value = new AutomationStudioService({ dataDir: tempRoot });
  services.add(value);
  return value;
}

function validPlan(): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: {
      name: "Instruction router",
      rules: [],
      fallback: { kind: "subflow", targetSubflowKey: "primary" }
    },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [{
        key: "start_end",
        source: { nodeKey: "start", portId: "success" },
        target: { nodeKey: "end", portId: "in" }
      }]
    }]
  };
}

function validatedPlan(): AutomationStudioFlowBuildPlan {
  const result = validateAutomationStudioFlowBootstrapPlan({
    plan: validPlan(),
    registry: new AutomationStudioNodeRegistry(),
    resolution: { scope: { kind: "global" }, runtimeCapabilities: [], permissions: [] }
  });
  if (!result.validated) throw new Error(JSON.stringify(result.issues));
  return result.validated;
}

async function proposal(instance: AutomationStudioService) {
  const project = await instance.createProject({ name: "Bootstrap lifecycle" });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.bootstrap", name: "Blank instruction Flow" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.active",
    title: "Build a deterministic Flow",
    body: "Create a primary path from Start to End.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });
  const baseDependencyDigest = await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId);
  const adaptation = await instance.createFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    baseDependencyDigest,
    sourceInstructionIds: ["instruction.active"],
    summary: "Build the requested deterministic Flow.",
    buildPlan: validatedPlan()
  });
  return { project, flow, adaptation };
}

describe("AutomationStudioService Flow Bootstrap adaptations", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((value) => value.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("persists a Core-owned topology and deterministic layout through approval and apply", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    expect(adaptation.status).toBe("proposed");
    await instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "approve",
      actorId: "reviewer"
    });
    const applied = await instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "apply",
      actorId: "reviewer"
    });

    expect(applied.status).toBe("applied");
    const router = await instance.getFlowRouter(project.id, flow.flowId);
    const subflows = await instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(router?.routerId).toMatch(/^router\.bootstrap\./);
    expect(subflows.total).toBe(1);
    expect(router?.fallback).toEqual({ kind: "subflow", subflowId: subflows.subflows[0]!.subflowId });
    const graph = await instance.getFlow(project.id, subflows.subflows[0]!.graphFlowId!);
    expect(graph.metadata).toMatchObject({
      parentFlowId: flow.flowId,
      parentSubflowId: subflows.subflows[0]!.subflowId,
      subflowGraph: true,
      bootstrapAdaptationId: adaptation.adaptationId
    });
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^node\.bootstrap\./),
      expect.stringMatching(/^node\.bootstrap\./)
    ]));
    expect(new Set(graph.nodes.map((node) => `${node.position?.x}:${node.position?.y}`)).size).toBe(2);

    await instance.close();
    services.delete(instance);
    const reloaded = service();
    await expect(reloaded.getFlowBootstrapAdaptation(project.id, flow.flowId, adaptation.adaptationId))
      .resolves.toMatchObject({ status: "applied", kind: "flow_bootstrap" });
    await expect(reloaded.listFlowAdaptationSummaries({ projectId: project.id, limit: 10, offset: 0 }))
      .resolves.toMatchObject({ total: 1, adaptations: [{ adaptationId: adaptation.adaptationId, status: "applied" }] });
  });

  it("bridges a generated proposal ID through standard PIN-gated Adaptation Audit get, approve, and apply endpoints", async () => {
    const provider = {
      metadata: { provider: "deepseek", model: "deepseek-chat" },
      runTask: vi.fn(async () => ({
        response: { kind: "flow_bootstrap", summary: "Build the requested deterministic Flow.", plan: validPlan() },
        usage: { inputTokens: 900, outputTokens: 100, totalTokens: 1000, estimatedCostUsd: 0.001 }
      }))
    };
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: async () => ({
        provider,
        tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 512, maxTotalTokens: 9_000 },
        maxCallsPerRun: 1,
        maxEstimatedCostUsd: 0.25,
        timeoutMs: 20_000
      })
    }).bindNativeNodeRuntime(readyNativeRuntime());
    services.add(instance);
    const project = await instance.createProject({ name: "Bootstrap API bridge", domainId: "example" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.bootstrap-api", name: "Blank API Flow" });
    const now = Date.now();
    await instance.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.api",
      title: "Build a primary path",
      body: "Create a deterministic Start to End Flow.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const binding = await instance.getLlmExecutionBinding(project.id, flow.flowId);
    const grants = { inspectAvailable: vi.fn(async () => ({ purpose: "build_and_adapt", ...binding })) };
    const identityAccess = { authorizeSessionPin: vi.fn(async () => ({ id: "user.reviewer" })) };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, instance, identityAccess as any, undefined, undefined, grants as any);
    const actor: ProgramApiActor = {
      sessionId: "session.reviewer",
      userId: "user.reviewer",
      roleId: "admin",
      permissions: ["programs.read", "flows.write"]
    };
    const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor, payload });

    const generated = await call(AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation, {
      projectId: project.id,
      flowId: flow.flowId,
      authSessionId: actor.sessionId,
      llmExecutionGrantId: "llm-grant:bridge"
    }) as any;
    expect(generated.ok, generated.error).toBe(true);
    expect(generated).toMatchObject({ payload: { adaptation: { status: "proposed", accounting: { inputTokens: 900, totalTokens: 1000 } } } });
    const adaptationId = generated.payload.adaptation.adaptationId as string;
    const inbox = await call(AUTOMATION_STUDIO_ENDPOINTS.listFlowAdaptations, { projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 }) as any;
    expect(inbox).toMatchObject({ ok: true, payload: { page: { total: 1 }, adaptations: [{ adaptationId, status: "proposed" }] } });
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });

    const opened = await call(AUTOMATION_STUDIO_ENDPOINTS.getFlowAdaptation, { projectId: project.id, flowId: flow.flowId, adaptationId }) as any;
    expect(opened).toMatchObject({ ok: true, payload: { adaptation: {
      adaptationId,
      status: "proposed",
      author: "llm",
      sourceInstructionIds: ["instruction.api"],
      metadata: { adaptationKind: "flow_bootstrap", bootstrap: {
        baseExecutionDigest: binding.executionDigest,
        baseSettingsRevision: binding.settingsRevision,
        currentExecutionDigest: binding.executionDigest,
        accounting: { provider: "deepseek", model: "deepseek-chat", inputTokens: 900, totalTokens: 1000 }
      } }
    } } });
    expect(opened.payload.adaptation.metadata.phase9.auditEvents.map((event: any) => event.eventType)).toEqual(["created"]);
    expect(JSON.stringify(opened)).not.toMatch(/secret|grant|session\.reviewer/i);

    const approved = await call(AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation, {
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId,
      action: "approve",
      authSessionId: actor.sessionId,
      authorizationPin: "1234"
    }) as any;
    expect(approved).toMatchObject({ ok: true, payload: { adaptation: { status: "validated" } } });
    expect(approved.payload.adaptation.metadata.phase9.auditEvents.map((event: any) => event.eventType)).toEqual(["created", "approved"]);
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();

    const applied = await call(AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation, {
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId,
      action: "apply",
      authSessionId: actor.sessionId,
      authorizationPin: "1234"
    }) as any;
    expect(applied).toMatchObject({ ok: true, payload: { adaptation: { status: "applied", metadata: { bootstrap: { application: { appliedBy: actor.userId, appliedExecutionDigest: expect.any(String) }, currentExecutionDigest: expect.any(String) } } } } });
    expect(applied.payload.adaptation.metadata.bootstrap.currentExecutionDigest).toBe(applied.payload.adaptation.metadata.bootstrap.application.appliedExecutionDigest);
    expect(applied.payload.adaptation.metadata.phase9.auditEvents.map((event: any) => event.eventType)).toEqual(["created", "approved", "applied"]);
    expect(applied.payload.adaptation.metadata.bootstrap.currentExecutionDigest).not.toBe(binding.executionDigest);
    expect(identityAccess.authorizeSessionPin).toHaveBeenCalledTimes(2);
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toMatchObject({ fallback: { kind: "subflow" } });
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 1 });
    const runtime = await instance.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" });
    expect(runtime.status, runtime.trace?.message).toBe("succeeded");

    const reverted = await call(AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation, {
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId,
      action: "revert",
      authSessionId: actor.sessionId,
      authorizationPin: "1234"
    }) as any;
    expect(reverted).toMatchObject({ ok: true, payload: { adaptation: { status: "reverted", metadata: { adaptationKind: "flow_bootstrap" } } } });
    expect(reverted.payload.adaptation.metadata.phase9.auditEvents.map((event: any) => event.eventType)).toEqual(["created", "approved", "applied", "rollback"]);
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();

    const rejectedFlow = await instance.createFlow({ projectId: project.id, flowId: "flow.bootstrap-reject", name: "Reject Bootstrap" });
    await instance.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.reject",
      title: "Rejectable build",
      body: "Create a deterministic Start to End Flow.",
      scope: { kind: "flow", projectId: project.id, flowId: rejectedFlow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const rejectedCandidate = await instance.createFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: rejectedFlow.flowId,
      baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, rejectedFlow.flowId),
      sourceInstructionIds: ["instruction.reject"],
      summary: "Reject this candidate.",
      buildPlan: validatedPlan()
    });
    const rejected = await call(AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation, {
      projectId: project.id,
      flowId: rejectedFlow.flowId,
      adaptationId: rejectedCandidate.adaptationId,
      action: "reject",
      reason: "Reviewer declined the generated topology.",
      authSessionId: actor.sessionId,
      authorizationPin: "1234"
    }) as any;
    expect(rejected).toMatchObject({ ok: true, payload: { adaptation: { status: "rejected", metadata: { adaptationKind: "flow_bootstrap" } } } });
    expect(rejected.payload.adaptation.metadata.phase9.auditEvents.map((event: any) => event.eventType)).toEqual(["created", "rejected"]);
    expect(JSON.stringify(rejected.payload.adaptation.metadata.phase9)).not.toMatch(/secret|keyId|grant|session\./i);
    await expect(instance.getFlowRouter(project.id, rejectedFlow.flowId)).resolves.toBeNull();
    expect(identityAccess.authorizeSessionPin).toHaveBeenCalledTimes(4);
  });
  it("merges bootstrap and ordinary adaptations without duplicate Inbox persistence", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    const now = Date.now();
    await instance.saveFlowAdaptation({
      schemaVersion: "0.1",
      adaptationId: "adaptation.ordinary",
      flowId: flow.flowId,
      projectId: project.id,
      trigger: "Ordinary runtime adaptation",
      diagnosis: "Preserve the standard adaptation path.",
      patch: [{ kind: "edit_expectation", targetId: "expectation.ordinary", summary: "Tighten expected state." }],
      status: "validated",
      author: "runtime",
      riskLevel: "low",
      createdAt: now,
      updatedAt: now
    });

    const page = await instance.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.adaptations.filter((item) => item.adaptationId === adaptation.adaptationId)).toHaveLength(1);
    expect(page.adaptations).toEqual(expect.arrayContaining([
      expect.objectContaining({ adaptationId: adaptation.adaptationId, status: "proposed" }),
      expect.objectContaining({ adaptationId: "adaptation.ordinary", status: "validated", trigger: "Ordinary runtime adaptation" })
    ]));
    await expect(instance.getFlowAdaptation(project.id, flow.flowId, "adaptation.ordinary"))
      .resolves.toMatchObject({ adaptationId: "adaptation.ordinary", status: "validated", author: "runtime" });
  });
  it("rejects stale application without mutating topology", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "approve" });
    const current = await instance.getFlow(project.id, flow.flowId);
    await instance.saveFlow({ projectId: project.id, flow: { ...current, description: "Concurrent edit" } });

    await expect(instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "apply"
    })).rejects.toThrow(/FLOW_BOOTSTRAP_STALE/);
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 }))
      .resolves.toMatchObject({ total: 0 });
  });

  it("revalidates and rejects an invalid plan at proposal time", async () => {
    const instance = service();
    const project = await instance.createProject({ name: "Invalid Bootstrap" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.invalid-bootstrap", name: "Blank" });
    const buildPlan = structuredClone(validatedPlan());
    buildPlan.plan.subflows[0]!.nodes[0]!.definitionId = "builtin.missing";
    await expect(instance.createFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId),
      sourceInstructionIds: [],
      summary: "Invalid",
      buildPlan
    })).rejects.toThrow(/definition_unavailable/);
  });

  it("rolls back owned graph and Subflow creation when Router persistence fails", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "approve" });
    const saveRouter = instance.saveFlowRouter.bind(instance);
    const spy = vi.spyOn(instance, "saveFlowRouter").mockRejectedValueOnce(new Error("injected router failure"));

    await expect(instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "apply"
    })).rejects.toThrow("injected router failure");
    spy.mockRestore();
    void saveRouter;
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 }))
      .resolves.toMatchObject({ total: 0 });
    await expect(instance.getFlow(project.id, adaptation.topology.subflows[0]!.graphFlow.flowId)).rejects.toThrow(/Unknown Automation Studio Flow/);
  });

  it("reverts only the exact applied topology and restores a blank parent", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "approve" });
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "apply" });
    const reverted = await instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "revert",
      actorId: "reviewer"
    });

    expect(reverted.status).toBe("reverted");
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toBeNull();
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 }))
      .resolves.toMatchObject({ total: 0 });
    const parent = await instance.getFlow(project.id, flow.flowId);
    expect(parent.nodes).toEqual([]);
    expect(parent.edges).toEqual([]);
    expect(parent.metadata?.bootstrapAdaptationId).toBeUndefined();
  });

  it("compensates back to the applied topology when revert persistence fails", async () => {
    const instance = service();
    const { project, flow, adaptation } = await proposal(instance);
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "approve" });
    await instance.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, action: "apply" });
    const spy = vi.spyOn(instance, "saveFlow").mockRejectedValueOnce(new Error("injected parent restore failure"));

    await expect(instance.reviewFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      adaptationId: adaptation.adaptationId,
      action: "revert"
    })).rejects.toThrow("injected parent restore failure");
    spy.mockRestore();
    await expect(instance.getFlowRouter(project.id, flow.flowId)).resolves.toMatchObject({
      metadata: { bootstrapAdaptationId: adaptation.adaptationId }
    });
    await expect(instance.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 }))
      .resolves.toMatchObject({ total: 1 });
    await expect(instance.getFlowBootstrapAdaptation(project.id, flow.flowId, adaptation.adaptationId))
      .resolves.toMatchObject({ status: "applied" });
  });
  it("exposes canonical settings revision with the execution digest", async () => {
    const instance = service();
    const project = await instance.createProject({ name: "Execution binding" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.binding", name: "Binding" });
    const before = await instance.getLlmExecutionBinding(project.id, flow.flowId);
    const current = await instance.getFlow(project.id, flow.flowId);
    await instance.saveFlow({
      projectId: project.id,
      flow: { ...current, metadata: { ...(current.metadata ?? {}), llmModel: "new-model" } }
    });
    const after = await instance.getLlmExecutionBinding(project.id, flow.flowId);
    expect(after.settingsRevision).toBeGreaterThan(before.settingsRevision);
    expect(after.executionDigest).not.toBe(before.executionDigest);
  });
});