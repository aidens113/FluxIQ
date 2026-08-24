import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioChangeProposalPatch,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow
} from "../model/index.ts";

export type AutomationStudioLlmTaskKind =
  | "runtime_diagnosis"
  | "runtime_patch"
  | "router_patch"
  | "subflow_patch"
  | "expectation_action_target_patch"
  | "instruction_suggestion"
  | "change_proposal_generation"
  | "diagnosis_only_report";

export const AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS: Record<AutomationStudioLlmTaskKind, string> = {
  runtime_diagnosis: "automation-studio.runtime-diagnosis.v1",
  runtime_patch: "automation-studio.runtime-patch.v1",
  router_patch: "automation-studio.router-patch.v1",
  subflow_patch: "automation-studio.subflow-patch.v1",
  expectation_action_target_patch: "automation-studio.expectation-action-target-patch.v1",
  instruction_suggestion: "automation-studio.instruction-suggestion.v1",
  change_proposal_generation: "automation-studio.change-proposal-generation.v1",
  diagnosis_only_report: "automation-studio.diagnosis-only-report.v1"
};

export type AutomationStudioLlmProviderMetadata = {
  provider: string;
  model: string;
  version?: string;
  endpoint?: string;
  metadata?: JsonObject;
};

export type AutomationStudioLlmUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type AutomationStudioLlmDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
  metadata?: JsonObject;
};

export type AutomationStudioResolvedInstruction = {
  instructionId: string;
  scopeKind: string;
  title: string;
  body: string;
  priority: number;
  requirement: "advisory" | "required";
  tags: string[];
  truncated?: boolean;
};

export type AutomationStudioInstructionResolution = {
  instructions: AutomationStudioResolvedInstruction[];
  instructionIds: string[];
  diagnostics: AutomationStudioLlmDiagnostic[];
  tokenBudget: number;
  estimatedTokens: number;
};

export type AutomationStudioLlmContextPacket = {
  schemaVersion: "0.1";
  taskKind: AutomationStudioLlmTaskKind;
  promptVersion: string;
  projectId: string;
  flowId: string;
  runId?: string;
  subflowId?: string;
  nodeId?: string;
  instructions: AutomationStudioInstructionResolution;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  recentActions?: AutomationStudioFlowRunActionAttemptRecord[];
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  subflows?: Array<Pick<AutomationStudioFlowSubflow, "subflowId" | "name" | "role" | "status" | "routeTags" | "stability">>;
  availableActions?: JsonObject[];
  policyGates?: JsonObject;
  metadata?: JsonObject;
};

export type AutomationStudioLlmTaskRequest = {
  taskKind: AutomationStudioLlmTaskKind;
  promptVersion: string;
  context: AutomationStudioLlmContextPacket;
  expectedOutput: "diagnosis" | "runtime_patch" | "change_proposal" | "instruction_suggestion";
  dryRun?: boolean;
  metadata?: JsonObject;
};

export type AutomationStudioLlmStructuredResponse =
  | { kind: "diagnosis"; summary: string; confidence?: number; metadata?: JsonObject }
  | { kind: "runtime_patch"; summary: string; patches: AutomationStudioRuntimePatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "change_proposal"; summary: string; patches: AutomationStudioChangeProposalPatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "instruction_suggestion"; summary: string; instructions: Array<{ title: string; body: string; scope?: JsonObject; tags?: string[] }>; metadata?: JsonObject };

export type AutomationStudioRuntimePatch =
  | { kind: "temporary_action_sequence"; targetNodeId: string; actionDefinitionIds: string[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_wait_retry"; targetNodeId: string; timeoutMs?: number; retryCount?: number; reason: string; metadata?: JsonObject }
  | { kind: "temporary_target_override"; targetNodeId: string; target: JsonObject; reason: string; metadata?: JsonObject }
  | { kind: "temporary_recovery_subflow_call"; subflowId: string; reason: string; metadata?: JsonObject }
  | { kind: "temporary_reroute"; fromNodeId: string; toNodeId: string; reason: string; metadata?: JsonObject };

export type AutomationStudioLlmTaskResult = {
  ok: boolean;
  request: AutomationStudioLlmTaskRequest;
  response?: AutomationStudioLlmStructuredResponse;
  provider?: AutomationStudioLlmProviderMetadata;
  usage?: AutomationStudioLlmUsageSummary;
  diagnostics: AutomationStudioLlmDiagnostic[];
  intervention: AutomationStudioFlowIntervention;
};

export type AutomationStudioLlmProvider = {
  metadata: AutomationStudioLlmProviderMetadata;
  runTask(request: AutomationStudioLlmTaskRequest): Promise<{ response: AutomationStudioLlmStructuredResponse; usage?: AutomationStudioLlmUsageSummary; diagnostics?: AutomationStudioLlmDiagnostic[] }>;
};

export type AutomationStudioInstructionResolutionInput = {
  instructions: AutomationStudioFlowInstruction[];
  projectId: string;
  flowId: string;
  routerId?: string;
  subflowId?: string;
  nodeId?: string;
  onError?: boolean;
  review?: boolean;
  tokenBudget?: number;
};

export type AutomationStudioLlmHarnessInput = AutomationStudioInstructionResolutionInput & {
  taskKind: AutomationStudioLlmTaskKind;
  runId?: string;
  runDetail?: AutomationStudioFlowRunDetail;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  subflows?: AutomationStudioFlowSubflow[];
  availableActions?: JsonObject[];
  policy?: AutomationStudioAdaptationPolicy;
  provider?: AutomationStudioLlmProvider;
  dryRun?: boolean;
  expectedOutput?: AutomationStudioLlmTaskRequest["expectedOutput"];
  now?: () => number;
  metadata?: JsonObject;
};

export function resolveAutomationStudioLlmInstructions(input: AutomationStudioInstructionResolutionInput): AutomationStudioInstructionResolution {
  const tokenBudget = Math.max(128, Math.trunc(input.tokenBudget ?? 2_000));
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  const scoped = input.instructions
    .filter((instruction) => instruction.status === "active")
    .filter((instruction) => instructionAppliesToLlmContext(instruction, input))
    .sort(compareInstructionsForLlm);
  const requiredByScope = new Map<string, AutomationStudioFlowInstruction[]>();
  for (const instruction of scoped.filter((item) => item.requirement === "required")) {
    const key = instruction.scope.kind;
    requiredByScope.set(key, [...(requiredByScope.get(key) ?? []), instruction]);
  }
  for (const [scopeKind, items] of requiredByScope) {
    const always = items.filter((item) => /\balways\b/i.test(item.body));
    const never = items.filter((item) => /\bnever\b/i.test(item.body));
    if (always.length && never.length) diagnostics.push({ severity: "error", code: "instruction.conflict", message: `Required ${scopeKind} instructions contain both always and never directives.`, path: scopeKind });
  }
  const resolved: AutomationStudioResolvedInstruction[] = [];
  let estimatedTokens = 0;
  for (const instruction of scoped) {
    const baseTokens = estimateTokens(instruction.body) + estimateTokens(instruction.title);
    const remaining = tokenBudget - estimatedTokens;
    if (remaining <= 0) break;
    const truncated = baseTokens > remaining;
    const body = truncated ? truncateToEstimatedTokens(instruction.body, Math.max(24, remaining - estimateTokens(instruction.title))) : instruction.body;
    estimatedTokens += Math.min(baseTokens, remaining);
    resolved.push({
      instructionId: instruction.instructionId,
      scopeKind: instruction.scope.kind,
      title: instruction.title,
      body,
      priority: instruction.priority,
      requirement: instruction.requirement,
      tags: instruction.tags ?? [],
      ...(truncated ? { truncated: true } : {})
    });
    if (truncated) diagnostics.push({ severity: "warning", code: "instruction.truncated", message: `Instruction ${instruction.instructionId} was truncated to fit context budget.`, path: instruction.instructionId });
  }
  return {
    instructions: resolved,
    instructionIds: resolved.map((instruction) => instruction.instructionId),
    diagnostics,
    tokenBudget,
    estimatedTokens
  };
}

export function packAutomationStudioLlmContext(input: AutomationStudioLlmHarnessInput): AutomationStudioLlmContextPacket {
  const promptVersion = AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind];
  const instructions = resolveAutomationStudioLlmInstructions(input);
  return {
    schemaVersion: "0.1",
    taskKind: input.taskKind,
    promptVersion,
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    instructions,
    ...(input.stateDiffs?.length ? { stateDiffs: input.stateDiffs.slice(0, 50) } : {}),
    ...(input.routeHistory?.length ? { routeHistory: input.routeHistory.slice(-25) } : {}),
    ...(input.runDetail?.actionAttempts?.length ? { recentActions: input.runDetail.actionAttempts.slice(-50) } : {}),
    ...(input.relevantRuns?.length ? { relevantRuns: input.relevantRuns.slice(0, 25) } : {}),
    ...(input.relevantAdaptations?.length ? { relevantAdaptations: input.relevantAdaptations.slice(0, 25) } : {}),
    ...(input.subflows?.length ? { subflows: input.subflows.slice(0, 100).map(compactSubflowForLlm) } : {}),
    ...(input.availableActions?.length ? { availableActions: input.availableActions.slice(0, 100) } : {}),
    ...(input.policy ? { policyGates: adaptationPolicyGates(input.policy) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

export function validateAutomationStudioLlmOutput(response: AutomationStudioLlmStructuredResponse, expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"]): AutomationStudioLlmDiagnostic[] {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if (containsExecutableCode(response)) diagnostics.push({ severity: "error", code: "llm_output.executable_code", message: "LLM output cannot include executable code, scripts, or function bodies." });
  if (response.kind !== expectedOutput && !(expectedOutput === "runtime_patch" && response.kind === "diagnosis")) {
    diagnostics.push({ severity: "error", code: "llm_output.kind_mismatch", message: `Expected ${expectedOutput} output but received ${response.kind}.`, path: "kind" });
  }
  if (!response.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.missing_summary", message: "LLM output must include a human-readable summary.", path: "summary" });
  if (response.kind === "runtime_patch") validateRuntimePatches(response.patches, diagnostics);
  if (response.kind === "change_proposal") validateChangeProposalPatches(response.patches, diagnostics);
  if (response.kind === "instruction_suggestion") {
    if (!response.instructions.length) diagnostics.push({ severity: "error", code: "llm_output.empty_instructions", message: "Instruction suggestion output must include at least one instruction.", path: "instructions" });
    for (const [index, instruction] of response.instructions.entries()) {
      if (!instruction.title.trim()) diagnostics.push({ severity: "error", code: "llm_output.instruction_missing_title", message: "Suggested instruction title cannot be empty.", path: `instructions.${index}.title` });
      if (!instruction.body.trim()) diagnostics.push({ severity: "error", code: "llm_output.instruction_missing_body", message: "Suggested instruction body cannot be empty.", path: `instructions.${index}.body` });
    }
  }
  return diagnostics;
}

export async function runAutomationStudioLlmHarness(input: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult> {
  const now = input.now ?? Date.now;
  const context = packAutomationStudioLlmContext(input);
  const expectedOutput = input.expectedOutput ?? expectedOutputForTask(input.taskKind);
  const request: AutomationStudioLlmTaskRequest = {
    taskKind: input.taskKind,
    promptVersion: context.promptVersion,
    context,
    expectedOutput,
    ...(input.dryRun ? { dryRun: true } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  if (input.dryRun || !input.provider) {
    const diagnostics = [
      ...context.instructions.diagnostics,
      { severity: "info" as const, code: input.dryRun ? "llm.dry_run" : "llm.provider_missing", message: input.dryRun ? "Dry run recorded without invoking an LLM provider." : "No LLM provider is configured." }
    ];
    return {
      ok: input.dryRun === true,
      request,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now())
    };
  }
  const providerResult = await input.provider.runTask(request);
  const outputDiagnostics = validateAutomationStudioLlmOutput(providerResult.response, expectedOutput);
  const diagnostics = [...context.instructions.diagnostics, ...(providerResult.diagnostics ?? []), ...outputDiagnostics];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  return {
    ok,
    request,
    response: providerResult.response,
    provider: input.provider.metadata,
    ...(providerResult.usage ? { usage: providerResult.usage } : {}),
    diagnostics,
    intervention: interventionFromLlmResult(input, request, diagnostics, now(), providerResult.response, input.provider.metadata, providerResult.usage)
  };
}

function interventionFromLlmResult(
  input: AutomationStudioLlmHarnessInput,
  request: AutomationStudioLlmTaskRequest,
  diagnostics: AutomationStudioLlmDiagnostic[],
  createdAt: number,
  response?: AutomationStudioLlmStructuredResponse,
  provider?: AutomationStudioLlmProviderMetadata,
  usage?: AutomationStudioLlmUsageSummary
): AutomationStudioFlowIntervention {
  return {
    schemaVersion: "0.1",
    interventionId: `intervention.${request.taskKind}.${input.runId ?? input.flowId}.${createdAt}`,
    runId: input.runId ?? "",
    flowId: input.flowId,
    projectId: input.projectId,
    kind: kindForLlmTask(request.taskKind),
    reason: response?.summary ?? (request.dryRun ? "Dry-run LLM intervention was recorded." : "LLM intervention was prepared."),
    promptVersion: request.promptVersion,
    ...(provider?.provider ? { provider: provider.provider } : {}),
    ...(provider?.model ? { model: provider.model } : {}),
    instructionIds: request.context.instructions.instructionIds,
    contextSummary: {
      taskKind: request.taskKind,
      promptVersion: request.promptVersion,
      instructionCount: request.context.instructions.instructionIds.length,
      recentActionCount: request.context.recentActions?.length ?? 0,
      subflowCount: request.context.subflows?.length ?? 0,
      dryRun: request.dryRun === true
    },
    ...(response ? { structuredResult: response as unknown as JsonObject } : {}),
    validation: {
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      issues: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    },
    ...(usage ? { tokenUsage: usage } : {}),
    createdAt,
    metadata: {
      expectedOutput: request.expectedOutput,
      diagnosticCount: diagnostics.length
    }
  };
}

function instructionAppliesToLlmContext(instruction: AutomationStudioFlowInstruction, input: AutomationStudioInstructionResolutionInput): boolean {
  const scope = instruction.scope;
  if (scope.kind === "global") return true;
  if (scope.kind === "project") return scope.projectId === input.projectId;
  if (scope.kind === "flow") return scope.projectId === input.projectId && scope.flowId === input.flowId;
  if (scope.kind === "router") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.routerId || scope.routerId === input.routerId);
  if (scope.kind === "subflow") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.subflowId || scope.subflowId === input.subflowId);
  if (scope.kind === "node") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.nodeId || scope.nodeId === input.nodeId) && (!scope.subflowId || scope.subflowId === input.subflowId);
  if (scope.kind === "on_error") return input.onError === true && scope.projectId === input.projectId && scope.flowId === input.flowId && (!scope.subflowId || scope.subflowId === input.subflowId) && (!scope.nodeId || scope.nodeId === input.nodeId);
  if (scope.kind === "adaptation_review") return input.review === true && scope.projectId === input.projectId && scope.flowId === input.flowId && (!scope.subflowId || scope.subflowId === input.subflowId);
  return false;
}

function compareInstructionsForLlm(left: AutomationStudioFlowInstruction, right: AutomationStudioFlowInstruction): number {
  return scopeRank(left.scope.kind) - scopeRank(right.scope.kind)
    || right.priority - left.priority
    || left.updatedAt - right.updatedAt
    || left.instructionId.localeCompare(right.instructionId);
}

function scopeRank(scopeKind: string): number {
  return ["global", "project", "flow", "router", "subflow", "node", "on_error", "adaptation_review"].indexOf(scopeKind);
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function truncateToEstimatedTokens(value: string, tokens: number): string {
  return `${value.slice(0, Math.max(0, tokens * 4)).trimEnd()}...`;
}

function compactSubflowForLlm(subflow: AutomationStudioFlowSubflow): NonNullable<AutomationStudioLlmContextPacket["subflows"]>[number] {
  return {
    subflowId: subflow.subflowId,
    name: subflow.name,
    role: subflow.role,
    status: subflow.status,
    ...(subflow.routeTags?.length ? { routeTags: subflow.routeTags } : {}),
    ...(subflow.stability ? { stability: subflow.stability } : {})
  };
}

function adaptationPolicyGates(policy: AutomationStudioAdaptationPolicy): JsonObject {
  return {
    preset: policy.preset,
    allowRuntimeRecovery: policy.allowRuntimeRecovery,
    allowCreateRecoveryPaths: policy.allowCreateRecoveryPaths,
    allowModifySubflows: policy.allowModifySubflows,
    allowCreateSubflows: policy.allowCreateSubflows,
    allowModifyRouter: policy.allowModifyRouter,
    allowModifyExpectations: policy.allowModifyExpectations,
    allowModifyActionTargets: policy.allowModifyActionTargets,
    allowDeleteOrDisableBehavior: policy.allowDeleteOrDisableBehavior,
    allowExternalSideEffects: policy.allowExternalSideEffects,
    requireApprovalForDestructiveChanges: policy.requireApprovalForDestructiveChanges,
    requireApprovalForExternalSideEffects: policy.requireApprovalForExternalSideEffects,
    ...(policy.maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun: policy.maxInterventionsPerRun } : {}),
    ...(policy.maxEstimatedCostUsdPerRun !== undefined ? { maxEstimatedCostUsdPerRun: policy.maxEstimatedCostUsdPerRun } : {})
  };
}

function expectedOutputForTask(taskKind: AutomationStudioLlmTaskKind): AutomationStudioLlmTaskRequest["expectedOutput"] {
  if (taskKind === "runtime_patch") return "runtime_patch";
  if (taskKind === "instruction_suggestion") return "instruction_suggestion";
  if (taskKind === "change_proposal_generation" || taskKind === "router_patch" || taskKind === "subflow_patch" || taskKind === "expectation_action_target_patch") return "change_proposal";
  return "diagnosis";
}

function kindForLlmTask(taskKind: AutomationStudioLlmTaskKind): AutomationStudioFlowIntervention["kind"] {
  if (taskKind === "router_patch") return "router_patch";
  if (taskKind === "subflow_patch") return "subflow_patch";
  if (taskKind === "expectation_action_target_patch") return "expectation_patch";
  if (taskKind === "instruction_suggestion") return "instruction_suggestion";
  if (taskKind === "change_proposal_generation") return "change_proposal";
  if (taskKind === "runtime_patch") return "runtime_patch";
  return "diagnosis";
}

function validateRuntimePatches(patches: AutomationStudioRuntimePatch[], diagnostics: AutomationStudioLlmDiagnostic[]): void {
  if (!patches.length) diagnostics.push({ severity: "error", code: "llm_output.empty_runtime_patches", message: "Runtime patch output must include at least one patch.", path: "patches" });
  for (const [index, patch] of patches.entries()) {
    if (!patch.reason.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_reason", message: "Runtime patch must include a reason.", path: `patches.${index}.reason` });
    if ("targetNodeId" in patch && !patch.targetNodeId.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_target", message: "Runtime patch targetNodeId cannot be empty.", path: `patches.${index}.targetNodeId` });
    if (patch.kind === "temporary_action_sequence" && !patch.actionDefinitionIds.length) diagnostics.push({ severity: "error", code: "llm_output.empty_action_sequence", message: "Temporary action sequence must include action definitions.", path: `patches.${index}.actionDefinitionIds` });
    if (patch.kind === "temporary_recovery_subflow_call" && !patch.subflowId.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_subflow", message: "Recovery subflow call must include a subflowId.", path: `patches.${index}.subflowId` });
    if (patch.kind === "temporary_reroute" && (!patch.fromNodeId.trim() || !patch.toNodeId.trim())) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_reroute", message: "Temporary reroute must include fromNodeId and toNodeId.", path: `patches.${index}` });
  }
}

function validateChangeProposalPatches(patches: AutomationStudioChangeProposalPatch[], diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const allowed = new Set(["create_subflow", "edit_subflow", "edit_router", "edit_expectation", "edit_action_target", "edit_recovery", "promote_adaptation", "edit_instruction"]);
  if (!patches.length) diagnostics.push({ severity: "error", code: "llm_output.empty_change_patches", message: "Change proposal output must include at least one patch.", path: "patches" });
  for (const [index, patch] of patches.entries()) {
    if (!allowed.has(patch.kind)) diagnostics.push({ severity: "error", code: "llm_output.unsupported_patch_kind", message: `Unsupported change patch kind: ${patch.kind}.`, path: `patches.${index}.kind` });
    if (!patch.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_summary", message: "Change proposal patch summary cannot be empty.", path: `patches.${index}.summary` });
    if (patch.kind !== "create_subflow" && !patch.targetId?.trim()) diagnostics.push({ severity: "error", code: "llm_output.patch_missing_target", message: "Change proposal patch must include targetId unless it creates a subflow.", path: `patches.${index}.targetId` });
  }
}

function containsExecutableCode(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsExecutableCode(item, seen));
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (["code", "script", "functionBody", "javascript", "typescript"].includes(key)) return true;
    if (containsExecutableCode(item, seen)) return true;
  }
  return false;
}
