import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import {
  AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure
} from "./llm-provider-contract.ts";
import type { AutomationStudioLlmRunBudgetLedger } from "./llm-run-budget.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  automationStudioFlowBootstrapCatalogByteBudget,
  buildAutomationStudioFlowBootstrapContext,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapPlan
} from "./flow-bootstrap.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../nodes/index.ts";
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
  | "flow_bootstrap"
  | "runtime_diagnosis"
  | "runtime_patch"
  | "router_patch"
  | "subflow_patch"
  | "expectation_action_target_patch"
  | "instruction_suggestion"
  | "change_proposal_generation"
  | "diagnosis_only_report";

export const AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS: Record<AutomationStudioLlmTaskKind, string> = {
  flow_bootstrap: "automation-studio.flow-bootstrap.v1",
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

export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST = 50_000;
export const AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD = 0.25;
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD = 10;

export type AutomationStudioLlmTokenLimits = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
};

const DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS: AutomationStudioLlmTokenLimits = {
  maxInputTokens: 8_000,
  maxOutputTokens: 2_000,
  maxTotalTokens: 10_000
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
  flowBootstrap?: ReturnType<typeof buildAutomationStudioFlowBootstrapContext>;
  policyGates?: JsonObject;
  metadata?: JsonObject;
};

export type AutomationStudioLlmTaskRequest = {
  requestId: string;
  idempotencyKey: string;
  timeoutMs: number;
  estimatedInputTokens: number;
  taskKind: AutomationStudioLlmTaskKind;
  promptVersion: string;
  context: AutomationStudioLlmContextPacket;
  expectedOutput: "diagnosis" | "runtime_patch" | "change_proposal" | "instruction_suggestion" | "flow_bootstrap";
  tokenLimits: AutomationStudioLlmTokenLimits;
  maxEstimatedCostUsd: number;
  dryRun?: boolean;
  metadata?: JsonObject;
};

export type AutomationStudioLlmStructuredResponse =
  | { kind: "flow_bootstrap"; summary: string; plan: AutomationStudioFlowBootstrapPlan; metadata?: JsonObject }
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
  runTask(request: AutomationStudioLlmTaskRequest, execution?: { signal?: AbortSignal }): Promise<unknown>;
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
  flowBootstrap?: { registry?: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution; maxInputTokens?: number };
  policy?: AutomationStudioAdaptationPolicy;
  provider?: AutomationStudioLlmProvider;
  dryRun?: boolean;
  expectedOutput?: AutomationStudioLlmTaskRequest["expectedOutput"];
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxEstimatedCostUsd?: number;
  requestId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  runBudget?: AutomationStudioLlmRunBudgetLedger;
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
  const flowBootstrap = input.taskKind === "flow_bootstrap" && input.flowBootstrap
    ? buildAutomationStudioFlowBootstrapContext({
      ...(input.flowBootstrap.registry ? { registry: input.flowBootstrap.registry } : {}),
      resolution: input.flowBootstrap.resolution,
      instructionText: instructions.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n"),
      maxCatalogBytes: automationStudioFlowBootstrapCatalogByteBudget({
        maxInputTokens: input.flowBootstrap.maxInputTokens ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens,
        instructionBytes: Buffer.byteLength(JSON.stringify(instructions), "utf8")
      })
    })
    : undefined;
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
    ...(flowBootstrap ? { flowBootstrap } : {}),
    ...(input.policy ? { policyGates: adaptationPolicyGates(input.policy) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}
export function validateAutomationStudioLlmOutput(
  response: AutomationStudioLlmStructuredResponse,
  expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"],
  flowBootstrap?: AutomationStudioLlmHarnessInput["flowBootstrap"]
): AutomationStudioLlmDiagnostic[] {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if (containsExecutableCode(response)) diagnostics.push({ severity: "error", code: "llm_output.executable_code", message: "LLM output cannot include executable code, scripts, or function bodies." });
  if (response.kind !== expectedOutput && !(expectedOutput === "runtime_patch" && response.kind === "diagnosis")) {
    diagnostics.push({ severity: "error", code: "llm_output.kind_mismatch", message: `Expected ${expectedOutput} output but received ${response.kind}.`, path: "kind" });
  }
  if (!response.summary.trim()) diagnostics.push({ severity: "error", code: "llm_output.missing_summary", message: "LLM output must include a human-readable summary.", path: "summary" });
  if (response.kind === "flow_bootstrap") {
    if (!flowBootstrap) diagnostics.push({ severity: "error", code: "bootstrap.registry_context_missing", message: "Flow bootstrap validation requires a scope-aware node registry context.", path: "flowBootstrap" });
    else diagnostics.push(...validateAutomationStudioFlowBootstrapPlan({
      plan: response.plan,
      ...(flowBootstrap.registry ? { registry: flowBootstrap.registry } : {}),
      resolution: flowBootstrap.resolution
    }).issues);
  }
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

export function resolveAutomationStudioLlmTokenLimits(input?: Partial<AutomationStudioLlmTokenLimits>): {
  limits: AutomationStudioLlmTokenLimits;
  diagnostics: AutomationStudioLlmDiagnostic[];
} {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  const value = (key: keyof AutomationStudioLlmTokenLimits): number => {
    const requested = input?.[key];
    if (requested === undefined) return DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS[key];
    if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
      diagnostics.push({ severity: "error", code: "llm_budget.invalid_token_limit", message: `${key} must be a positive integer.`, path: `tokenLimits.${key}` });
      return DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS[key];
    }
    if (requested > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST) {
      diagnostics.push({
        severity: "error",
        code: "llm_budget.absolute_token_ceiling",
        message: `${key} cannot exceed the absolute ${AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST}-token per-request ceiling.`,
        path: `tokenLimits.${key}`
      });
      return AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;
    }
    return requested;
  };
  const limits = {
    maxInputTokens: value("maxInputTokens"),
    maxOutputTokens: value("maxOutputTokens"),
    maxTotalTokens: value("maxTotalTokens")
  };
  if (limits.maxInputTokens > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_budget.input_exceeds_total", message: "maxInputTokens cannot exceed maxTotalTokens.", path: "tokenLimits.maxInputTokens" });
  if (limits.maxOutputTokens > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_budget.output_exceeds_total", message: "maxOutputTokens cannot exceed maxTotalTokens.", path: "tokenLimits.maxOutputTokens" });
  return { limits, diagnostics };
}

export async function runAutomationStudioLlmHarness(input: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult> {
  const now = input.now ?? Date.now;
  const tokenLimitResolution = resolveAutomationStudioLlmTokenLimits(input.tokenLimits);
  const context = packAutomationStudioLlmContext({
    ...input,
    tokenBudget: input.taskKind === "flow_bootstrap"
      ? Math.min(
        input.tokenBudget ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.bootstrapInstructionTokens,
        tokenLimitResolution.limits.maxInputTokens,
        AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.bootstrapInstructionTokens
      )
      : Math.min(input.tokenBudget ?? tokenLimitResolution.limits.maxInputTokens, tokenLimitResolution.limits.maxInputTokens),
    ...(input.taskKind === "flow_bootstrap" && input.flowBootstrap
      ? { flowBootstrap: { ...input.flowBootstrap, maxInputTokens: tokenLimitResolution.limits.maxInputTokens } }
      : {})
  });
  const expectedOutput = input.expectedOutput ?? expectedOutputForTask(input.taskKind);
  const requestId = validRequestIdentity(input.requestId) ? input.requestId : `llm.${input.taskKind}.${randomUUID()}`;
  const idempotencyKey = validRequestIdentity(input.idempotencyKey) ? input.idempotencyKey : requestId;
  const timeoutMs = input.timeoutMs ?? AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS;
  const maxEstimatedCostUsd = input.maxEstimatedCostUsd ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD;
  const timeoutDiagnostics: AutomationStudioLlmDiagnostic[] = !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS
    ? [{ severity: "error", code: "llm.provider_invalid_timeout", message: `LLM timeout must be between 1 and ${AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS} milliseconds.`, path: "timeoutMs" }]
    : [];
  let request: AutomationStudioLlmTaskRequest = {
    requestId,
    idempotencyKey,
    timeoutMs,
    estimatedInputTokens: 0,
    taskKind: input.taskKind,
    promptVersion: context.promptVersion,
    context,
    expectedOutput,
    tokenLimits: tokenLimitResolution.limits,
    maxEstimatedCostUsd,
    ...(input.dryRun ? { dryRun: true } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  const estimatedInputTokens = estimateTokens(JSON.stringify(request));
  request = { ...request, estimatedInputTokens };
  const budgetDiagnostics = [...tokenLimitResolution.diagnostics, ...timeoutDiagnostics];
  if (input.taskKind === "flow_bootstrap" && !input.flowBootstrap) budgetDiagnostics.push({ severity: "error", code: "bootstrap.registry_context_missing", message: "Flow bootstrap requires a scope-aware node registry context.", path: "flowBootstrap" });
if (input.taskKind === "flow_bootstrap" && context.instructions.instructions.length === 0) budgetDiagnostics.push({ severity: "error", code: "bootstrap.instructions_missing", message: "Flow bootstrap requires at least one effective active instruction.", path: "instructions" });
  if (input.taskKind === "flow_bootstrap" && context.flowBootstrap?.nodeCatalog.length === 0) budgetDiagnostics.push({ severity: "error", code: "bootstrap.catalog_empty", message: "Flow bootstrap requires a viable node catalog.", path: "flowBootstrap.nodeCatalog" });
  if (input.taskKind === "flow_bootstrap" && context.flowBootstrap?.catalogSelection.missingRequiredTerms.length) budgetDiagnostics.push({
    severity: "error",
    code: "bootstrap.catalog_essentials_missing",
    message: `Required instruction vocabulary could not fit the bounded node catalog: ${context.flowBootstrap.catalogSelection.missingRequiredTerms.join(", ")}.`,
    path: "flowBootstrap.catalogSelection"
  });
  if (!Number.isFinite(maxEstimatedCostUsd) || maxEstimatedCostUsd <= 0 || maxEstimatedCostUsd > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD) budgetDiagnostics.push({ severity: "error", code: "llm_budget.invalid_cost_limit", message: "Estimated cost limit is outside the server range.", path: "maxEstimatedCostUsd" });
  if (estimatedInputTokens > request.tokenLimits.maxInputTokens) {
    budgetDiagnostics.push({ severity: "error", code: "llm_budget.input_limit_exceeded", message: "Packed LLM request exceeds the configured input-token limit.", path: "context", metadata: { estimatedInputTokens, maxInputTokens: request.tokenLimits.maxInputTokens } });
  }
  if (estimatedInputTokens + request.tokenLimits.maxOutputTokens > request.tokenLimits.maxTotalTokens) {
    budgetDiagnostics.push({ severity: "error", code: "llm_budget.request_total_exceeded", message: "Estimated input plus the requested output allowance exceeds the configured total-token limit.", path: "tokenLimits", metadata: { estimatedInputTokens, maxOutputTokens: request.tokenLimits.maxOutputTokens, maxTotalTokens: request.tokenLimits.maxTotalTokens } });
  }
  if (budgetDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    const diagnostics = [...context.instructions.diagnostics, ...budgetDiagnostics];
    return {
      ok: false,
      request,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now())
    };
  }
  if (input.dryRun || !input.provider) {
    const diagnostics = [
      ...context.instructions.diagnostics,
      { severity: input.dryRun ? "info" as const : "error" as const, code: input.dryRun ? "llm.dry_run" : "llm.provider_missing", message: input.dryRun ? "Dry run recorded without invoking an LLM provider." : "No LLM provider is configured." }
    ];
    return {
      ok: input.dryRun === true,
      request,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now())
    };
  }
  const reservation = input.runBudget && input.runId
    ? input.runBudget.reserve({
      runId: input.runId,
      requestId,
      estimatedInputTokens: request.tokenLimits.maxInputTokens,
      maxOutputTokens: request.tokenLimits.maxOutputTokens
      , maxEstimatedCostUsd: request.maxEstimatedCostUsd
    })
    : null;
  if (reservation && !reservation.ok) {
    const diagnostics = [
      ...context.instructions.diagnostics,
      { severity: "error" as const, code: reservation.diagnostic.code, message: reservation.diagnostic.message }
    ];
    return {
      ok: false,
      request,
      provider: input.provider.metadata,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now(), undefined, input.provider.metadata)
    };
  }
  let untrustedProviderResult: unknown;
  try {
    untrustedProviderResult = await runProviderWithEnforcedDeadline(input.provider, request, input.signal);
  } catch (error) {
    if (reservation?.ok) reservation.lease.complete();
    const failure = normalizedAutomationStudioLlmProviderFailure(error);
    const diagnostics = [
      ...context.instructions.diagnostics,
      {
        severity: "error" as const,
        code: failure.code,
        message: failure.message,
        metadata: {
          retryable: failure.retryable,
          ...(failure.status !== undefined ? { providerStatus: failure.status } : {})
        }
      }
    ];
    return {
      ok: false,
      request,
      provider: input.provider.metadata,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now(), undefined, input.provider.metadata)
    };
  }
  let providerResult: ReturnType<typeof parseAutomationStudioLlmProviderResult>;
  try {
    providerResult = parseAutomationStudioLlmProviderResult(untrustedProviderResult, expectedOutput, input.flowBootstrap);
  } catch {
    if (reservation?.ok) reservation.lease.complete();
    const diagnostics = [...context.instructions.diagnostics, { severity: "error" as const, code: "llm_output.invalid_provider_result", message: "LLM provider result parsing failed." }];
    return { ok: false, request, provider: input.provider.metadata, diagnostics, intervention: interventionFromLlmResult(input, request, diagnostics, now(), undefined, input.provider.metadata) };
  }
  const usageDiagnostics = validateAutomationStudioLlmUsage(providerResult.usage, request.tokenLimits);
  if (reservation?.ok) reservation.lease.complete(usageDiagnostics.length ? undefined : providerResult.usage);
  const diagnostics = [...context.instructions.diagnostics, ...providerResult.diagnostics, ...usageDiagnostics];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  return {
    ok,
    request,
    ...(providerResult.response ? { response: providerResult.response } : {}),
    provider: input.provider.metadata,
    ...(providerResult.usage ? { usage: providerResult.usage } : {}),
    diagnostics,
    intervention: interventionFromLlmResult(input, request, diagnostics, now(), providerResult.response, input.provider.metadata, providerResult.usage)
  };
}

function parseAutomationStudioLlmProviderResult(
  value: unknown,
  expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"],
  flowBootstrap?: AutomationStudioLlmHarnessInput["flowBootstrap"]
): {
  response?: AutomationStudioLlmStructuredResponse;
  usage?: AutomationStudioLlmUsageSummary;
  diagnostics: AutomationStudioLlmDiagnostic[];
} {
  if (!boundedProviderResult(value)) return { diagnostics: [{ severity: "error", code: "llm_output.provider_result_too_large", message: "LLM provider result exceeded structural limits." }] };
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if (!isRecord(value)) {
    return { diagnostics: [{ severity: "error", code: "llm_output.invalid_provider_result", message: "LLM provider result must be an object." }] };
  }
  rejectUnexpectedFields(value, ["response", "usage", "diagnostics"], "providerResult", diagnostics);
  const responseDiagnostics: AutomationStudioLlmDiagnostic[] = [];
  const response = parseAutomationStudioLlmStructuredResponse(value.response, responseDiagnostics);
  diagnostics.push(...parseProviderDiagnostics(value.diagnostics), ...responseDiagnostics);
  if (response) diagnostics.push(...validateAutomationStudioLlmOutput(response, expectedOutput, flowBootstrap));
  const usage = parseAutomationStudioLlmUsage(value.usage, diagnostics);
  const boundedDiagnostics = diagnostics.length > 200
    ? [...diagnostics.slice(0, 199), { severity: "error" as const, code: "llm_output.finding_limit", message: "Additional provider-output findings were suppressed." }]
    : diagnostics;
  return {
    ...(response ? { response: stripAutomationStudioLlmResponseMetadata(response) } : {}),
    ...(usage ? { usage } : {}),
    diagnostics: boundedDiagnostics
  };
}

function parseAutomationStudioLlmStructuredResponse(value: unknown, diagnostics: AutomationStudioLlmDiagnostic[]): AutomationStudioLlmStructuredResponse | undefined {
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_response", message: "LLM response must be an object.", path: "response" });
    return undefined;
  }
  const kind = value.kind;
  if (kind !== "flow_bootstrap" && kind !== "diagnosis" && kind !== "runtime_patch" && kind !== "change_proposal" && kind !== "instruction_suggestion") {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_kind", message: "LLM response kind is missing or unsupported.", path: "response.kind" });
    return undefined;
  }
  const commonFields = ["kind", "summary", "metadata"];
  rejectUnexpectedFields(value, kind === "flow_bootstrap"
    ? [...commonFields, "plan"]
    : kind === "diagnosis"
      ? [...commonFields, "confidence"]
    : kind === "instruction_suggestion"
      ? [...commonFields, "instructions"]
      : [...commonFields, "patches", "riskLevel"], "response", diagnostics);
  if (!isBoundedString(value.summary)) diagnostics.push({ severity: "error", code: "llm_output.invalid_summary", message: "LLM response summary must be a bounded string.", path: "response.summary" });
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) diagnostics.push({ severity: "error", code: "llm_output.invalid_metadata", message: "LLM response metadata must be a JSON object.", path: "response.metadata" });
  if (kind === "flow_bootstrap") {
    const parsed = parseAutomationStudioFlowBootstrapPlan(value.plan);
    diagnostics.push(...parsed.issues.map((issue) => ({ ...issue, severity: issue.severity, path: issue.path ? `response.${issue.path}` : "response.plan" })));
  } else if (kind === "diagnosis") {
    if (value.confidence !== undefined && (!isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1)) diagnostics.push({ severity: "error", code: "llm_output.invalid_confidence", message: "Diagnosis confidence must be between 0 and 1.", path: "response.confidence" });
  } else if (kind === "runtime_patch") {
    if (!Array.isArray(value.patches)) diagnostics.push({ severity: "error", code: "llm_output.invalid_patches", message: "Runtime patches must be an array.", path: "response.patches" });
    else {
      if (value.patches.length > 100) diagnostics.push({ severity: "error", code: "llm_output.too_many_patches", message: "Runtime patch response cannot contain more than 100 patches.", path: "response.patches" });
      else value.patches.forEach((patch, index) => validateUnknownRuntimePatch(patch, index, diagnostics));
    }
    if (!isRiskLevel(value.riskLevel)) diagnostics.push({ severity: "error", code: "llm_output.invalid_risk", message: "Runtime patch riskLevel is invalid.", path: "response.riskLevel" });
  } else if (kind === "change_proposal") {
    if (!Array.isArray(value.patches)) diagnostics.push({ severity: "error", code: "llm_output.invalid_patches", message: "Change proposal patches must be an array.", path: "response.patches" });
    else {
      if (value.patches.length > 100) diagnostics.push({ severity: "error", code: "llm_output.too_many_patches", message: "Change proposal response cannot contain more than 100 patches.", path: "response.patches" });
      else value.patches.forEach((patch, index) => validateUnknownChangePatch(patch, index, diagnostics));
    }
    if (!isRiskLevel(value.riskLevel)) diagnostics.push({ severity: "error", code: "llm_output.invalid_risk", message: "Change proposal riskLevel is invalid.", path: "response.riskLevel" });
  } else {
    if (!Array.isArray(value.instructions)) diagnostics.push({ severity: "error", code: "llm_output.invalid_instructions", message: "Instruction suggestions must be an array.", path: "response.instructions" });
    else {
      if (value.instructions.length > 100) diagnostics.push({ severity: "error", code: "llm_output.too_many_instructions", message: "Instruction response cannot contain more than 100 suggestions.", path: "response.instructions" });
      else value.instructions.forEach((instruction, index) => validateUnknownInstructionSuggestion(instruction, index, diagnostics));
    }
  }
  return diagnostics.some((diagnostic) => diagnostic.severity === "error") ? undefined : value as unknown as AutomationStudioLlmStructuredResponse;
}

function validateUnknownRuntimePatch(value: unknown, index: number, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const path = `response.patches.${index}`;
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_patch", message: "Runtime patch must be an object.", path });
    return;
  }
  const kind = value.kind;
  const common = ["kind", "reason", "metadata"];
  const fields = kind === "temporary_action_sequence" ? [...common, "targetNodeId", "actionDefinitionIds"]
    : kind === "temporary_wait_retry" ? [...common, "targetNodeId", "timeoutMs", "retryCount"]
      : kind === "temporary_target_override" ? [...common, "targetNodeId", "target"]
        : kind === "temporary_recovery_subflow_call" ? [...common, "subflowId"]
          : kind === "temporary_reroute" ? [...common, "fromNodeId", "toNodeId"]
            : common;
  rejectUnexpectedFields(value, fields, path, diagnostics);
  if (!["temporary_action_sequence", "temporary_wait_retry", "temporary_target_override", "temporary_recovery_subflow_call", "temporary_reroute"].includes(String(kind))) diagnostics.push({ severity: "error", code: "llm_output.unsupported_runtime_patch", message: "Runtime patch kind is unsupported.", path: `${path}.kind` });
  if (!isBoundedString(value.reason)) diagnostics.push({ severity: "error", code: "llm_output.invalid_patch_reason", message: "Runtime patch reason must be a bounded string.", path: `${path}.reason` });
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) diagnostics.push({ severity: "error", code: "llm_output.invalid_metadata", message: "Runtime patch metadata must be a JSON object.", path: `${path}.metadata` });
  if (kind === "temporary_action_sequence") {
    if (!isBoundedString(value.targetNodeId) || !Array.isArray(value.actionDefinitionIds) || value.actionDefinitionIds.length > 100 || !value.actionDefinitionIds.every(isBoundedString)) diagnostics.push({ severity: "error", code: "llm_output.invalid_action_sequence", message: "Temporary action sequence requires a target and bounded action definition IDs.", path });
  } else if (kind === "temporary_wait_retry") {
    if (!isBoundedString(value.targetNodeId) || !isOptionalNonNegativeInteger(value.timeoutMs) || !isOptionalNonNegativeInteger(value.retryCount)) diagnostics.push({ severity: "error", code: "llm_output.invalid_wait_retry", message: "Temporary wait/retry fields are invalid.", path });
  } else if (kind === "temporary_target_override") {
    if (!isBoundedString(value.targetNodeId) || !isJsonObject(value.target)) diagnostics.push({ severity: "error", code: "llm_output.invalid_target_override", message: "Temporary target override requires a target node and JSON target.", path });
  } else if (kind === "temporary_recovery_subflow_call" && !isBoundedString(value.subflowId)) diagnostics.push({ severity: "error", code: "llm_output.invalid_recovery_subflow", message: "Recovery Subflow call requires a bounded subflowId.", path });
  else if (kind === "temporary_reroute" && (!isBoundedString(value.fromNodeId) || !isBoundedString(value.toNodeId))) diagnostics.push({ severity: "error", code: "llm_output.invalid_reroute", message: "Temporary reroute requires bounded from/to node IDs.", path });
}

function validateUnknownChangePatch(value: unknown, index: number, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const path = `response.patches.${index}`;
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_patch", message: "Change proposal patch must be an object.", path });
    return;
  }
  rejectUnexpectedFields(value, ["kind", "targetId", "summary", "before", "after", "metadata"], path, diagnostics);
  if (!["create_subflow", "edit_subflow", "edit_router", "edit_expectation", "edit_action_target", "edit_recovery", "promote_adaptation", "edit_instruction"].includes(String(value.kind))) diagnostics.push({ severity: "error", code: "llm_output.unsupported_patch_kind", message: "Change proposal patch kind is unsupported.", path: `${path}.kind` });
  if (value.targetId !== undefined && !isBoundedString(value.targetId)) diagnostics.push({ severity: "error", code: "llm_output.invalid_patch_target", message: "Change proposal targetId must be a bounded string.", path: `${path}.targetId` });
  if (!isBoundedString(value.summary)) diagnostics.push({ severity: "error", code: "llm_output.invalid_patch_summary", message: "Change proposal summary must be a bounded string.", path: `${path}.summary` });
  if (value.before !== undefined && !isJsonValue(value.before)) diagnostics.push({ severity: "error", code: "llm_output.invalid_before", message: "Change proposal before value must be JSON.", path: `${path}.before` });
  if (value.after !== undefined && !isJsonValue(value.after)) diagnostics.push({ severity: "error", code: "llm_output.invalid_after", message: "Change proposal after value must be JSON.", path: `${path}.after` });
  if (value.metadata !== undefined && !isJsonObject(value.metadata)) diagnostics.push({ severity: "error", code: "llm_output.invalid_metadata", message: "Change proposal metadata must be a JSON object.", path: `${path}.metadata` });
}

function validateUnknownInstructionSuggestion(value: unknown, index: number, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const path = `response.instructions.${index}`;
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_instruction", message: "Instruction suggestion must be an object.", path });
    return;
  }
  rejectUnexpectedFields(value, ["title", "body", "scope", "tags"], path, diagnostics);
  if (!isBoundedString(value.title) || !isBoundedString(value.body)) diagnostics.push({ severity: "error", code: "llm_output.invalid_instruction", message: "Instruction title and body must be bounded strings.", path });
  if (value.scope !== undefined && !isJsonObject(value.scope)) diagnostics.push({ severity: "error", code: "llm_output.invalid_instruction_scope", message: "Instruction scope must be a JSON object.", path: `${path}.scope` });
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > 100 || !value.tags.every(isBoundedString))) diagnostics.push({ severity: "error", code: "llm_output.invalid_instruction_tags", message: "Instruction tags must be bounded strings.", path: `${path}.tags` });
}

function parseAutomationStudioLlmUsage(value: unknown, diagnostics: AutomationStudioLlmDiagnostic[]): AutomationStudioLlmUsageSummary | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_usage.invalid", message: "Provider usage must be an object.", path: "providerResult.usage" });
    return undefined;
  }
  rejectUnexpectedFields(value, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"], "providerResult.usage", diagnostics);
  for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (value[key] !== undefined && (!Number.isInteger(value[key]) || (value[key] as number) < 0)) diagnostics.push({ severity: "error", code: "llm_usage.invalid_token_count", message: `${key} must be a non-negative integer.`, path: `providerResult.usage.${key}` });
  }
  if (value.estimatedCostUsd !== undefined && (!isFiniteNumber(value.estimatedCostUsd) || value.estimatedCostUsd < 0)) diagnostics.push({ severity: "error", code: "llm_usage.invalid_cost", message: "estimatedCostUsd must be a non-negative finite number.", path: "providerResult.usage.estimatedCostUsd" });
  if (Number.isInteger(value.inputTokens) && Number.isInteger(value.outputTokens) && Number.isInteger(value.totalTokens)
    && value.totalTokens !== (value.inputTokens as number) + (value.outputTokens as number)) {
    diagnostics.push({ severity: "error", code: "llm_usage.inconsistent_total", message: "Provider totalTokens must equal inputTokens plus outputTokens.", path: "providerResult.usage.totalTokens" });
  }
  return diagnostics.some((diagnostic) => diagnostic.code.startsWith("llm_usage.")) ? undefined : value as AutomationStudioLlmUsageSummary;
}

function parseProviderDiagnostics(value: unknown): AutomationStudioLlmDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return [{ severity: "error", code: "llm_output.invalid_diagnostics", message: "Provider diagnostics must be a bounded array.", path: "providerResult.diagnostics" }];
  const parsed: AutomationStudioLlmDiagnostic[] = [];
  for (const [index, diagnostic] of value.entries()) {
    if (!isRecord(diagnostic)) {
      parsed.push({ severity: "error", code: "llm_output.invalid_diagnostic", message: "Provider diagnostic must be an object.", path: `providerResult.diagnostics.${index}` });
      continue;
    }
    if (!["info", "warning", "error"].includes(String(diagnostic.severity)) || typeof diagnostic.code !== "string" || !/^[a-z0-9_.-]{1,100}$/i.test(diagnostic.code) || !isBoundedString(diagnostic.message)) {
      parsed.push({ severity: "error", code: "llm_output.invalid_diagnostic", message: "Provider diagnostic fields are invalid.", path: `providerResult.diagnostics.${index}` });
      continue;
    }
    const severity = diagnostic.severity as AutomationStudioLlmDiagnostic["severity"];
    parsed.push({ severity, code: "llm.provider_diagnostic", message: `Provider reported a ${severity} diagnostic.` });
  }
  return parsed;
}

function validateAutomationStudioLlmUsage(usage: AutomationStudioLlmUsageSummary | undefined, limits: AutomationStudioLlmTokenLimits): AutomationStudioLlmDiagnostic[] {
  if (!usage) return [];
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if ((usage.inputTokens ?? 0) > limits.maxInputTokens) diagnostics.push({ severity: "error", code: "llm_usage.input_limit_exceeded", message: "Provider-reported input usage exceeded the request limit." });
  if ((usage.outputTokens ?? 0) > limits.maxOutputTokens) diagnostics.push({ severity: "error", code: "llm_usage.output_limit_exceeded", message: "Provider-reported output usage exceeded the request limit." });
  const total = usage.totalTokens ?? ((usage.inputTokens !== undefined && usage.outputTokens !== undefined) ? usage.inputTokens + usage.outputTokens : undefined);
  if (total !== undefined && total > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_usage.total_limit_exceeded", message: "Provider-reported total usage exceeded the request limit." });
  return diagnostics;
}

function rejectUnexpectedFields(value: Record<string, unknown>, allowed: string[], path: string, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) diagnostics.push({ severity: "error", code: "llm_output.unexpected_field", message: "Provider output contained an unexpected field.", path });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedProviderResult(root: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++visited > 10_000 || depth > 20) return false;
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 1000) return false;
      for (let index = 0; index < value.length; index += 1) stack.push({ value: value[index], depth: depth + 1 });
    } else {
      const keys = Object.keys(value);
      if (keys.length > 1000) return false;
      for (const key of keys) stack.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
    }
  }
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 20_000;
}

function validRequestIdentity(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value);
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isRiskLevel(value: unknown): value is "low" | "medium" | "high" | "destructive" {
  return value === "low" || value === "medium" || value === "high" || value === "destructive";
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isJsonValue(value: unknown, seen = new Set<unknown>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 20) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, seen, depth + 1));
}

function stripAutomationStudioLlmResponseMetadata(response: AutomationStudioLlmStructuredResponse): AutomationStudioLlmStructuredResponse {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, summary: response.summary, plan: response.plan };
  if (response.kind === "diagnosis") return { kind: response.kind, summary: response.summary, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}) };
  if (response.kind === "runtime_patch") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  if (response.kind === "change_proposal") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  return {
    kind: response.kind,
    summary: response.summary,
    instructions: response.instructions.map((instruction) => ({
      title: instruction.title,
      body: instruction.body,
      ...(instruction.scope ? { scope: instruction.scope } : {}),
      ...(instruction.tags ? { tags: instruction.tags } : {})
    }))
  };
}

function summarizeAutomationStudioLlmResponse(response: AutomationStudioLlmStructuredResponse): JsonObject {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, subflowCount: response.plan.subflows.length, nodeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.nodes.length, 0), edgeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.edges.length, 0) };
  if (response.kind === "diagnosis") return { kind: response.kind, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}) };
  if (response.kind === "runtime_patch") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  if (response.kind === "change_proposal") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  return { kind: response.kind, instructionCount: response.instructions.length };
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
    reason: response ? "The LLM provider returned a structured result." : (request.dryRun ? "Dry-run LLM intervention was recorded." : "LLM intervention was prepared."),
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
    ...(response ? { structuredResult: summarizeAutomationStudioLlmResponse(response) } : {}),
    validation: {
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      issues: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    },
    ...(usage ? { tokenUsage: usage } : {}),
    createdAt,
    metadata: {
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      timeoutMs: request.timeoutMs,
      estimatedInputTokens: request.estimatedInputTokens,
      tokenLimits: request.tokenLimits,
      maxEstimatedCostUsd: request.maxEstimatedCostUsd,
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

async function runProviderWithEnforcedDeadline(provider: AutomationStudioLlmProvider, request: AutomationStudioLlmTaskRequest, parentSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const parentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) parentAbort();
  else parentSignal?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    if (controller.signal.aborted) throw new AutomationStudioLlmProviderError("llm.provider_aborted", "Provider request aborted.");
    return await Promise.race([
      provider.runTask(request, { signal: controller.signal }),
      new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new AutomationStudioLlmProviderError(parentSignal?.aborted ? "llm.provider_aborted" : "llm.provider_timeout", "Provider request ended.", !parentSignal?.aborted)), { once: true }))
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", parentAbort);
  }
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
  if (taskKind === "flow_bootstrap") return "flow_bootstrap";
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
