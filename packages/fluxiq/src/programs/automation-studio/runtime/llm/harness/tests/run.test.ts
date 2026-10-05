// What the harness says about a call it made, and about one it never made.
//
// Two live runs -- `run-muhs8hx3-6fd929e6` and `run-muhtuizo-c458e49c` -- were
// recorded as an attempted provider request whose answer was unknown, with the
// provider and the model named, no usage, no status, and a duration seven times
// the per-call deadline. They were read for a day as DeepSeek rejecting our
// request. No request had been made: the run's budget refused the reservation,
// and the harness returned the provider it *would* have called, which is what
// the projection downstream reads as "a request happened".
//
// So these tests are about one property: every result the harness returns says,
// as a fact and not as an inference from an absence, whether a request reached
// the provider -- and where one did and was refused, it carries what the
// provider said about it.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../build-purse/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "../../run-budget.ts";
import type { AutomationStudioLlmProvider } from "../provider.ts";
import { runAutomationStudioLlmHarness } from "../run.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmTaskResult } from "../task-request.ts";

const ANSWER = { response: { kind: "diagnosis", summary: "The control moved." } };
/** An instruction whose body must never appear in anything a refusal carries. */
const PRIVATE_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1",
  instructionId: "instruction.private",
  scope: { kind: "flow", projectId: "project.llm", flowId: "flow.checkout" },
  title: "Checkout",
  body: "PRIVATE_INSTRUCTION_BODY",
  priority: 1,
  status: "active",
  requirement: "advisory",
  createdAt: 1,
  updatedAt: 1
};

describe("what the harness claims about reaching the provider", () => {
  it("says no request was made when the run's budget refuses the reservation, and names no provider", async () => {
    const budget = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 1, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1 });
    let asked = 0;
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "deepseek", model: "deepseek-flash" },
      runTask: async () => { asked += 1; return ANSWER; }
    };
    const answered = await harness({ provider, runBudget: budget, requestId: "request.first" });
    const refused = await harness({ provider, runBudget: budget, requestId: "request.second" });

    expect(answered.providerInvocation).toBe("attempted");
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.run_call_limit");
    // The fact, stated. The three absences below cannot carry it: each one is
    // equally consistent with a call that failed.
    expect(refused.providerInvocation).toBe("not_attempted");
    expect(refused.provider).toBeUndefined();
    expect(refused.providerRefusal).toBeUndefined();
    expect(refused.usage).toBeUndefined();
    // Nor may the intervention name a provider the run never spoke to.
    expect(refused.intervention.provider).toBeUndefined();
    expect(refused.intervention.model).toBeUndefined();
    expect(asked).toBe(1);
  });

  it("says no request was made for a dry run, for a missing provider, and for a refusal it makes itself", async () => {
    const dryRun = await harness({ dryRun: true });
    const unconfigured = await harness({});
    const overBudget = await harness({
      provider: { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => ANSWER },
      tokenLimits: { maxInputTokens: 1, maxOutputTokens: 1, maxTotalTokens: 2 }
    });

    expect(dryRun.providerInvocation).toBe("not_attempted");
    expect(unconfigured.providerInvocation).toBe("not_attempted");
    expect(unconfigured.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_missing");
    expect(overBudget.providerInvocation).toBe("not_attempted");
    expect(overBudget.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.input_limit_exceeded");
  });

  it("takes how far a failed call got from the failure's own provenance, never from a guess", async () => {
    const timedOut = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new AutomationStudioLlmProviderError("llm.provider_timeout", "private transport detail", true); }
      }
    });
    const refusedBeforeSending = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new AutomationStudioLlmProviderError("llm.provider_request_identity_invalid", "private check detail"); }
      }
    });
    const answeredBadly = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new AutomationStudioLlmProviderError("llm.provider_http_error", "private upstream body", false, 400); }
      }
    });

    // A deadline cannot say whether the request was in flight, and does not
    // pretend to.
    expect(timedOut.providerInvocation).toBe("unknown");
    // The adapter ran, and refused before sending anything. "The provider was
    // invoked" and "a request reached the provider" are different claims.
    expect(refusedBeforeSending.providerInvocation).toBe("not_attempted");
    expect(answeredBadly.providerInvocation).toBe("attempted");
    // The diagnostic's own metadata is untouched by any of this.
    expect(answeredBadly.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "llm.provider_http_error", message: "The LLM provider returned an unsuccessful HTTP status.", metadata: { retryable: false, providerStatus: 400 } })
    ]));
  });

  it("carries the screened refusal the provider answered with, typed, beside the failure", async () => {
    const result = await harness({
      instructions: [PRIVATE_INSTRUCTION],
      provider: deepSeek(() => new Response(
        JSON.stringify({ error: { message: "Invalid value for 'max_tokens': must be at most 8192", type: "invalid_request_error", param: "max_tokens", code: "invalid_value" } }),
        { status: 400, headers: { "content-type": "application/json" } }
      ))
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm.provider_http_error");
    expect(result.providerInvocation).toBe("attempted");
    expect(result.providerRefusal).toMatchObject({
      status: 400,
      contentType: "application/json",
      error: { code: "invalid_value", type: "invalid_request_error", param: "max_tokens", message: "Invalid value for 'max_tokens': must be at most 8192" },
      withheld: []
    });
    // The request's shape travels with it: this is the half that says what was
    // refused, and the request-id pair is the only place a duplicated call shows.
    expect(result.providerRefusal?.request).toMatchObject({ model: "deepseek-flash", taskKind: "runtime_diagnosis", requestId: "request.refused", responseFormat: "json_object" });
    // And none of the request's content: a refusal says how large each message
    // was, never what was in it.
    expect(JSON.stringify(result.providerRefusal)).not.toContain("PRIVATE_INSTRUCTION_BODY");
  });

  it("reads no refusal from a foreign object that claims one", async () => {
    const claimed = { status: 400, contentType: "application/json", bodyBytes: 12, error: { code: "invalid_value", type: null, param: null, message: "cloned claim" }, withheld: [], request: {} };
    const result = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw { code: "llm.provider_http_error", retryable: false, status: 400, message: "private upstream body", responseBody: JSON.stringify(claimed), refusal: claimed }; }
      }
    });

    // The code, the status and the retryability of a structurally typed clone
    // are read because each is checked against Core's own vocabulary. A refusal
    // record cannot be checked that way -- what makes one publishable is the
    // screen the adapter ran -- so a clone's claim is not read.
    expect(result.providerInvocation).toBe("attempted");
    expect(result.providerRefusal).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/cloned claim|private upstream body/);
  });

  it("says a call was made, and by whom, when one answers", async () => {
    const result = await harness({ provider: { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => ANSWER } });

    expect(result.ok).toBe(true);
    expect(result.providerInvocation).toBe("attempted");
    expect(result.provider).toEqual({ provider: "deepseek", model: "deepseek-flash" });
    expect(result.providerRefusal).toBeUndefined();
  });
});

describe("what the harness claims about retrying a temporary fault", () => {
  it("absorbs a rate limit, counts one call against the run's budget, and says what it did", async () => {
    const budget = runBudget(2);
    const provider = rateLimitedUntil(2);
    const result = await harness({ provider: provider.provider, runBudget: budget, requestId: "request.retried" });

    expect(provider.asked).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.providerInvocation).toBe("attempted");
    // One question asked of the model is one call. Counting each attempt would
    // charge the run's token and cost caps twice over for one answer, and would
    // exhaust a 48-call Lab budget in sixteen questions.
    expect(budget.snapshot("run.invocation").calls).toBe(1);
    expect(result.providerRetry).toMatchObject({ retries: 2, stop: "answered", attempts: expect.any(Array) });
    expect(result.providerRetry?.attempts.map((attempt) => [attempt.attempt, attempt.code, attempt.status])).toEqual([
      [1, "llm.provider_rate_limited", 429],
      [2, "llm.provider_rate_limited", 429]
    ]);
    // And it is on the receipt as a code, because a run that survived two rate
    // limits must be able to say so: the alternative is an unexplained gap in
    // the wall clock, which is exactly how a 167-second run was misread.
    const retried = result.diagnostics.find((diagnostic) => diagnostic.code === "llm.provider_retried");
    expect(retried?.severity).toBe("info");
    expect(retried?.metadata).toMatchObject({ stop: "answered", retries: 2 });
  });

  it("reports a fault that outlived its retries as the provider's fault, never as a budget refusal", async () => {
    const budget = runBudget(2);
    let asked = 0;
    const result = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { asked += 1; throw new AutomationStudioLlmProviderError("llm.provider_http_error", "private upstream body", true, 503); }
      },
      runBudget: budget,
      requestId: "request.exhausted"
    });

    expect(asked).toBe(3);
    expect(result.ok).toBe(false);
    // The projection that stores a failed build reads the *newest* error
    // diagnostic. Reserving per attempt would have made that a
    // `llm_budget.duplicate_request`, so a provider fault would have been
    // recorded as the run running out of money.
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    expect(errors.at(-1)?.code).toBe("llm.provider_http_error");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_budget.duplicate_request");
    expect(result.providerRetry?.stop).toBe("attempts_exhausted");
    expect(budget.snapshot("run.invocation").calls).toBe(1);
  });

  it("reports an exhausted run budget as an exhausted run budget, and asks the provider nothing", async () => {
    const budget = runBudget(1);
    const provider = rateLimitedUntil(0);
    await harness({ provider: provider.provider, runBudget: budget, requestId: "request.first" });
    const refused = await harness({ provider: provider.provider, runBudget: budget, requestId: "request.second" });

    // The one call the run was authorized, and nothing after it: a spent
    // allowance is not a fault a retry can absorb.
    expect(provider.asked).toBe(1);
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.run_call_limit");
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm.provider_retried");
    expect(refused.providerInvocation).toBe("not_attempted");
    expect(refused.providerRetry).toBeUndefined();
  });

  it("asks a 400 once, and says nothing about retrying something it never retried", async () => {
    const result = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new AutomationStudioLlmProviderError("llm.provider_http_error", "private upstream body", false, 400); }
      },
      requestId: "request.refused_deterministically"
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm.provider_retried");
    expect(result.providerRetry).toBeUndefined();
  });
});

/**
 * The harness, with the retry policy's waiting and its per-run allowance made
 * local to the call.
 *
 * A temporary fault is retried by default now (`../../provider-retry/`), so a
 * test that throws one would otherwise spend the backoff in real seconds and
 * charge a process-wide allowance the next test would inherit. The policy's own
 * arithmetic is proved in `provider-retry/tests/`; what these tests are about is
 * what the harness says once it has run.
 */
describe("what the harness says about a throw no adapter typed", () => {
  // `run-mun5e1ie-5aeefbbd`: the first call threw, the record said
  // `provider_transport_unknown` and nothing about the throw. The throw's own
  // account now rides on the failure's metadata, screened, and never on its
  // message -- the message is what an intervention's validation line prints.
  it("carries the class, the cause's code and the screened message on the failure's metadata", async () => {
    const result = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); }
      }
    });
    const failure = result.diagnostics.find((diagnostic) => diagnostic.code === "llm.provider_request_failed");

    expect(result.ok).toBe(false);
    expect(failure?.message).toBe("The LLM provider request failed before a valid response was returned.");
    expect(failure?.metadata).toEqual({
      retryable: false,
      providerThrow: { errorClass: "TypeError", causeCode: "ECONNRESET", message: "fetch failed" }
    });
    expect(JSON.stringify(result.intervention)).not.toContain("ECONNRESET");
  });

  it("drops a message that names a credential and keeps the codes", async () => {
    const result = await harness({
      provider: {
        metadata: { provider: "deepseek", model: "deepseek-flash" },
        runTask: async () => { throw new TypeError("request failed with Authorization: Bearer x", { cause: { code: "UND_ERR_SOCKET" } }); }
      }
    });

    expect(result.diagnostics.find((diagnostic) => diagnostic.code === "llm.provider_request_failed")?.metadata?.providerThrow)
      .toEqual({ errorClass: "TypeError", causeCode: "UND_ERR_SOCKET", withheld: ["message_credential_shaped"] });
    expect(JSON.stringify(result)).not.toContain("Bearer");
  });
});

// `run-munw7ffn-fe1cecd2`: 14 decisions refused as a malformed reply, with the
// code and nothing else on the record. The adapter's account of the reply
// rides on the failure's metadata, and the reply itself on nothing.
describe("what the harness says about a reply it could not read", () => {
  it("carries the malformed case, the finish reason, the length and the paid usage, and none of the content", async () => {
    const content = '{"kind":"diagnosis","summary":"PRIVATE_PAGE_TEXT';
    const result = await harness({
      provider: deepSeek(() => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content } }],
        usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 }
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === "llm.provider_malformed_response")?.metadata).toEqual({
      retryable: false,
      providerReply: { case: "content_unclosed", finishReason: "stop", contentChars: content.length, usage: { inputTokens: 900, outputTokens: 40, totalTokens: 940, estimatedCostUsd: expect.any(Number) } }
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PAGE_TEXT");
  });
});

function harness(input: Partial<AutomationStudioLlmHarnessInput>): Promise<AutomationStudioLlmTaskResult> {
  return runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: "run.invocation",
    requestId: "request.refused",
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.1,
    ...input,
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger(), ...input.providerRetry }
  });
}

function runBudget(maxCallsPerRun: number): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1 });
}

/** A provider that meets a temporary fault for its first `failures` attempts, then answers. */
function rateLimitedUntil(failures: number): { provider: AutomationStudioLlmProvider; readonly asked: number } {
  let asked = 0;
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    runTask: async () => {
      asked += 1;
      if (asked <= failures) throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "private transport detail", true, 429);
      return ANSWER;
    }
  };
  return { provider, get asked() { return asked; } };
}

/** The real adapter, answering from a stub: what it screens is what the harness carries. */
function deepSeek(response: () => Response): AutomationStudioLlmProvider {
  return createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => response()) as typeof fetch
  });
}


it("counts internal transient transport retries once under shared build call admission", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 1 });
  const provider = rateLimitedUntil(1);
  const result = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider: provider.provider, requestId: "build.retry" }));
  expect(provider.asked).toBe(2);
  expect(result.ok).toBe(true);
  expect(purse.spentCalls()).toBe(1);
  const refused = await automationStudioLlmBuildPurseScope(purse, () => harness({ provider: provider.provider, requestId: "build.next" }));
  expect(refused.providerInvocation).toBe("not_attempted");
  expect(refused.provider).toBeUndefined();
  expect(refused.diagnostics.some((diagnostic) => diagnostic.code === "llm_budget.run_call_limit")).toBe(true);
  expect(provider.asked).toBe(2);
  expect(purse.spentCalls()).toBe(1);
});


it("releases an explicit unsent adapter refusal and charges a sent malformed reply once", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 1 });
  const unsent = await automationStudioLlmBuildPurseScope(purse, () => harness({
    requestId: "build.unsent", provider: { metadata: { provider: "mock", model: "mock" }, runTask: async () => {
      throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "Synthetic preflight", false, undefined, { providerInvocation: "not_attempted", providerResponse: "not_received" });
    } }
  }));
  expect(unsent.providerInvocation).toBe("not_attempted");
  expect(purse.spentCalls()).toBe(0);
  const malformed = await automationStudioLlmBuildPurseScope(purse, () => harness({
    requestId: "build.malformed", provider: { metadata: { provider: "mock", model: "mock" }, runTask: async () => ({ response: "invalid", usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostUsd: 0.002 } }) }
  }));
  expect(malformed.ok).toBe(false);
  expect(malformed.providerInvocation).toBe("attempted");
  expect(purse.spentCalls()).toBe(1);
  expect(purse.spentUsd()).toBeCloseTo(0.002);
});
