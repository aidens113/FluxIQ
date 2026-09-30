import { randomUUID } from "node:crypto";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmRunCallOutcome } from "../run-call-record.ts";
import {
  AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS
} from "../provider-contract.ts";
import { automationStudioLlmProviderCall, type AutomationStudioLlmProviderRetryAccount } from "../provider-retry/index.ts";
import { automationStudioLoopStageTransition } from "../stages/index.ts";
import { packAutomationStudioLlmContext } from "./context-packet.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { interventionFromLlmResult } from "./intervention.ts";
import { validRequestIdentity } from "./json-bounds.ts";
import { automationStudioLlmScreenedProviderThrow } from "./throw-screen.ts";
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
  // The declaration travels beside the context so a provider can re-check every
  // evidence slot before sending. Added after the estimate because it is never
  // sent, and only when one was made: absent stays absent, never an empty list.
  request = {
    ...request,
    estimatedInputTokens,
    ...(input.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: Object.freeze([...input.deniedEvidenceKeys]) } : {})
  };
  const budgetDiagnostics = [...tokenLimitResolution.diagnostics, ...timeoutDiagnostics];
  // The stage protocol is enforced here, before a provider is resolved or a
  // budget reserved, so a call that breaks Core's order costs nothing and
  // returns the rule it broke. Enforcing it anywhere later would make the order
  // advisory: the request would already have been sent.
  if (input.stage) {
    const transition = automationStudioLoopStageTransition(input.previousStage, input.stage);
    if (!transition.ok) budgetDiagnostics.push({ severity: "error", code: transition.code, message: transition.message, path: "stage" });
  } else if (input.previousStage) {
    budgetDiagnostics.push({ severity: "error", code: "loop_stage.unknown_stage", message: "A call that follows a stage must name the stage it is in. Leaving a run's stage unset part-way through abandons the fixed order.", path: "stage" });
  }
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
      providerInvocation: "not_attempted",
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
      providerInvocation: "not_attempted",
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
      , ...(input.runBudgetAllowance ? { allowance: input.runBudgetAllowance } : {})
      // What the call is, for its own line on the run's receipt.
      , call: {
        taskKind: request.taskKind,
        ...(input.stage ? { stage: input.stage } : {}),
        promptVersion: request.promptVersion,
        provider: input.provider.metadata.provider,
        model: input.provider.metadata.model
      }
    })
    : null;
  // A reservation the run's budget refused ends the call here, before the
  // provider is invoked. Nothing about a provider may be claimed from here on:
  // this return used to carry `provider: input.provider.metadata` -- the
  // provider it *would* have called -- and the projection that builds a stored
  // failure reads the presence of that metadata as the request having been made.
  // Two live runs ended on this branch and were recorded as an attempted
  // provider request whose answer was unknown, with the provider and model
  // named, no usage and no status; they were then read for a day as DeepSeek
  // rejecting our request. No request was ever made. Saying so is one word, and
  // it is the caller's word to say -- a reader cannot infer it from an absence.
  if (reservation && !reservation.ok) {
    const diagnostics = [
      ...context.instructions.diagnostics,
      { severity: "error" as const, code: reservation.diagnostic.code, message: reservation.diagnostic.message }
    ];
    return {
      ok: false,
      request,
      providerInvocation: "not_attempted",
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now())
    };
  }
  // One reservation, however many attempts the call takes. A fault the adapter
  // called temporary -- a 429, a 5xx, a request timeout, a network failure -- is
  // asked again with backoff inside this call, because the flag it already set
  // was read by nothing and a rate limit ended a whole build
  // (`../provider-retry/call.ts`).
  const call = await automationStudioLlmProviderCall({
    provider: input.provider,
    request,
    now,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.providerRetry?.maxAttempts !== undefined ? { maxAttempts: input.providerRetry.maxAttempts } : {}),
    ...(input.providerRetry?.ledger ? { ledger: input.providerRetry.ledger } : {}),
    ...(input.providerRetry?.wait ? { wait: input.providerRetry.wait } : {})
  });
  // One predicate for both channels: the field on the result and the code on the
  // receipt say the same thing or neither says anything. An ordinary
  // single-attempt failure -- the 400 that ended two live builds -- is not a
  // retry account, and publishing an empty one would make every failed call look
  // like a retried one.
  const retryDiagnostics = providerRetryDiagnostics(call.retry);
  const retryStated = retryDiagnostics.length > 0 ? { providerRetry: call.retry } : {};
  if (!call.ok) {
    const failure = call.failure;
    // An untyped throw's own account, screened here and nowhere earlier
    // (`./throw-screen.ts`): the normalizer holds its message unscreened.
    const providerThrow = failure.thrown ? automationStudioLlmScreenedProviderThrow(failure.thrown) : undefined;
    const diagnostics = [
      ...context.instructions.diagnostics,
      {
        severity: "error" as const,
        code: failure.code,
        message: failure.message,
        metadata: {
          retryable: failure.retryable,
          ...(failure.status !== undefined ? { providerStatus: failure.status } : {}),
          // Metadata, never the diagnostic's message: the message is what an
          // intervention's validation line prints.
          ...(providerThrow ? { providerThrow } : {}),
          // A reply that arrived and could not be read: which case, its finish
          // reason, length and cost, never its content (`../reply-account.ts`).
          ...(failure.reply ? { providerReply: failure.reply } : {})
        }
      },
      // After the failure, never before it, and never as an error. The projection
      // that stores a failed build takes the *newest* error diagnostic
      // (`flow-bootstrap/generation-failure/harness-failure.ts`), so an error
      // here would replace the provider's own code with an unrecognized one and
      // the build would be recorded as `provider_transport_unknown` -- the very
      // misreading this work exists to stop.
      ...retryDiagnostics
    ];
    if (reservation?.ok) reservation.lease.complete(undefined, callOutcome(diagnostics));
    return {
      ok: false,
      request,
      provider: input.provider.metadata,
      // The failure's own account of how far the call got, not this function's
      // guess: a pre-flight refusal inside the adapter never sent anything, a
      // transport error did, and a deadline cannot say.
      providerInvocation: failure.provenance.providerInvocation,
      ...(failure.refusal ? { providerRefusal: failure.refusal } : {}),
      ...retryStated,
      diagnostics,
      intervention: interventionFromLlmResult(input, request, diagnostics, now(), undefined, input.provider.metadata)
    };
  }
  let providerResult: ReturnType<typeof parseAutomationStudioLlmProviderResult>;
  try {
    providerResult = parseAutomationStudioLlmProviderResult(call.result, expectedOutput, input.flowBootstrap);
  } catch {
    const diagnostics = [...context.instructions.diagnostics, { severity: "error" as const, code: "llm_output.invalid_provider_result", message: "LLM provider result parsing failed." }, ...retryDiagnostics];
    if (reservation?.ok) reservation.lease.complete(undefined, callOutcome(diagnostics));
    return { ok: false, request, provider: input.provider.metadata, providerInvocation: "attempted", ...retryStated, diagnostics, intervention: interventionFromLlmResult(input, request, diagnostics, now(), undefined, input.provider.metadata) };
  }
  const usageDiagnostics = validateAutomationStudioLlmUsage(providerResult.usage, request.tokenLimits);
  const diagnostics = [...context.instructions.diagnostics, ...providerResult.diagnostics, ...usageDiagnostics, ...retryDiagnostics];
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  // The provider's report goes to the ledger as it was given, over the
  // request's limits or not. Withholding an overage made the ledger charge the
  // smaller reservation instead and never count the breach, so a run that
  // overspent read as a run that spent exactly what it reserved.
  if (reservation?.ok) reservation.lease.complete(providerResult.usage, callOutcome(diagnostics));
  return {
    ok,
    request,
    ...(providerResult.response ? { response: providerResult.response } : {}),
    provider: input.provider.metadata,
    providerInvocation: "attempted",
    ...(providerResult.usage ? { usage: providerResult.usage } : {}),
    ...retryStated,
    diagnostics,
    intervention: interventionFromLlmResult(input, request, diagnostics, now(), providerResult.response, input.provider.metadata, providerResult.usage)
  };
}

/** How a call ended, as its line on the run's receipt records it: codes, never messages. */
function callOutcome(diagnostics: readonly AutomationStudioLlmDiagnostic[]): AutomationStudioLlmRunCallOutcome {
  return {
    validationOk: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    issueCodes: diagnostics.map((diagnostic) => diagnostic.code)
  };
}

/**
 * What the retrying did, as a line on the run's receipt.
 *
 * **Why it is recorded even when nothing was retried in the end.** A fault the
 * adapter called temporary that was *not* asked again is the more interesting
 * half: it means a bound stopped it -- the attempt count, this call's wall clock,
 * or the run's whole retry allowance -- and a bound that stops a run silently is
 * indistinguishable from a bound that is not there. `stop` names which one, so an
 * exhausted allowance reads as an exhausted allowance and never as the provider
 * having simply failed.
 *
 * `info` when the call went on to answer, `warning` when it did not; never
 * `error`, because the error is the provider's fault and this is the account of
 * what Core did about it.
 */
function providerRetryDiagnostics(retry: AutomationStudioLlmProviderRetryAccount): AutomationStudioLlmDiagnostic[] {
  const nothingToSay = retry.attempts.length === 0 || (retry.retries === 0 && (retry.stop === "not_retryable" || retry.stop === "answered"));
  if (nothingToSay) return [];
  return [{
    severity: retry.stop === "answered" ? "info" : "warning",
    code: "llm.provider_retried",
    message: retry.stop === "answered"
      ? `The LLM provider answered after ${retry.retries} further ${retry.retries === 1 ? "attempt" : "attempts"}.`
      : `The LLM provider was asked ${retry.attempts.length} ${retry.attempts.length === 1 ? "time" : "times"} and no further attempt was made (${retry.stop}).`,
    metadata: {
      stop: retry.stop,
      retries: retry.retries,
      waitedMs: retry.waitedMs,
      addedMs: retry.addedMs,
      attempts: retry.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        code: attempt.code,
        ...(attempt.status !== undefined ? { status: attempt.status } : {}),
        retryable: attempt.retryable,
        elapsedMs: attempt.elapsedMs,
        waitedMs: attempt.waitedMs,
        ...(attempt.waitSource !== undefined ? { waitSource: attempt.waitSource } : {})
      }))
    }
  }];
}
