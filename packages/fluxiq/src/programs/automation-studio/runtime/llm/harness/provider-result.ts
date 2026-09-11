import { parseAutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { isBoundedString, isFiniteNumber, isJsonObject, isJsonValue, isRecord, validRequestIdentity } from "./json-bounds.ts";
import { validateAutomationStudioLlmOutput } from "./output-validation.ts";
import type { AutomationStudioLlmUsageSummary } from "./provider.ts";
import {
  isAutomationStudioRuntimeTargetOverrideTarget,
  stripAutomationStudioLlmResponseMetadata,
  type AutomationStudioLlmStructuredResponse
} from "./structured-response.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest } from "./task-request.ts";

export function parseAutomationStudioLlmProviderResult(
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
  if (kind !== "flow_bootstrap" && kind !== "evidence_tool_decision" && kind !== "diagnosis" && kind !== "runtime_patch" && kind !== "change_proposal" && kind !== "instruction_suggestion") {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_kind", message: "LLM response kind is missing or unsupported.", path: "response.kind" });
    return undefined;
  }
  const commonFields = ["kind", "summary", "metadata"];
  rejectUnexpectedFields(value, kind === "flow_bootstrap"
    ? [...commonFields, "plan"]
    : kind === "evidence_tool_decision"
      ? [...commonFields, "decision"]
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
  } else if (kind === "evidence_tool_decision") {
    validateUnknownEvidenceToolDecision(value.decision, diagnostics);
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

function validateUnknownEvidenceToolDecision(value: unknown, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const path = "response.decision";
  if (!isRecord(value)) {
    diagnostics.push({ severity: "error", code: "llm_output.invalid_evidence_decision", message: "Evidence decision must be an object.", path });
    return;
  }
  if (value.kind === "tool_call") {
    rejectUnexpectedFields(value, ["kind", "callId", "toolId", "input"], path, diagnostics);
    if (!validRequestIdentity(value.callId as string) || !validRequestIdentity(value.toolId as string) || !isJsonObject(value.input)) {
      diagnostics.push({ severity: "error", code: "llm_output.invalid_evidence_tool_call", message: "Evidence tool call fields are invalid.", path });
    }
    return;
  }
  if (value.kind === "complete") {
    rejectUnexpectedFields(value, ["kind", "result"], path, diagnostics);
    if (!isJsonObject(value.result)) diagnostics.push({ severity: "error", code: "llm_output.invalid_evidence_completion", message: "Evidence completion requires a JSON object result.", path });
    return;
  }
  diagnostics.push({ severity: "error", code: "llm_output.invalid_evidence_decision", message: "Evidence decision kind is unsupported.", path: `${path}.kind` });
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
    if (!isBoundedString(value.targetNodeId) || !isAutomationStudioRuntimeTargetOverrideTarget(value.target)) diagnostics.push({ severity: "error", code: "llm_output.invalid_target_override", message: "Temporary target override requires a target node and canonical target.", path });
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

function rejectUnexpectedFields(value: Record<string, unknown>, allowed: string[], path: string, diagnostics: AutomationStudioLlmDiagnostic[]): void {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) diagnostics.push({ severity: "error", code: "llm_output.unexpected_field", message: "Provider output contained an unexpected field.", path });
  }
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

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isRiskLevel(value: unknown): value is "low" | "medium" | "high" | "destructive" {
  return value === "low" || value === "medium" || value === "high" || value === "destructive";
}
