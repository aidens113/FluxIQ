// What the retry policy decides, and what it refuses to decide.
//
// The decision is pure, so these are the bounds themselves: a temporary fault is
// asked again, a deterministic refusal never is, a provider's own `Retry-After`
// is honoured up to a ceiling, and each of the three stated bounds -- attempts,
// this call's wall clock, the run's whole allowance -- stops the loop under its
// own name rather than by the loop quietly running out.

import { describe, expect, it } from "vitest";
import { automationStudioLlmProviderRetryDecision } from "../decision.ts";
import { automationStudioLlmProviderRetryHintMs } from "../hint.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../ledger.ts";
import { AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS } from "../limits.ts";

const LIMITS = AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS;

function decide(input: Partial<Parameters<typeof automationStudioLlmProviderRetryDecision>[0]>) {
  return automationStudioLlmProviderRetryDecision({
    retryable: true,
    cancelled: false,
    attempt: 1,
    elapsedMs: 0,
    timeoutMs: 20_000,
    runAddedMs: 0,
    ...input
  });
}

describe("whether the provider is asked again", () => {
  it("asks again for a fault the adapter called temporary, and waits the backoff", () => {
    expect(decide({ attempt: 1 })).toEqual({ retry: true, waitMs: LIMITS.backoffMs[0], waitSource: "backoff" });
    expect(decide({ attempt: 2 })).toEqual({ retry: true, waitMs: LIMITS.backoffMs[1], waitSource: "backoff" });
  });

  it("never asks again for a deterministic refusal, whatever else is available", () => {
    // A 400 the provider explained, an authentication failure, a malformed
    // request of our own making. The adapter's flag is the discriminator and
    // this function derives nothing of its own from the status.
    expect(decide({ retryable: false, attempt: 1, elapsedMs: 0, runAddedMs: 0 })).toEqual({ retry: false, stop: "not_retryable" });
  });

  it("never asks again for Core's own deadline, because the loop above already does", () => {
    // `llm.provider_timeout` is `retryable: true` and is still not asked again
    // here: the evidence loop re-asks a decision that ran past its deadline on
    // its next iteration, with the evidence advanced, and re-sending the
    // identical request inside the call duplicated that -- five provider requests
    // became eleven in `runtime/tests/deepseek-recovery-requests.test.ts`.
    expect(decide({ retryable: true, code: "llm.provider_timeout" })).toEqual({ retry: false, stop: "not_retryable" });
    // Every other temporary fault is: for those, something answered.
    expect(decide({ retryable: true, code: "llm.provider_rate_limited" })).toMatchObject({ retry: true });
    expect(decide({ retryable: true, code: "llm.provider_http_error" })).toMatchObject({ retry: true });
    expect(decide({ retryable: true, code: "llm.provider_network_error" })).toMatchObject({ retry: true });
  });

  it("stops on cancellation before it looks at the fault at all", () => {
    // A parent signal that timed out surfaces as `llm.provider_timeout`, which
    // the adapter calls temporary. Retrying it would spend another deadline
    // against a clock that has already run out.
    expect(decide({ cancelled: true, retryable: true })).toEqual({ retry: false, stop: "cancelled" });
  });

  it("stops when the attempts are spent, and a caller may ask for fewer but never more", () => {
    expect(decide({ attempt: LIMITS.maxAttempts })).toEqual({ retry: false, stop: "attempts_exhausted" });
    expect(decide({ attempt: 1, maxAttempts: 1 })).toEqual({ retry: false, stop: "attempts_exhausted" });
    expect(decide({ attempt: LIMITS.maxAttempts, maxAttempts: 99 })).toEqual({ retry: false, stop: "attempts_exhausted" });
  });

  it("names the bound that stopped it: this call's wall clock, then the run's allowance", () => {
    // The projection counts the next attempt's own deadline before it runs, so
    // the stated ceiling is the whole call's rather than the point past which one
    // more unbounded attempt begins.
    const slow = decide({ attempt: 1, elapsedMs: LIMITS.maxCallMs - 20_000, timeoutMs: 20_000 });
    expect(slow).toEqual({ retry: false, stop: "call_deadline" });
    const spentRun = decide({ attempt: 1, runAddedMs: LIMITS.maxRunAddedMs - 20_000, timeoutMs: 20_000 });
    expect(spentRun).toEqual({ retry: false, stop: "run_allowance" });
  });

  it("honours a longer wait the provider asked for, and holds it to the ceiling", () => {
    expect(decide({ hintedWaitMs: 2_500 })).toEqual({ retry: true, waitMs: 2_500, waitSource: "provider_hint" });
    // A provider asking for a minute is asking for something a waiting person
    // cannot give. Clamped rather than discarded: waiting longer than the table
    // is the cooperative behaviour, and the clock stays Core's.
    expect(decide({ hintedWaitMs: 60_000 })).toEqual({ retry: true, waitMs: LIMITS.maxWaitMs, waitSource: "provider_hint" });
    // A hint shorter than the table does not shorten the table.
    expect(decide({ attempt: 2, hintedWaitMs: 10 })).toEqual({ retry: true, waitMs: LIMITS.backoffMs[1], waitSource: "backoff" });
  });
});

describe("the wait a provider asked for", () => {
  it("reads Retry-After as seconds, as milliseconds, and as an instant", () => {
    expect(automationStudioLlmProviderRetryHintMs({ retryAfter: "2" }, 0)).toBe(2_000);
    expect(automationStudioLlmProviderRetryHintMs({ retryAfter: 1.5 }, 0)).toBe(1_500);
    expect(automationStudioLlmProviderRetryHintMs({ retryAfterMs: 400 }, 0)).toBe(400);
    expect(automationStudioLlmProviderRetryHintMs({ retryAfter: new Date(5_000).toUTCString() }, 1_000)).toBe(4_000);
  });

  it("reads it out of a headers bag, whether the bag answers get or by key", () => {
    expect(automationStudioLlmProviderRetryHintMs({ headers: new Headers({ "retry-after": "3" }) }, 0)).toBe(3_000);
    expect(automationStudioLlmProviderRetryHintMs({ response: { headers: { "retry-after": "4" } } }, 0)).toBe(4_000);
    // Where a refusal record grows the field, it is read there too. Core's
    // DeepSeek adapter does not carry it yet: `../refusal-record.ts` holds the
    // status, the media type, the body's size and the error object, and headers
    // are not among them.
    expect(automationStudioLlmProviderRetryHintMs({ refusal: { status: 429, retryAfterMs: 1_200 } }, 0)).toBe(1_200);
  });

  it("answers nothing for a failure that asked for nothing, so the table decides", () => {
    expect(automationStudioLlmProviderRetryHintMs({ status: 429 }, 0)).toBeUndefined();
    expect(automationStudioLlmProviderRetryHintMs({ retryAfter: "soon" }, 0)).toBeUndefined();
    expect(automationStudioLlmProviderRetryHintMs({ retryAfter: -5 }, 0)).toBeUndefined();
    expect(automationStudioLlmProviderRetryHintMs(undefined, 0)).toBeUndefined();
  });
});

describe("the run's retry allowance", () => {
  it("adds up every wait and every retried attempt in the run, not just in one call", () => {
    const ledger = new AutomationStudioLlmProviderRetryLedger();
    ledger.spend("run.one", 1_000);
    ledger.spend("run.one", 2_500);
    ledger.spend("run.two", 400);

    expect(ledger.addedMs("run.one")).toBe(3_500);
    expect(ledger.addedMs("run.two")).toBe(400);
    // A run nothing has been charged to has spent nothing -- an answer, not an
    // absence.
    expect(ledger.addedMs("run.unknown")).toBe(0);
  });

  it("keeps a bounded number of runs and evicts the least recently charged", () => {
    const ledger = new AutomationStudioLlmProviderRetryLedger();
    for (let index = 0; index < LIMITS.ledgerRuns; index += 1) ledger.spend(`run.${index}`, 100);
    // Touching the oldest makes it the newest, so the next eviction takes the
    // one after it instead.
    ledger.spend("run.0", 100);
    ledger.spend("run.overflow", 100);

    expect(ledger.addedMs("run.0")).toBe(200);
    expect(ledger.addedMs("run.1")).toBe(0);
    expect(ledger.addedMs("run.overflow")).toBe(100);
  });
});
