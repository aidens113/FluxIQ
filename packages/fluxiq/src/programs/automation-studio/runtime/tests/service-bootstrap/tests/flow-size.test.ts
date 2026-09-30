// The Flow size setting, honoured end to end: saved through the settings
// endpoint, read by the build that proposes a Flow, by the approval that applies
// it, and by the schema the evidence-guided build shows the model.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api/contracts.ts";
import { registerAutomationStudioApi } from "../../../../api/handlers.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapSizeLimits,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBuildPlan
} from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { caller, mockProvider } from "./fixtures.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

const ACTION: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.step",
  version: "1.0.0",
  label: "Example step",
  description: "A deterministic step that passes control on.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "step" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true, codeBacked: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: []
};

function nativeRuntime(): AutomationStudioNativeNodeRuntime {
  return new AutomationStudioNativeNodeRuntime().register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [ACTION]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: { step: () => ({ status: "success", route: "success", outputs: { success: true } }) }
  });
}

/** A straight chain of `nodes` nodes: Start, then steps, then End. */
function chain(nodes: number): AutomationStudioFlowBootstrapPlan {
  const keys = Array.from({ length: nodes }, (_unused, index) => (index === 0 ? "start" : index === nodes - 1 ? "end" : `step_${index}`));
  return {
    schemaVersion: "0.1",
    router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: keys.map((key, index) => ({
        key,
        definitionId: index === 0 ? "builtin.control.start" : index === nodes - 1 ? "builtin.control.end" : ACTION.id,
        definitionVersion: "1.0.0"
      })),
      edges: keys.slice(1).map((key, index) => ({
        key: `edge_${index}`,
        source: { nodeKey: keys[index]!, portId: "success" },
        target: { nodeKey: key, portId: "in" }
      }))
    }]
  };
}

/** The chain validated at the setting's largest value, so the service's own check is the one under test. */
function buildPlan(runtime: AutomationStudioNativeNodeRuntime, nodes: number): AutomationStudioFlowBuildPlan {
  const result = validateAutomationStudioFlowBootstrapPlan({
    plan: chain(nodes),
    registry: runtime.sdk.nodes,
    resolution: runtime.getRegistryResolution({ kind: "domain", domainId: "example" }),
    size: automationStudioFlowBootstrapSizeLimits(1_000)
  });
  if (!result.validated) throw new Error(JSON.stringify(result.issues));
  return result.validated;
}

async function fixture(options: { provider?: ReturnType<typeof mockProvider>; evidence?: boolean } = {}) {
  const runtime = nativeRuntime();
  const provider = options.provider ?? mockProvider();
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 3 })) as any,
    ...(options.evidence ? {
      llmEvidenceRuntime: {
        domainId: "example", deniedEvidenceKeys: [],
        tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
        executeTool: vi.fn().mockResolvedValue({ factCount: 1 })
      }
    } : {})
  }).bindNativeNodeRuntime(runtime);
  services.add(instance);
  const project = await instance.createProject({ name: "Flow size", domainId: "example" });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.sized", name: "Sized Flow" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.build",
    title: "Build a long path",
    body: "Create a deterministic Flow of many steps.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    createdAt: now,
    updatedAt: now
  } as any);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, instance, { authorizeSessionPin: vi.fn(async () => ({ id: "user.owner" })) } as any);
  const actor: ProgramApiActor = { sessionId: "session.owner", userId: "user.owner", roleId: "admin", permissions: ["programs.read", "flows.write"] };
  const setMaxNodes = async (maxNodesPerSubflow: number) => {
    const saved = await registry.call({
      programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, scope: {}, actor,
      payload: { projectId: project.id, flowId: flow.flowId, flow: { metadata: { flowSizeSettings: { maxNodesPerSubflow } } } }
    }) as { ok: boolean; error?: string };
    expect(saved.ok, saved.error).toBe(true);
  };
  const propose = async (nodes: number) => instance.createFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId),
    sourceInstructionIds: ["instruction.build"],
    summary: "Build the long Flow.",
    buildPlan: buildPlan(runtime, nodes)
  });
  return { instance, project, flow, setMaxNodes, propose };
}

describe("the Flow size setting, end to end", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-size-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((instance) => instance.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("accepts a straight 100-node chain at the default and refuses 101, naming the setting", async () => {
    const { propose } = await fixture();
    await expect(propose(101)).rejects.toThrow(/flowSizeSettings\.maxNodesPerSubflow[\s\S]*100|100[\s\S]*flowSizeSettings\.maxNodesPerSubflow/);
    const accepted = await propose(100);
    expect(accepted.status).toBe("proposed");
    expect(accepted.buildPlan.plan.subflows[0]!.nodes).toHaveLength(100);
  }, 60_000);

  it("honours a lowered and a raised setting saved through the settings endpoint", async () => {
    const { setMaxNodes, propose } = await fixture();
    await setMaxNodes(20);
    await expect(propose(21)).rejects.toThrow(/flowSizeSettings\.maxNodesPerSubflow[\s\S]*20|20[\s\S]*flowSizeSettings\.maxNodesPerSubflow/);
    await setMaxNodes(150);
    const accepted = await propose(150);
    expect(accepted.buildPlan.plan.subflows[0]!.nodes).toHaveLength(150);
  }, 60_000);

  // The size setting is one of the settings a proposal is bound to
  // (`service/flow-settings/settings-fingerprint.ts`), so lowering it after a
  // proposal makes that proposal stale rather than silently applying it.
  it("refuses to apply a proposal once the Flow's size setting has changed", async () => {
    const { instance, project, flow, setMaxNodes, propose } = await fixture();
    const adaptation = await propose(40);
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, actorId: "reviewer" };
    await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    await setMaxNodes(30);
    await expect(instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" })).rejects.toThrow(/FLOW_BOOTSTRAP_STALE/);
  }, 60_000);

  it("shows the model an output schema sized by the Flow's setting", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      throw new Error("stop after the first request");
    });
    const { instance, project, flow, setMaxNodes } = await fixture({ provider, evidence: true });
    await setMaxNodes(150);
    await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true }).catch(() => undefined);
    // The draft completion asks only for a sentence; what grows with the Flow is
    // the plan schema in the Bootstrap context the model reads beside it.
    const context = requests.map((request) => (request.context as any).flowBootstrap).find(Boolean);
    expect(context.maxNodesPerSubflow).toBe(150);
    const subflow = context.outputSchema.$defs.subflow.properties;
    expect(subflow.nodes.maxItems).toBe(150);
    expect(subflow.edges.maxItems).toBe(automationStudioFlowBootstrapSizeLimits(150).maxEdgesPerSubflow);
  }, 60_000);
});
