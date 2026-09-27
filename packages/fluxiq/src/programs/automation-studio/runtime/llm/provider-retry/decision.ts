// Whether to ask the provider again, and how long to wait first.
//
// **The adapter's own verdict is the discriminator, and nothing here re-derives
// it.** `deepseek/provider.ts` already decides: 429 is temporary, 5xx is
// temporary, a request timeout and a network boundary failure are temporary,
// 401 and 403 are not, a 4xx the provider explained is not, and a refusal made
// before the request left the process is not. That table was correct and unread
// for as long as it existed; duplicating it here would make two answers to one
// question and guarantee they drift. What this function adds is the bounds --
// how many times, how long, and whether the run can still afford it -- and one
// named exception, `NEVER_ASKED_AGAIN`, which is a statement about who re-asks
// rather than about whether the fault was temporary.
//
// The order of the checks is deliberate. Cancellation comes before
// retryability, because a run whose deadline has passed must stop even though
// the fault it just met was temporary: the harness reports a parent timeout as
// `llm.provider_timeout`, which is `retryable: true` and would otherwise earn
// another 25 seconds against a clock that has already run out.
import { AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS } from "./limits.ts";
import type { AutomationStudioLlmProviderRetryStop } from "./account.ts";

/**
 * The one temporary fault this policy deliberately does not ask again, and why.
 *
 * `llm.provider_timeout` is **Core's own deadline elapsing**, not the provider
 * refusing anything, and three things follow. The request may still be in flight
 * -- its provenance is `providerInvocation: "unknown"` -- so a re-send is a
 * second paid request for a question whose first answer is not known to have
 * failed. It is the most expensive fault to repeat: another whole deadline, 25
 * seconds in the Lab, while a person waits. And **the loop above already re-asks
 * it**: `../evidence-loop.ts` treats a decision that ran past its deadline as a
 * decision to make again on the next iteration, with the evidence advanced --
 * which is better than re-sending the identical request, and is already counted
 * and recorded as a step.
 *
 * Measured rather than assumed. Retrying it inside the call made
 * `runtime/tests/deepseek-bootstrap-exploration.test.ts`'s "asks again after a
 * decision that runs past its deadline" fail, and turned five provider requests
 * into eleven in `deepseek-recovery-requests.test.ts`: the inner retry was
 * duplicating the outer one and spending the person's wall clock on it.
 *
 * Every other fault the adapter calls temporary is asked again -- a 429, a 5xx, a
 * dropped connection -- because for those something already answered, and what it
 * answered was "not this time".
 */
const NEVER_ASKED_AGAIN: ReadonlySet<string> = new Set(["llm.provider_timeout"]);

export type AutomationStudioLlmProviderRetryDecision =
  | { retry: true; waitMs: number; waitSource: "backoff" | "provider_hint" }
  | { retry: false; stop: AutomationStudioLlmProviderRetryStop };

export function automationStudioLlmProviderRetryDecision(input: {
  /** The adapter's verdict on the fault that just happened. Trusted, never re-derived. */
  retryable: boolean;
  /** The fault's own code, for the one documented exception to that verdict (`NEVER_ASKED_AGAIN`). */
  code?: string;
  /** Whether the caller's own signal has been aborted -- the run's deadline, or a person cancelling. */
  cancelled: boolean;
  /** Which attempt just failed, counting the first as 1. */
  attempt: number;
  /** How many attempts this call may make in total. Held to the limit either way. */
  maxAttempts?: number;
  /** Wall clock since the call's first attempt started. */
  elapsedMs: number;
  /** The deadline the next attempt would run under, so the projection knows what it is asking for. */
  timeoutMs: number;
  /** What retrying has already added across this whole run. */
  runAddedMs: number;
  /** The wait the provider itself asked for, already read from its answer (`hint.ts`). */
  hintedWaitMs?: number;
}): AutomationStudioLlmProviderRetryDecision {
  const limits = AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS;
  if (input.cancelled) return { retry: false, stop: "cancelled" };
  if (!input.retryable || (input.code !== undefined && NEVER_ASKED_AGAIN.has(input.code))) return { retry: false, stop: "not_retryable" };
  const maxAttempts = Math.min(limits.maxAttempts, Math.max(1, Math.trunc(input.maxAttempts ?? limits.maxAttempts)));
  if (input.attempt >= maxAttempts) return { retry: false, stop: "attempts_exhausted" };
  const backoffMs = limits.backoffMs[Math.min(input.attempt, limits.backoffMs.length) - 1] ?? limits.backoffMs[limits.backoffMs.length - 1] ?? 0;
  const hintedWaitMs = positive(input.hintedWaitMs);
  const waitMs = Math.min(limits.maxWaitMs, Math.max(backoffMs, hintedWaitMs));
  // Projected, not spent: the attempt's own deadline is counted before it runs,
  // so the stated ceiling is the whole call's rather than the point past which
  // one more unbounded attempt begins.
  const projectedMs = positive(input.timeoutMs) + waitMs;
  if (positive(input.elapsedMs) + projectedMs > limits.maxCallMs) return { retry: false, stop: "call_deadline" };
  if (positive(input.runAddedMs) + projectedMs > limits.maxRunAddedMs) return { retry: false, stop: "run_allowance" };
  // A hint longer than the table is the provider knowing something the table
  // does not; a shorter one is not, so the table still holds the floor.
  return { retry: true, waitMs, waitSource: hintedWaitMs > backoffMs ? "provider_hint" : "backoff" };
}

function positive(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
