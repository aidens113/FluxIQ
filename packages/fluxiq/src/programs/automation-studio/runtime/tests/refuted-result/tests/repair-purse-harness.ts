// The service harness the repair-purse chains share: a Flow whose answer is
// always refuted, and a model that never finishes a repair build, every call
// reporting what it cost. Moved out of `repair-purse-chain.test.ts` so the Lab
// purse chain (`flow-purse-chain.test.ts`, t438) runs the same world.

import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

export const ACTOR = { actorUserId: "user-t193", actorSessionId: "session-t193" };
const DOMAIN = "t193";
const CLICK_ID = "t193.action.click";
const EXTRACT_ID = "t193.output.extract-list";
/** What every repair call reports having cost. */
const COST_PER_CALL = 0.03;

const CATALOG = [{ name: "Alpha", colour: "red" }, { name: "Beta", colour: "blue" }];

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
};

function actionNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"], extraOutputs: AutomationStudioNodeDefinition["outputs"] = []): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label,
    description: `${label} on the fixture page.`,
    category: "action",
    source: { kind: "importer", domainId: DOMAIN, packageId: "t193.package", implementationKey: id },
    availability: { kind: "domain", domainId: DOMAIN },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: id },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }, ...extraOutputs],
    parameters
  };
}

const CLICK = actionNode(CLICK_ID, "Click", [{ id: "selector", label: "Selector", valueType: "string", required: false }]);
const EXTRACT = actionNode(EXTRACT_ID, "Extract list", [
  { id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } },
  { id: "where", label: "Only items whose colour is", valueType: "string", required: false }
], [{ id: "records", label: "Records", valueType: "array", role: "data" }]);

function nativeRuntime(): AutomationStudioNativeNodeRuntime {
  return new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "t193.package", packageVersion: "1.0.0", domainId: DOMAIN, nodes: [CLICK, EXTRACT] },
    {
      packageId: "t193.package",
      packageVersion: "1.0.0",
      implementations: {
        [CLICK_ID]: () => ({ status: "success", outputs: { success: true } }),
        [EXTRACT_ID]: ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [{ type: "policy.output.dispatch", payload: { outputId: EXTRACT_ID, parameters: typeof parameters.where === "string" ? { where: parameters.where } : {}, recordOutput: parameters.recordOutput ?? null } }]
        })
      }
    }
  );
}

/** A Flow whose answer is always refuted, and a model that never finishes a repair build. */
export async function createHarness(flowMaxCostUsd: number, dataDir: string, services: Set<AutomationStudioService>) {
  const io = new IoRegistry();
  io.registerOutput(DOMAIN, { definition: { id: CLICK_ID, title: "Click" }, mode: "request", dispatch: async (request) => ({ ok: true, domainId: DOMAIN, outputId: request.outputId, payload: {} }) });
  io.registerOutput(DOMAIN, {
    definition: { id: EXTRACT_ID, title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: DOMAIN, outputId: request.outputId, payload: { result: { extracted: CATALOG.map((item) => ({ name: item.name })) } } })
  });

  /** Every provider call, in order, with what it reported costing. */
  const calls: Array<{ taskKind: string; costUsd: number }> = [];
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "mock-purse" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      // The judge is the result check's, not the repair's, and costs nothing here.
      if (request.taskKind === "loop_verification") {
        calls.push({ taskKind: request.taskKind, costUsd: 0 });
        return { response: { kind: "diagnosis", summary: "The records include items that are not red.", diagnosis: { answersRequest: "no", changed: "Keep only the red products." } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0 } };
      }
      calls.push({ taskKind: request.taskKind, costUsd: COST_PER_CALL });
      const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: COST_PER_CALL };
      if (request.expectedOutput === "diagnosis") {
        return { response: { kind: "diagnosis", summary: "The list is not narrowed.", diagnosis: { explorationNeeded: true, patchNeeded: true } }, usage };
      }
      // A build, or a recovery's look around: always one more look, never done.
      const tools = request.context.evidenceLoop?.tools ?? [];
      const decision = tools.length
        ? { kind: "tool_call", callId: `call.${calls.length}`, toolId: tools[0]!.toolId, input: { area: `area.${calls.length}` } }
        : { kind: "complete", result: { summary: "Unfinished." } };
      return { response: { kind: "evidence_tool_decision", summary: "Look again.", decision }, usage };
    }
  };
  const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
  const service = new AutomationStudioService({
    dataDir,
    seedFixture: false,
    llmProviderResolver: (async () => ({ provider, tokenLimits: { ...defaults.tokenLimits }, timeoutMs: defaults.timeoutMs, maxEstimatedCostUsd: defaults.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd })),
    llmEvidenceRuntime: {
      domainId: DOMAIN,
      deniedEvidenceKeys: ["selector"],
      tools: [{ toolId: "t193.inspect", description: "Inspect the fixture page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      runsNodes: { runnable: [CLICK_ID, EXTRACT_ID] },
      executeTool: async ({ value }) => ({ area: String(value.area ?? "page"), controls: [{ label: "Products" }] })
    }
  }).bindIoRuntime(io, DOMAIN).bindNativeNodeRuntime(nativeRuntime());
  services.add(service);

  const project = await service.createProject({ name: "t193 project", domainId: DOMAIN });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.t193-purse", name: "Red products" });
  const training = adaptiveTrainingMetadata();
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...flow,
      metadata: {
        ...(flow.metadata ?? {}),
        ...training,
        adaptationPolicySettings: { ...(training.adaptationPolicySettings as JsonObject), maxEstimatedCostUsdPerRun: flowMaxCostUsd },
        trainingModeSettings: { ...(training.trainingModeSettings as JsonObject), resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 } } }
      }
    }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...graph,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT_ID, parameterValues: { recordOutput: RECORD_OUTPUT } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.t193",
    title: "Red products",
    body: "Return the name of every red product the page lists, and nothing else.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });
  return { service, projectId: project.id, flowId: flow.flowId, calls };
}
