// One provider call, retried while the fault is temporary and the bounds allow.
//
// **This is the seam every provider call already passes through.** Core sends a
// request to a model in exactly one place -- the harness -- and the other
// `runTask` caller in the repository is a decorator the harness wraps
// (`service/runtime-adaptation/repair-authority.ts`), so a
// retry here is inherited by the diagnosis, the patch, the Flow build, every
// exploration decision and every result verification, including ones written
// later. Nothing opts in and nothing can decline it.
//
// **What it was before.** The DeepSeek adapter classified a 429, a 5xx, a
// request timeout and a network failure as temporary, correctly, and the single
// consumer of that verdict wrote it into a diagnostic's metadata and returned
// `ok: false`. A grep for `backoff`, `sleep` or `delay` over the whole LLM tree
// returned nothing. A rate limit therefore ended a Flow build outright, having
// been correctly identified as something that would pass.
//
// **What a retry costs the run, and what it does not.** The reservation is made
// once, by the harness, before this function is entered, and the attempts happen
// inside it. That is deliberate on three counts. A refused attempt returns no
// usage, so charging the reservation again would invent spend the provider never
// billed. The call backstop counts questions asked of the model, and the
// attempts here re-send one question under one idempotency key. And reserving
// per attempt would refuse the second one as `llm_budget.duplicate_request`,
// making the newest error in the diagnostics a budget refusal -- so a provider
// fault would be recorded as the run running out of money, which is the exact
// misreading that cost a day on `run-muhs8hx3-6fd929e6`.
import { AutomationStudioLlmProviderError, automationStudioLlmSignalTimedOut, normalizedAutomationStudioLlmProviderFailure } from "../provider-contract.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness.ts";
import type { AutomationStudioLlmProviderRetryAccount, AutomationStudioLlmProviderRetryAttempt, AutomationStudioLlmProviderRetryStop } from "./account.ts";
import { automationStudioLlmProviderRetryDecision } from "./decision.ts";
import { automationStudioLlmProviderRetryHintMs } from "./hint.ts";
import { AutomationStudioLlmProviderRetryLedger, automationStudioLlmProviderRetryRunLedger } from "./ledger.ts";

export type AutomationStudioLlmProviderCallOutcome = {
  /** Every attempt this call made, and why it stopped. Always present, answered or not. */
  retry: AutomationStudioLlmProviderRetryAccount;
} & (
  | { ok: true; result: unknown }
  | { ok: false; failure: ReturnType<typeof normalizedAutomationStudioLlmProviderFailure> }
);

export async function automationStudioLlmProviderCall(input: {
  provider: AutomationStudioLlmProvider;
  request: AutomationStudioLlmTaskRequest;
  /** The caller's own deadline or cancellation. An aborted signal stops the loop whatever the fault said. */
  signal?: AbortSignal;
  now: () => number;
  /** Fewer attempts than Core's default, never more. `1` turns retrying off for this call. */
  maxAttempts?: number;
  /** The run this call belongs to, so its retries are charged to the per-run ceiling. Without one only the per-call ceiling binds. */
  runId?: string;
  /** Where the per-run ceiling is kept. Absent means Core's own. */
  ledger?: AutomationStudioLlmProviderRetryLedger;
  /** How the loop waits. Absent means real time; a test passes one that does not spend it. */
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}): Promise<AutomationStudioLlmProviderCallOutcome> {
  const ledger = input.ledger ?? automationStudioLlmProviderRetryRunLedger;
  const wait = input.wait ?? waitForMilliseconds;
  const startedAt = input.now();
  const maxAttempts = input.maxAttempts ?? Number.POSITIVE_INFINITY;
  const attempts: AutomationStudioLlmProviderRetryAttempt[] = [];
  let waitedMs = 0;
  let addedMs = 0;
  const account = (stop: AutomationStudioLlmProviderRetryStop): AutomationStudioLlmProviderRetryAccount => ({
    attempts: Object.freeze([...attempts]),
    retries: Math.max(0, attempts.length - (stop === "answered" ? 0 : 1)),
    waitedMs,
    addedMs,
    stop
  });
  for (let attempt = 1; ; attempt += 1) {
    const attemptStartedAt = input.now();
    try {
      const result = await runProviderWithEnforcedDeadline(input.provider, input.request, input.signal);
      // A retried attempt's own duration is part of what retrying added, whether
      // it answered or not: it is time the call would not have spent had the
      // first attempt succeeded.
      if (attempt > 1) addedMs += charge(ledger, input.runId, elapsedSince(attemptStartedAt, input.now));
      return { ok: true, result, retry: account("answered") };
    } catch (error) {
      const failure = normalizedAutomationStudioLlmProviderFailure(error);
      const elapsedMs = elapsedSince(attemptStartedAt, input.now);
      if (attempt > 1) addedMs += charge(ledger, input.runId, elapsedMs);
      const hintedWaitMs = automationStudioLlmProviderRetryHintMs(error, input.now());
      const decision = automationStudioLlmProviderRetryDecision({
        retryable: failure.retryable,
        code: failure.code,
        cancelled: input.signal?.aborted === true,
        attempt,
        elapsedMs: elapsedSince(startedAt, input.now),
        timeoutMs: input.request.timeoutMs,
        runAddedMs: input.runId ? ledger.addedMs(input.runId) : 0,
        ...(Number.isFinite(maxAttempts) ? { maxAttempts } : {}),
        ...(hintedWaitMs !== undefined ? { hintedWaitMs } : {})
      });
      if (!decision.retry) {
        attempts.push(failedAttempt({ attempt, failure, elapsedMs, waitMs: 0 }));
        return { ok: false, failure, retry: account(decision.stop) };
      }
      attempts.push(failedAttempt({ attempt, failure, elapsedMs, waitMs: decision.waitMs, waitSource: decision.waitSource }));
      waitedMs += decision.waitMs;
      addedMs += charge(ledger, input.runId, decision.waitMs);
      await wait(decision.waitMs, input.signal);
      // The signal may have been aborted while the loop was waiting. Reported as
      // the fault that was actually met, with the cancellation as the reason no
      // further attempt was made: the alternative sends a request Core already
      // knows is unauthorized, to report `llm.provider_aborted` in place of the
      // provider's own answer.
      if (input.signal?.aborted === true) return { ok: false, failure, retry: account("cancelled") };
    }
  }
}

function failedAttempt(input: {
  attempt: number;
  failure: ReturnType<typeof normalizedAutomationStudioLlmProviderFailure>;
  elapsedMs: number;
  waitMs: number;
  waitSource?: "backoff" | "provider_hint";
}): AutomationStudioLlmProviderRetryAttempt {
  return {
    attempt: input.attempt,
    code: input.failure.code,
    ...(input.failure.status !== undefined ? { status: input.failure.status } : {}),
    retryable: input.failure.retryable,
    elapsedMs: input.elapsedMs,
    waitedMs: input.waitMs,
    ...(input.waitSource !== undefined && input.waitMs > 0 ? { waitSource: input.waitSource } : {})
  };
}

function charge(ledger: AutomationStudioLlmProviderRetryLedger, runId: string | undefined, milliseconds: number): number {
  if (runId !== undefined) ledger.spend(runId, milliseconds);
  return Math.max(0, Math.round(milliseconds));
}

function elapsedSince(from: number, now: () => number): number {
  return Math.max(0, now() - from);
}

/**
 * Wait, and stop waiting if the caller's signal is aborted.
 *
 * A retry that sleeps through a cancellation is the shape of a hang: the run has
 * been told to stop and is holding a timer. Resolving on abort rather than
 * rejecting keeps the caller's own account of the failure -- the provider's
 * answer, not the timer's.
 */
function waitForMilliseconds(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal?.aborted === true) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", settle);
      resolve();
    };
    const timer = setTimeout(settle, milliseconds);
    signal?.addEventListener("abort", settle, { once: true });
  });
}

/**
 * One attempt, under its own deadline.
 *
 * Moved here from the harness with its behaviour unchanged: the deadline aborts
 * as a timeout rather than as a bare abort, because a provider holding an
 * authorization reads the difference -- a call that ran out of time is a spent
 * call, and a cancellation ends the authorization with it.
 */
async function runProviderWithEnforcedDeadline(provider: AutomationStudioLlmProvider, request: AutomationStudioLlmTaskRequest, parentSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const parentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) parentAbort();
  else parentSignal?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("LLM provider call reached its deadline.", "TimeoutError")), request.timeoutMs);
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
