// The world the repair isolation proofs run in: the real service, its real stores and its real
// executor, one plain native step on a fake host, a repair model whose answer a test scripts and
// whose calls are counted, and a judge that says what a test says. No browser and no real provider.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { IoRegistry } from "../../../../../io/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../runtime/native-nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioRuntimePatch } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata } from "../../../tests/service-fixtures.ts";

export const PRESS_ID = "example.press";

const STEP: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: PRESS_ID,
  version: "1.0.0",
  label: "Press",
  description: "Presses one named control on the fake host.",
  category: "custom",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "press" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true, retryable: true },
  requiredRuntimeCapabilities: ["example.host"],
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }, { id: "pressed", label: "Pressed", valueType: "string" }],
  parameters: [{ id: "control", label: "Control", valueType: "string" }, { id: "target", label: "Target", valueType: "object" }, { id: "element", label: "Element", valueType: "any" }]
};

/** The judge checks every run. */
const SCHEDULE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 1, decay: 1 };

/** What a judged run comes to: `yes`, `no` (a real verdict, with one defect Core finds in its record), or `unknown` for a judge that cannot be reached. */
export type JudgeAnswer = "yes" | "no" | "unknown";

export type RepairWorld = {
  service: AutomationStudioService;
  dataDir: string;
  /** Controls that fail for good, for as long as they are here. Everything else works. */
  broken: Set<string>;
  /** Controls whose press may have landed: the answer is lost. */
  lostAnswer: Set<string>;
  /** Controls a permission gate refuses: nothing happened, and nothing but a person can change that. */
  denied: Set<string>;
  /** Controls whose item is gone from the page, which no fix brings back. */
  gone: Set<string>;
  /** Every press, in order. */
  presses: string[];
  /** Every request the repair model was given. */
  requests: AutomationStudioLlmTaskRequest[];
  /** What the repair model answers next; absent, it declines. */
  fix: { current: AutomationStudioRuntimePatch | undefined };
  /** What the judge answers next. */
  judge: { answer: JudgeAnswer; asked: number };
  close(): Promise<void>;
};

export async function repairWorld(): Promise<RepairWorld> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-repair-isolation-"));
  const broken = new Set<string>();
  const lostAnswer = new Set<string>();
  const denied = new Set<string>();
  const gone = new Set<string>();
  const presses: string[] = [];
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const fix: RepairWorld["fix"] = { current: undefined };
  const judge: RepairWorld["judge"] = { answer: "yes", asked: 0 };
  const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [STEP] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        press: ({ parameters }) => {
          const control = String(parameters.control);
          presses.push(control);
          if (lostAnswer.has(control)) return { status: "failed", route: "failed", message: `${control} gave no answer.`, failure: { category: "ambiguous_or_unknown" as const, code: "example.press.answer_lost", retryable: false, stage: "execution" as const, effect: "ambiguous" as const } };
          if (denied.has(control)) return { status: "failed", route: "failed", message: `${control} needs a permission.`, failure: { category: "external_side_effect_denied" as const, code: "example.press.denied", retryable: false, stage: "execution" as const, effect: "unacted" as const } };
          if (gone.has(control)) return { status: "failed", route: "failed", message: `${control} is gone.`, failure: { category: "unexpected_state" as const, code: "executor.target.gone", retryable: false, stage: "execution" as const, effect: "unacted" as const } };
          if (broken.has(control)) return { status: "failed", route: "failed", message: `${control} did not work.`, failure: { category: "unexpected_state" as const, code: "example.press.refused", retryable: false, stage: "execution" as const, effect: "unacted" as const } };
          return { status: "success", route: "success", outputs: { pressed: control } };
        }
      }
    }
  );
  const repairModel: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "repair" },
    runTask: async (request) => {
      requests.push(request);
      if (request.taskKind === "runtime_patch" && fix.current) return { response: { kind: "runtime_patch", summary: fix.current.reason, riskLevel: "low", patches: [fix.current] }, usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 } };
      return { response: { kind: "diagnosis", summary: "The step failed." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
    }
  };
  const judgeModel: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "judge" },
    runTask: async () => {
      judge.asked += 1;
      if (judge.answer === "unknown") throw new Error("the judge could not be reached");
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: judge.answer === "no" ? { answersRequest: "no", changed: "Do the missing act.", defects: [{ kind: "act_missing", row: "the invoice", requestWords: "Press each control in order" }] } : { answersRequest: judge.answer } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
    }
  };
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: ["fact-evaluation", "action-dispatch"],
    factEvaluator: (conditions) => conditions.map((condition) => ({ result: "true", evidence: { fact: condition.fact }, capturedAt: 1_000 }))
  };
  const service = new AutomationStudioService({
    dataDir,
    seedFixture: false,
    hostRuntime: host,
    llmProviderResolver: () => repairModel,
    resultCheckProviderResolver: (request) => ({ provider: judgeModel, maxEstimatedCostUsd: request.maxEstimatedCostUsd })
  }).bindIoRuntime(new IoRegistry(), "example").bindNativeNodeRuntime(native);
  return {
    service, dataDir, broken, lostAnswer, denied, gone, presses, requests, fix, judge,
    close: async () => {
      await service.close();
      await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
    }
  };
}

export const edge = (sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId: "in" });
export const start = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.start" });
export const end = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } });
export const pinnedCall = (id: string, pin: { partId: string; version: number }): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Call", parameterValues: { part: pin, inputs: {} } });

/** A step that does nothing lasting, by its own word. */
export const look = (id: string, control = id): AutomationStudioFlowNode => ({ id, definitionId: PRESS_ID, definitionVersion: "1.0.0", label: `Look at ${control}`, parameterValues: { control }, metadata: { declaredConsequences: [] } });
/** A step that says it makes something lasting. */
export const act = (id: string, control = id): AutomationStudioFlowNode => ({ id, definitionId: PRESS_ID, definitionVersion: "1.0.0", label: `Act on ${control}`, parameterValues: { control }, metadata: { declaredConsequences: ["create_new"] } });

export type PartGraph = { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[]; interface?: { inputs: JsonValue[]; outputs: JsonValue[] } };

/** A top-level Flow that adapts and is judged. */
export async function adaptingFlow(world: RepairWorld, projectId: string, flowId: string): Promise<{ flowId: string }> {
  const { service } = world;
  const base = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.test", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 };
  const created = await service.createFlow({ projectId, flowId, name: flowId });
  const trainingModeSettings = { ...(base.trainingModeSettings as JsonObject), resultCheck: { schedule: SCHEDULE, authorization } };
  await service.saveFlow({ projectId, flow: { ...created, metadata: { ...(created.metadata ?? {}), ...base, trainingModeSettings } } });
  await service.saveFlowGenerationInstruction({ projectId, flowId, instruction: "Press each control in order and finish." });
  return { flowId };
}

/** A Subflow of a Flow with this graph. */
export async function subflowOf(world: RepairWorld, projectId: string, flowId: string, name: string, role: "primary" | "utility", graph: PartGraph) {
  const { service } = world;
  const subflow = await service.createFlowSubflow({ projectId, flowId, name, role });
  const made = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({ projectId, flow: { ...made, nodes: graph.nodes, edges: graph.edges, ...(graph.interface ? { interface: graph.interface as unknown as typeof made.interface } : {}) } });
  return subflow;
}

/** A person's "save this" of a Subflow of a source Flow. */
export async function keptPart(world: RepairWorld, projectId: string, flowId: string, name: string, graph: PartGraph): Promise<{ partId: string; version: number; subflowId: string; graphFlowId: string }> {
  const subflow = await subflowOf(world, projectId, flowId, name, "utility", graph);
  const kept = await world.service.projectParts.save({ projectId, flowId, subflowId: subflow.subflowId, name, purpose: `Do ${name} for whoever calls it` });
  if (!("saved" in kept) || !kept.saved) throw new Error(JSON.stringify(kept));
  return { partId: kept.partId, version: kept.version, subflowId: subflow.subflowId, graphFlowId: subflow.graphFlowId! };
}

/** A Flow whose primary graph is `graph`, adapting and judged. */
export async function flowOf(world: RepairWorld, projectId: string, flowId: string, graph: PartGraph) {
  await adaptingFlow(world, projectId, flowId);
  const main = await subflowOf(world, projectId, flowId, "Main", "primary", graph);
  await world.service.setFlowMapFallback({ projectId, flowId, kind: "subflow", targetSubflowId: main.subflowId });
  return { flowId, subflowId: main.subflowId, graphFlowId: main.graphFlowId! };
}

/** A Flow whose primary graph calls one pinned part. */
export const callerOf = async (world: RepairWorld, projectId: string, flowId: string, pin: { partId: string; version: number }) =>
  await flowOf(world, projectId, flowId, { nodes: [start(`${flowId}.start`), pinnedCall(`${flowId}.call`, pin), end(`${flowId}.end`)], edges: [edge(`${flowId}.start`, `${flowId}.call`), edge(`${flowId}.call`, `${flowId}.end`)] });
