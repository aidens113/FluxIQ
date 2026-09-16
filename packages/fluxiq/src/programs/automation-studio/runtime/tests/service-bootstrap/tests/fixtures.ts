import path from "node:path";
import { expect } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioBuildAndAdaptExecutionGrant } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";

export function plan() {
  return {
    schemaVersion: "0.1" as const,
    router: {
      name: "Instruction router",
      rules: [],
      fallback: { kind: "subflow" as const, targetSubflowKey: "primary" }
    },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary" as const,
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [{
        key: "start_end",
        source: { nodeKey: "start", portId: "next" },
        target: { nodeKey: "end", portId: "in" }
      }]
    }]
  };
}

export function mockProvider(runTask?: (request: AutomationStudioLlmTaskRequest) => Promise<unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock-production", model: "mock-bootstrap" },
    runTask: runTask ?? (async () => ({
      response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: plan() },
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 }
    }))
  };
}

export function permissionScopedNativeRuntime(permissions: string[]) {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "domain.example.click",
    version: "1.0.0",
    label: "Click button",
    description: "Click a button in the active target.",
    category: "action",
    source: {
      kind: "importer",
      domainId: "example",
      packageId: "example.package",
      implementationKey: "example.click"
    },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "object", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "boolean" }],
    parameters: [],
    outputAction: { fixedOutputId: "example.click" },
    safety: { requiredPermissions: ["example.action"] }
  };
  return new AutomationStudioNativeNodeRuntime({
    permissions,
    runtimeCapabilities: ["example.actions"]
  }).register({
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
      "example.click": () => ({
        status: "success",
        route: "success",
        outputs: { success: true }
      })
    }
  });
}

export async function blankFixture(
  instance: AutomationStudioService,
  instructionStatus: "active" | "disabled" | "archived" = "active",
  domainId?: string
) {
  const project = await instance.createProject({ name: "LLM Bootstrap Generation", ...(domainId ? { domainId } : {}) });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.generated", name: "Blank Flow" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.build",
    title: "Build a primary path",
    body: "Create a deterministic Start to End Flow.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: instructionStatus,
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });
  return { project, flow };
}

export async function grant(instance: AutomationStudioService, projectId: string, flowId: string): Promise<AutomationStudioBuildAndAdaptExecutionGrant> {
  const binding = await instance.getLlmExecutionBinding(projectId, flowId);
  return {
    grantId: "llm-grant:test",
    actorUserId: "user.test",
    actorSessionId: "session.test",
    purpose: "build_and_adapt",
    executionDigest: binding.executionDigest,
    settingsRevision: binding.settingsRevision
  };
}

export async function expectNoTopology(instance: AutomationStudioService, projectId: string, flowId: string) {
  await expect(instance.getFlowRouter(projectId, flowId)).resolves.toBeNull();
  await expect(instance.listFlowSubflowSummaries({ projectId, flowId, limit: 10, offset: 0 }))
    .resolves.toMatchObject({ total: 0 });
}

export async function rejectedGenerationDiagnostic(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected Flow Bootstrap generation to reject.");
  } catch (error) {
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
    expect(diagnostic).not.toBeNull();
    expect((error as Error).message).toBe("Flow Bootstrap generation failed (" + diagnostic!.code + ").");
    return diagnostic!;
  }
}

export function successfulHarnessResult(buildPlan: unknown = plan()) {
  return {
    ok: true,
    request: { requestId: "request.phase", estimatedInputTokens: 321 },
    response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: buildPlan },
    provider: { provider: "mock-production", model: "mock-bootstrap" },
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 },
    diagnostics: []
  };
}
