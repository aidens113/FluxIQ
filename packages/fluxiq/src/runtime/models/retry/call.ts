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
import { normalizedAutomationStudioLlmProviderFailure } from "../failures/index.ts";
import type { ModelProvider, ModelRequest } from "../contracts/index.ts";
import { ModelExecutionDefaults, type ModelExecutionOptions } from "../execution/index.ts";
import { ExecutionCallbackPolicies, flushObservedExecutionCallbacks, invokeOwnedExecutionCallbackSync, prepareObservedExecutionCallback } from "../../execution-observation/index.ts";
import type { AutomationStudioLlmProviderRetryAccount, AutomationStudioLlmProviderRetryAttempt, AutomationStudioLlmProviderRetryStop } from "./account.ts";
import { automationStudioLlmProviderRetryDecision } from "./decision.ts";
import { AutomationStudioLlmProviderEndpointLoad, automationStudioLlmProviderEndpointLoad } from "./endpoint-load.ts";
import { automationStudioLlmProviderRetryHintMs } from "./hint.ts";
import { AutomationStudioLlmProviderRetryLedger, automationStudioLlmProviderRetryRunLedger } from "./ledger.ts";
import { ModelProviderAttempt } from "./attempt.ts";

export type AutomationStudioLlmProviderCallOutcome = {
  /** Every attempt this call made, and why it stopped. Always present, answered or not. */
  retry: AutomationStudioLlmProviderRetryAccount;
} & (
  | { ok: true; result: unknown }
  | { ok: false; failure: ReturnType<typeof normalizedAutomationStudioLlmProviderFailure> }
);

type AutomationStudioLlmProviderCallInput<Request extends ModelRequest> = {
  provider: ModelProvider<Request>;
  request: Request;
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
  /** Where calls in flight per endpoint are counted, so a backoff is spread only when the endpoint is shared (`./endpoint-load.ts`). Absent means Core's own. */
  endpoints?: AutomationStudioLlmProviderEndpointLoad;
  /** The draw a shared endpoint's backoff is spread by, in [0, 1). Absent means `Math.random`; a test passes a fixed one. */
  random?: () => number;
};

export async function automationStudioLlmProviderCall<Request extends ModelRequest>(input: AutomationStudioLlmProviderCallInput<Request>, execution?: ModelExecutionOptions): Promise<AutomationStudioLlmProviderCallOutcome> {
  const endpoints = input.endpoints ?? automationStudioLlmProviderEndpointLoad;
  const endpoint = AutomationStudioLlmProviderEndpointLoad.key(input.provider.metadata ?? { provider: "" });
  const enter = endpoints.enter;
  const sharing = endpoints.shared;
  const leave = invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: endpoints, callback: enter, args: [endpoint] });
  const shared = () => invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: endpoints, callback: sharing, args: [endpoint] });
  try {
    return await callWithRetries(input, shared, execution);
  } finally {
    try {
      if (ExecutionCallbackPolicies.isPure(undefined, leave)) leave();
      else invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: undefined, callback: leave, args: [] });
    }
    finally { await flushObservedExecutionCallbacks(execution?.observation); }
  }
}

/** The call's attempts; `shared` says, at each decision, whether another call is in flight against the same endpoint. */
async function callWithRetries<Request extends ModelRequest>(input: AutomationStudioLlmProviderCallInput<Request>, shared: () => boolean, execution?: ModelExecutionOptions): Promise<AutomationStudioLlmProviderCallOutcome> {
  const originalNow = input.now;
  const now = () => invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: input, callback: originalNow, args: [] });
  ExecutionCallbackPolicies.rememberLexical(now, "pure");
  const originalRandom = input.random ?? ModelExecutionDefaults.random;
  const random = () => invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: undefined, callback: originalRandom, args: [] });
  const ledger = input.ledger ?? automationStudioLlmProviderRetryRunLedger;
  const originalAdded = ledger.addedMs;
  const originalSpend = ledger.spend;
  const spent = (runId: string) => invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: ledger, callback: originalAdded, args: [runId] });
  const charge = (milliseconds: number) => {
    if (input.runId !== undefined) invokeOwnedExecutionCallbackSync(execution?.observation, { receiver: ledger, callback: originalSpend, args: [input.runId, milliseconds] });
    return Math.max(0, Math.round(milliseconds));
  };
  const originalWait = input.wait ?? ModelExecutionDefaults.wait;
  const callback = input.provider.runTask;
  const provider = input.provider;
  const request = input.request;
  const startedAt = now();
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
    const attemptStartedAt = now();
    const actual = new ModelProviderAttempt(provider, callback, request, input.signal, execution);
    try {
      const result = await actual.run();
      // A retried attempt's own duration is part of what retrying added, whether
      // it answered or not: it is time the call would not have spent had the
      // first attempt succeeded.
      if (attempt > 1) addedMs += charge(elapsedSince(attemptStartedAt, now));
      return { ok: true, result, retry: account("answered") };
    } catch (error) {
      const failure = normalizedAutomationStudioLlmProviderFailure(error);
      const elapsedMs = elapsedSince(attemptStartedAt, now);
      if (attempt > 1) addedMs += charge(elapsedMs);
      if (!actual.retryAllowed()) {
        attempts.push(failedAttempt({ attempt, failure, elapsedMs, waitMs: 0 }));
        return { ok: false, failure, retry: account("outcome_unknown") };
      }
      const hintedWaitMs = automationStudioLlmProviderRetryHintMs(error, now());
      const decision = automationStudioLlmProviderRetryDecision({
        retryable: failure.retryable,
        code: failure.code,
        cancelled: input.signal?.aborted === true,
        attempt,
        elapsedMs: elapsedSince(startedAt, now),
        timeoutMs: input.request.timeoutMs,
        runAddedMs: input.runId ? spent(input.runId) : 0,
        ...(Number.isFinite(maxAttempts) ? { maxAttempts } : {}),
        ...(hintedWaitMs !== undefined ? { hintedWaitMs } : {}),
        // Spread only when other calls share the endpoint; alone, the table's wait exactly (`./limits.ts`).
        ...(shared() ? { jitter: random() } : {})
      });
      if (!decision.retry) {
        attempts.push(failedAttempt({ attempt, failure, elapsedMs, waitMs: 0 }));
        return { ok: false, failure, retry: account(decision.stop) };
      }
      attempts.push(failedAttempt({ attempt, failure, elapsedMs, waitMs: decision.waitMs, waitSource: decision.waitSource }));
      waitedMs += decision.waitMs;
      addedMs += charge(decision.waitMs);
      const waiting = await prepareObservedExecutionCallback(execution?.observation, { receiver: undefined, callback: originalWait, args: [decision.waitMs, input.signal] });
      await waiting.invoke();
      if (execution?.observation && waiting.completion() !== "settled") {
        waiting.unknown();
        await waiting.flush();
        return { ok: false, failure, retry: account("outcome_unknown") };
      }
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

function elapsedSince(from: number, now: () => number): number {
  return Math.max(0, now() - from);
}
