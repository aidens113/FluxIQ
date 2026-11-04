// The world the repaired-run tests share: the real service and project store, a
// scripted model and a fixture page. A press of `narrow` narrows the list the read
// returns and `open` puts it back, so a pass that did not run the fix reads what the
// first pass read and no re-run can pass by accident.

import type { JsonObject } from "../../../../../core/index.ts";
import { IoRegistry } from "../../../../../io/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, AutomationStudioLlmProviderError, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/authoring/model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../../tests/replaying-binding.ts";
import { adaptiveTrainingMetadata } from "../../../tests/service-fixtures.ts";

const ACTOR = { actorUserId: "user-t848", actorSessionId: "session-t848" };
const DOMAIN = "t848";
export const PRESS_ID = "t848.action.press";
export const READ_ID = "t848.output.read-list";
export const DATASET = "listings";
const INSTRUCTION = "Return the name of every listing the page holds, cheapest first.";

const row = (at: number): JsonObject => ({ name: `listing-${at}` });
/** The answer, in the order the request asks for. */
export const ALL_TEN = Array.from({ length: 10 }, (_unused, at) => row(at));
/** What a list that was not narrowed gives: the last three of the answer. */
export const FIRST_THREE = ALL_TEN.slice(7);

export const RECORD_OUTPUT: JsonObject = {
  datasetId: DATASET,
  label: "Listings",
  recordsPath: "result.extracted",
  writeMode: "append",
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
    source: { kind: "importer", domainId: DOMAIN, packageId: "t848.package", implementationKey: id },
    availability: { kind: "domain", domainId: DOMAIN },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: id },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }, ...extraOutputs],
    parameters
  };
}

const PRESS = actionNode(PRESS_ID, "Press", [{ id: "control", label: "Control", valueType: "string", required: false }, { id: "target", label: "The control's element", valueType: "any", required: false }]);
const READ = actionNode(READ_ID, "Read list", [
  { id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } },
  { id: "narrowed", label: "Only the narrowed list", valueType: "string", required: false },
  { id: "target", label: "The list's element", valueType: "any", required: false }
], [{ id: "records", label: "Records", valueType: "array", role: "data" }]);

export type RepairedRunScript = {
  /** What the read returns. `narrowed` is the page's state; `asked` is what the step itself asked for. */
  reads?: (page: { narrowed: boolean; asked: boolean }) => JsonObject[];
  /** The failure a read answers with while the page is in this state, so the first pass fails at a step. */
  readFails?: (page: { narrowed: boolean; targeted: boolean }) => { code: string; category: "page_changed" | "unexpected_state" } | undefined;
  /** The control the ladder's patch presses before the read: `narrow` works and `broken` fails. */
  patchControl?: string;
  /** The ladder's patch aims the read at a new target, where the plan allows one, instead of inserting a press. */
  patchesTarget?: boolean;
  /** The re-author's answer to one decision. */
  reauthor?: (request: AutomationStudioLlmTaskRequest, decision: number) => JsonObject;
  /** A step that says it lastingly acts, before the read: by a declared consequence, or by an explicit mark. */
  lastingStep?: boolean | "marked";
  /** The diagnosis says no patch would help, so the ladder ends having written none. */
  diagnosisWantsNoPatch?: boolean;
  /** A step after the read that says it lastingly acts, so a trial starting at the read runs it. */
  lastingAfterRead?: boolean;
  /** Leaves out the opening press, for a re-author: it would have to carry that step too. */
  noOpen?: boolean;
  /** The press the ladder's target override aims anew, which fails until it is aimed. Absent, the patch names the read. */
  overrideFailsOn?: string;
  /** Runs before the Flow does, with the service the run uses. */
  prepare?: (service: AutomationStudioService) => void;
};

function nativeRuntime(page: { narrowed: boolean }, script: RepairedRunScript): AutomationStudioNativeNodeRuntime {
  return new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "t848.package", packageVersion: "1.0.0", domainId: DOMAIN, nodes: [PRESS, READ] },
    {
      packageId: "t848.package",
      packageVersion: "1.0.0",
      implementations: {
        [PRESS_ID]: ({ parameters }) => parameters.control === script.overrideFailsOn && parameters.target === undefined
          ? { status: "failed", route: "failed", message: "That control is gone.", failure: { category: "unexpected_state", code: "executor.target.gone", retryable: false, stage: "execution", effect: "unacted" } }
          : parameters.control === "broken"
          ? { status: "failed", route: "failed", message: "That control does nothing.", failure: { category: "unexpected_state", code: "t848.press.refused", retryable: false, stage: "execution", effect: "unacted" } }
          : { status: "success", outputs: { success: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: PRESS_ID, parameters: { control: String(parameters.control) } } }] },
        [READ_ID]: ({ parameters }) => {
          const failure = script.readFails?.({ narrowed: page.narrowed, targeted: parameters.target !== undefined });
          if (failure) return { status: "failed", route: "failed", message: "The list could not be read.", failure: { category: failure.category, code: failure.code, retryable: false, stage: "execution", effect: "unacted" } };
          return { status: "success", outputs: { success: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: READ_ID, parameters: parameters.target !== undefined ? { narrowed: "yes" } : typeof parameters.narrowed === "string" ? { narrowed: parameters.narrowed } : {}, recordOutput: parameters.recordOutput ?? null } }] };
        }
      }
    }
  );
}

/** A Flow's first run through the real service, and what it left. */
export async function startRepairedRun(script: RepairedRunScript, dataDir: string, services: Set<AutomationStudioService>) {
  const page = { narrowed: false };
  const presses: string[] = [];
  const reads: boolean[] = [];
  const io = new IoRegistry();
  io.registerOutput(DOMAIN, {
    definition: { id: PRESS_ID, title: "Press" },
    mode: "request",
    dispatch: async (request) => {
      const control = String((request.payload as JsonObject | undefined)?.control);
      presses.push(control);
      if (control === "narrow") page.narrowed = true;
      if (control === "open") page.narrowed = false;
      return { ok: true, domainId: DOMAIN, outputId: request.outputId, payload: {} };
    }
  });
  io.registerOutput(DOMAIN, {
    definition: { id: READ_ID, title: "Read list" },
    mode: "request",
    dispatch: async (request) => {
      const asked = (request.payload as JsonObject | undefined)?.narrowed === "yes";
      reads.push(page.narrowed || asked);
      const rows = script.reads ? script.reads({ narrowed: page.narrowed, asked }) : page.narrowed || asked ? ALL_TEN : FIRST_THREE;
      return { ok: true, domainId: DOMAIN, outputId: request.outputId, payload: { result: { extracted: rows } } };
    }
  });

  const taskKinds: string[] = [];
  let decisions = 0;
  const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 };
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "mock-repaired-rows" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      taskKinds.push(request.taskKind);
      if (request.taskKind === "loop_verification") {
        // The judge reads the rows it was shown: a row that is not a listing is no answer, and neither is the end of a list without its start.
        const sent = JSON.stringify(request);
        const defect = sent.includes("not-a-listing") ? "not-a-listing" : sent.includes("listing-7") && !sent.includes("listing-0") ? "listing-7" : undefined;
        return { response: { kind: "diagnosis", summary: defect ? "The records are not every listing, and only the listings." : "Every listing, once.", diagnosis: defect ? { answersRequest: "no", changed: "Read the narrowed list.", defects: [{ kind: "kept_not_asked", row: defect, requestWords: "every listing" }] } : { answersRequest: "yes" } }, usage };
      }
      if (request.taskKind === "evidence_tool_decision") {
        decisions += 1;
        if (!script.reauthor) throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "No build is scripted.", false, 401);
        return { response: { kind: "evidence_tool_decision", summary: "Narrow the list.", decision: script.reauthor(request, decisions) }, usage };
      }
      if (request.taskKind === "runtime_patch") {
        const patch = script.patchesTarget
          ? { kind: "temporary_target_override", targetNodeId: script.overrideFailsOn ?? "read", target: { handles: { control: "narrowed-list" } }, consequences: [], reason: "Read the narrowed list." }
          : { kind: "temporary_action_sequence", targetNodeId: "read", steps: [{ definitionId: PRESS_ID, parameters: { control: script.patchControl ?? "narrow" } }], consequences: [], reason: "Narrow the list before reading it." };
        return { response: { kind: "runtime_patch", summary: "Read the narrowed list.", riskLevel: "low", patches: [patch] }, usage };
      }
      return { response: { kind: "diagnosis", summary: "The list is not narrowed.", diagnosis: { explorationNeeded: false, patchNeeded: script.diagnosisWantsNoPatch !== true } }, usage };
    }
  };
  const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
  const runtime = automationStudioReplayingBinding({
    domainId: DOMAIN,
    deniedEvidenceKeys: ["selector"],
    tools: [{ toolId: "t848.inspect", description: "Inspect the fixture page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { runnable: [PRESS_ID, READ_ID] },
    captureSanitizedFailureEvidence: async () => ({ schemaVersion: "t848.failure-evidence.v1", controls: ["narrowed-list"] }),
    validateTargetOverrideEvidence: () => ({ status: "matched" as const }),
    executeTool: async ({ toolId, value }: { toolId: string; value: JsonObject }) => toolId === "core.run_node"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { controls: [{ label: "Listings" }] }
  });
  const service = new AutomationStudioService({
    dataDir,
    seedFixture: false,
    // No token limits: with them this unpriced mock is reserved a call's worst case at the default model's rates in
    // force now, and at peak hours that reaches the whole ceiling. A second call was then refused, and the tests failed by the clock.
    llmProviderResolver: (async () => ({ provider, timeoutMs: defaults.timeoutMs, maxEstimatedCostUsd: defaults.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd })),
    llmEvidenceRuntime: runtime
  }).bindIoRuntime(io, DOMAIN).bindNativeNodeRuntime(nativeRuntime(page, script));
  services.add(service);

  const project = await service.createProject({ name: "t848 project", domainId: DOMAIN });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.t848", name: "Listings" });
  const training = adaptiveTrainingMetadata();
  const settings = training.trainingModeSettings as JsonObject;
  const metadata: JsonObject = flow.metadata ?? {};
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...flow,
      metadata: {
        ...metadata,
        ...training,
        trainingModeSettings: { ...settings, resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 } } }
      }
    }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(project.id, subflow.graphFlowId!);
  const steps: AutomationStudioFlowNode[] = [
    ...(script.lastingStep ? [{ id: "order", definitionId: PRESS_ID, parameterValues: { control: "order" }, metadata: script.lastingStep === "marked" ? { effect: "mutate" } : { declaredConsequences: ["create_new"] } }] : []),
    ...(script.noOpen ? [] : [{ id: "open", definitionId: PRESS_ID, parameterValues: { control: "open" } }]),
    { id: "read", definitionId: READ_ID, parameterValues: { recordOutput: RECORD_OUTPUT } },
    ...(script.lastingAfterRead ? [{ id: "confirm", definitionId: PRESS_ID, parameterValues: { control: "confirm" }, metadata: { effect: "mutate" } }] : [])
  ];
  const line = ["start", ...steps.map((step) => step.id), "end"];
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...graph,
      nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: {} }, ...steps, { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }],
      edges: line.slice(1).map((target, at) => ({ id: `${line[at]}.${target}`, sourceNodeId: line[at]!, sourcePortId: "success", targetNodeId: target, targetPortId: "in" }))
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.t848",
    title: "Listings",
    body: INSTRUCTION,
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });

  script.prepare?.(service);
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution: { ...ACTOR, intent: "build_and_adapt" } });
  const detail = await service.getFlowRunDetail(project.id, run.runId);
  const page1 = await service.runDatasets.getRunDatasetPage({ projectId: project.id, runId: run.runId, datasetId: DATASET, limit: 200 });
  return {
    run,
    detail,
    rows: page1?.rows,
    summary: page1?.summary,
    service,
    projectId: project.id,
    flowId: flow.flowId,
    graphFlowId: subflow.graphFlowId!,
    presses,
    reads,
    taskKinds,
    /** Runs the Flow as it is now stored, with no model, and answers the rows that run left. */
    replay: async () => {
      const replayed = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
      const stored = await service.runDatasets.getRunDatasetPage({ projectId: project.id, runId: replayed.runId, datasetId: DATASET, limit: 200 });
      return { status: replayed.status, rows: stored?.rows };
    }
  };
}

/**
 * The same edit on a Flow with an earlier step: that step carried as a build must
 * carry it, then the read narrowed.
 */
export function carryTheOrderThenNarrow(request: AutomationStudioLlmTaskRequest, decision: number): JsonObject {
  if (decision > 1) return narrowTheRead(request, decision - 1);
  const draft = (request.context.evidenceLoop?.evidence as Array<{ toolId?: string; value?: { steps?: Array<{ step?: number; actionId?: string }> } }> | undefined)?.find((entry) => entry.toolId === "core.flow_draft")?.value;
  const order = draft?.steps?.find((step) => step.actionId === PRESS_ID);
  return order?.step === undefined ? { kind: "complete", result: { summary: "No step to carry." } } : { kind: "amend_draft", amendments: [{ step: order.step, change: "rerun", input: { consequences: [] } }] };
}

/** The repair's edit: the step that reads the list, run again narrowed; then the end of the build. */
export function narrowTheRead(request: AutomationStudioLlmTaskRequest, decision: number): JsonObject {
  if (decision > 1) return { kind: "complete", result: { summary: "Read the narrowed list." } };
  const draft = (request.context.evidenceLoop?.evidence as Array<{ toolId?: string; value?: { steps?: Array<{ step?: number; actionId?: string; inResult?: boolean }> } }> | undefined)?.find((entry) => entry.toolId === "core.flow_draft")?.value;
  const read = draft?.steps?.find((step) => step.actionId === READ_ID && step.inResult === true);
  if (read?.step === undefined) return { kind: "complete", result: { summary: "No step reads the list." } };
  return { kind: "amend_draft", amendments: [{ step: read.step, change: "rerun", input: { node: READ_ID, parameters: { recordOutput: RECORD_OUTPUT, narrowed: "yes" }, consequences: [] } }] };
}
