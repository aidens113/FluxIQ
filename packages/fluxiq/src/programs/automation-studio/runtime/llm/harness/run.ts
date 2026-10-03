import { randomUUID } from "node:crypto";
import type { AutomationStudioLlmRunCallOutcome } from "../run-call-record.ts";
import {
  AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  automationStudioLlmProviderPaidUsage
} from "../provider-contract.ts";
import { automationStudioLlmProviderCall, type AutomationStudioLlmProviderRetryAccount } from "../provider-retry/index.ts";
import { automationStudioLlmBuildPurseHoldCall, automationStudioLlmProjectedCallCostUsd } from "../build-purse/index.ts";
import { automationStudioLoopStageTransition } from "../stages/index.ts";
import { packAutomationStudioLlmContext } from "./context-packet.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../token-estimation.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmUsageSummary } from "./provider.ts";
import { interventionFromLlmResult } from "./intervention.ts";
import { isRecord, validRequestIdentity } from "./json-bounds.ts";
import { automationStudioLlmScreenedProviderThrow } from "./throw-screen.ts";
import { parseAutomationStudioLlmProviderResult } from "./provider-result.ts";
import { expectedOutputForTask } from "./task-kind.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskRequest, AutomationStudioLlmTaskResult } from "./task-request.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD,
  resolveAutomationStudioLlmTokenLimits,
  validateAutomationStudioLlmUsage
} from "./token-limits.ts";

export async function runAutomationStudioLlmHarness(input: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult> {
  const now = input.now ?? Date.now;
  const tokenLimitResolution = resolveAutomationStudioLlmTokenLimits(input.tokenLimits);
  // The instructions are carried whole whatever the task (`./instruction.ts`):
  // the budget they are reported against is the request's own input limit,
  // the model's window less the reply. A flow bootstrap was held to 384
  // instruction tokens and its node catalog to 4,000 input tokens until
  // 2026-09-30; neither bound remains.
  const context = packAutomationStudioLlmContext({
    ...input,
    tokenBudget: tokenLimitResolution.limits.maxInputTokens
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
  // What the request measures, stated on any refusal below: a request over the
  // model's context window is refused loudly and never trimmed to fit. One
  // estimator (UTF-8 bytes / 3) for the harness and the adapter alike, and the
  // larger of the two measures -- the packed request, and the messages the
  // provider will actually send -- so the adapter can never refuse, without a
  // size, a request this passed.
  const { estimatedInputTokens, estimatedInputBytes } = measuredInput(request, input.provider);
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
    budgetDiagnostics.push({ severity: "error", code: "llm_budget.input_limit_exceeded", message: `Packed LLM request is an estimated ${estimatedInputTokens} input tokens (${estimatedInputBytes} bytes), over its ${request.tokenLimits.maxInputTokens}-token input limit: the ${request.tokenLimits.maxTotalTokens}-token context window less ${request.tokenLimits.maxOutputTokens} reserved for the reply. It was not sent, and nothing was trimmed to fit.`, path: "context", metadata: { estimatedInputTokens, estimatedInputBytes, maxInputTokens: request.tokenLimits.maxInputTokens, maxOutputTokens: request.tokenLimits.maxOutputTokens, maxTotalTokens: request.tokenLimits.maxTotalTokens } });
  }
  if (estimatedInputTokens + request.tokenLimits.maxOutputTokens > request.tokenLimits.maxTotalTokens) {
    budgetDiagnostics.push({ severity: "error", code: "llm_budget.request_total_exceeded", message: `Packed LLM request is an estimated ${estimatedInputTokens} input tokens (${estimatedInputBytes} bytes) plus ${request.tokenLimits.maxOutputTokens} reserved for the reply, over the ${request.tokenLimits.maxTotalTokens}-token context window. It was not sent, and nothing was trimmed to fit.`, path: "tokenLimits", metadata: { estimatedInputTokens, estimatedInputBytes, maxOutputTokens: request.tokenLimits.maxOutputTokens, maxTotalTokens: request.tokenLimits.maxTotalTokens } });
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
      // The request's own measured size, not its limit: the limit is now the
      // model's window (992,000 tokens), and reserving it on every call priced
      // each one as a full-window request against the run's ledger.
      estimatedInputTokens,
      maxOutputTokens: request.tokenLimits.maxOutputTokens
      // The request's own worst case, under its ceiling: a small call is not
      // held at the price of a full window, which at the window profile is
      // the whole run purse (then $0.25) and refused every call after the first.
      , maxEstimatedCostUsd: reservedCostUsd(input.provider, estimatedInputTokens, request.tokenLimits.maxOutputTokens, request.maxEstimatedCostUsd)
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
  // The build's purse, when the call is made under one (`../build-purse/`):
  // this request's worst case -- its measured input all uncached, its whole
  // reply allowance -- held against what the build has spent and has in flight,
  // and the call refused, unsent, when that would cross the build's ceiling.
  const held = reservation && !reservation.ok ? undefined : automationStudioLlmBuildPurseHoldCall({ provider: input.provider, estimatedInputTokens, maxOutputTokens: request.tokenLimits.maxOutputTokens });
  if (held && !held.ok && reservation?.ok) reservation.lease.release();
  // A reservation the run's budget or the build's purse refused ends the call
  // here, before the provider is invoked. Nothing about a provider may be
  // claimed from here on:
  // this return used to carry `provider: input.provider.metadata` -- the
  // provider it *would* have called -- and the projection that builds a stored
  // failure reads the presence of that metadata as the request having been made.
  // Two live runs ended on this branch and were recorded as an attempted
  // provider request whose answer was unknown, with the provider and model
  // named, no usage and no status; they were then read for a day as DeepSeek
  // rejecting our request. No request was ever made. Saying so is one word, and
  // it is the caller's word to say -- a reader cannot infer it from an absence.
  const refusedBy = reservation && !reservation.ok
    ? { severity: "error" as const, code: reservation.diagnostic.code, message: reservation.diagnostic.message }
    : held && !held.ok ? held.diagnostic : undefined;
  if (refusedBy) {
    const diagnostics = [...context.instructions.diagnostics, refusedBy];
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
          // The refused request's size, when the adapter refused it as too large.
          ...(failure.inputSize ? { inputSize: failure.inputSize } : {}),
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
    // A reply the adapter refused was still paid for: what the provider said it
    // cost, from the malformed reply's account or from any other refusal of a
    // reply that arrived. Without it both ledgers charged the hold, and
    // `run-muqiojz4-04a7a8fc` step 0108 cost $0.0041 and was charged $0.0144.
    const paid = failure.reply?.usage ?? failure.paid;
    if (reservation?.ok) reservation.lease.complete(paid, callOutcome(diagnostics));
    // A request the adapter refused before sending cost nothing; one that may have gone out is charged as held, or as reported.
    if (held?.ok) { if (failure.provenance.providerInvocation === "not_attempted") held.hold.release(); else held.hold.settle(paid); }
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
  // The call answered, so what it reported costing is charged even when its
  // result cannot be parsed: read first, bounded to numbers, and inside the try
  // so a result that throws on being read is charged at its hold, as before.
  let reported: AutomationStudioLlmUsageSummary | undefined;
  try {
    reported = automationStudioLlmProviderPaidUsage(isRecord(call.result) ? call.result.usage : undefined);
    providerResult = parseAutomationStudioLlmProviderResult(call.result, expectedOutput, input.flowBootstrap);
  } catch {
    const diagnostics = [...context.instructions.diagnostics, { severity: "error" as const, code: "llm_output.invalid_provider_result", message: "LLM provider result parsing failed." }, ...retryDiagnostics];
    if (reservation?.ok) reservation.lease.complete(reported, callOutcome(diagnostics));
    if (held?.ok) held.hold.settle(reported);
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
  if (held?.ok) held.hold.settle(providerResult.usage);
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

/**
 * The request's size by Core's one estimator: the packed request, and -- when
 * the provider says how it will measure it -- the messages it will send,
 * whichever is larger. A provider's measure that throws is not a size; the
 * packed request stands and the provider refuses the request by its own code.
 */
function measuredInput(request: AutomationStudioLlmTaskRequest, provider: AutomationStudioLlmProvider | undefined): { estimatedInputTokens: number; estimatedInputBytes: number } {
  const packedBytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  const packed = { estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(packedBytes), estimatedInputBytes: packedBytes };
  let sent: { estimatedInputTokens: number; estimatedInputBytes: number } | undefined;
  try {
    sent = provider?.measureInput?.(request);
  } catch {
    sent = undefined;
  }
  return sent && Number.isSafeInteger(sent.estimatedInputTokens) && Number.isSafeInteger(sent.estimatedInputBytes) && sent.estimatedInputTokens > packed.estimatedInputTokens
    ? { estimatedInputTokens: sent.estimatedInputTokens, estimatedInputBytes: sent.estimatedInputBytes }
    : packed;
}

/**
 * What the ledger holds for this call: the provider's price for the request's
 * own measured input plus the reply's allowance, never more than the call's
 * cost ceiling. A provider that does not price, or prices nonsense, is held at
 * the ceiling, as every call was before.
 */
function reservedCostUsd(provider: AutomationStudioLlmProvider, inputTokens: number, outputTokens: number, ceilingUsd: number): number {
  const priced = automationStudioLlmProjectedCallCostUsd(provider, inputTokens, outputTokens);
  return priced !== undefined ? Math.min(ceilingUsd, priced) : ceilingUsd;
}
