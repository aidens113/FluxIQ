import { randomUUID } from "node:crypto";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "../../flow-bootstrap/index.ts";
import {
  automationStudioLlmSignalTimedOut,
  AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure
} from "../provider-contract.ts";
import { packAutomationStudioLlmContext } from "./context-packet.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { interventionFromLlmResult } from "./intervention.ts";
import { validRequestIdentity } from "./json-bounds.ts";
import type { AutomationStudioLlmProvider } from "./provider.ts";
import { parseAutomationStudioLlmProviderResult } from "./provider-result.ts";
import { expectedOutputForTask } from "./task-kind.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest, AutomationStudioLlmTaskResult } from "./task-request.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD,
  estimateTokens,
  resolveAutomationStudioLlmTokenLimits,
  validateAutomationStudioLlmUsage
} from "./token-limits.ts";

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
    ...((input.taskKind === "flow_bootstrap" || input.taskKind === "evidence_tool_decision") && input.flowBootstrap
      ? { flowBootstrap: {
        ...input.flowBootstrap,
        maxInputTokens: Math.min(input.flowBootstrap.maxInputTokens ?? tokenLimitResolution.limits.maxInputTokens, tokenLimitResolution.limits.maxInputTokens)
      } }
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
  if (input.taskKind === "evidence_tool_decision" && !input.evidenceLoop) budgetDiagnostics.push({ severity: "error", code: "evidence_loop.context_missing", message: "Evidence tool decisions require bounded tool and evidence context.", path: "evidenceLoop" });
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

async function runProviderWithEnforcedDeadline(provider: AutomationStudioLlmProvider, request: AutomationStudioLlmTaskRequest, parentSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const parentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) parentAbort();
  else parentSignal?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    if (controller.signal.aborted) throw providerAbortFailure(parentSignal);
    return await Promise.race([
      provider.runTask(request, { signal: controller.signal }),
      new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(providerAbortFailure(parentSignal)), { once: true }))
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", parentAbort);
  }
}

function providerAbortFailure(parentSignal?: AbortSignal): AutomationStudioLlmProviderError {
  const timedOut = !parentSignal?.aborted || automationStudioLlmSignalTimedOut(parentSignal);
  return new AutomationStudioLlmProviderError(timedOut ? "llm.provider_timeout" : "llm.provider_aborted", "Provider request ended.", timedOut);
}
