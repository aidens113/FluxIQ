// The keep-going table: every loop failure code, the order of the rules, and
// the rule that nothing unknown ever ends a task.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurseRefused } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/evidence-loop/index.ts";
import { AutomationStudioLlmProviderError } from "../../../models/failures/index.ts";
import { flowBootstrapHarnessFailure } from "../../../flow-authoring/bootstrap/generation-failure/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF, AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS, automationStudioAnswerFirstBackoff, automationStudioAnswerFirstNext, automationStudioAnswerFirstRefusedRequest, automationStudioAnswerFirstThrownKind, type AutomationStudioAnswerFirstRoundEnd } from "../index.ts";

const failed = (code: string, extra: Record<string, unknown> = {}): AutomationStudioAnswerFirstRoundEnd => ({
  kind: "loop",
  result: { ok: false, code, trace: [], steps: [], accounting: {}, ...extra } as unknown as AutomationStudioLlmEvidenceLoopResult
});
const base = { aborted: false, purseRefused: false, achieved: false, backoffs: 0 };
const refusal = { code: "llm_budget.run_cost_limit", estimatedInputTokens: 1, maxOutputTokens: 1, spentUsd: 0, pendingUsd: 0, ceilingUsd: 1 } as const;

describe("every loop failure code", () => {
  const codes = Object.keys(AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS) as AutomationStudioLlmEvidenceLoopFailureCode[];
  // Eleven since t1056 removed `llm_evidence_loop.unreadable_replies`: a billed unreadable reply is asked again.
  it("names all eleven", () => expect(codes).toHaveLength(11));
  for (const code of codes.filter((c) => c !== "llm_evidence_loop.provider_unavailable")) {
    it(`${code} starts a fresh round that carries the page, draft and acts over`, () => {
      const next = automationStudioAnswerFirstNext({ ...base, end: failed(code) });
      expect(next.kind).toBe("fresh_round");
      if (next.kind !== "fresh_round") return;
      expect(next.why).toContain(AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS[code]);
      expect(next.note).toMatchObject({ carriedOver: expect.arrayContaining(["page", "draft", "acts"]) });
    });
  }
  it("llm_evidence_loop.provider_unavailable waits and costs nothing", () => {
    const next = automationStudioAnswerFirstNext({ ...base, end: failed("llm_evidence_loop.provider_unavailable", { providerUnavailable: { inARow: 5, codes: ["llm.provider_timeout"], said: "x", replied: false } }) });
    expect(next).toMatchObject({ kind: "backoff", waitMs: 5_000 });
  });
});

describe("order", () => {
  it("a person's Stop beats everything", () => {
    const next = automationStudioAnswerFirstNext({ end: failed("llm_evidence_loop.tool_failed"), aborted: true, purseRefused: true, achieved: true, backoffs: 3 });
    expect(next).toEqual({ kind: "stopped" });
  });
  it("an achieved round beats a purse refusal", () => {
    expect(automationStudioAnswerFirstNext({ ...base, end: failed("llm_evidence_loop.tool_failed"), achieved: true, purseRefused: true })).toEqual({ kind: "achieved" });
  });
  it("the purse beats a silent provider", () => {
    expect(automationStudioAnswerFirstNext({ ...base, purseRefused: true, end: failed("llm_evidence_loop.provider_unavailable") })).toEqual({ kind: "budget_out", why: "purse" });
    expect(automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error: new AutomationStudioLlmBuildPurseRefused(refusal) } })).toEqual({ kind: "budget_out", why: "purse" });
  });
  it("an empty balance is a budget gone, not a silence", () => {
    const loop = failed("llm_evidence_loop.provider_unavailable", { providerUnavailable: { inARow: 1, codes: ["llm.provider_balance_exhausted"], said: "x", replied: true } });
    expect(automationStudioAnswerFirstNext({ ...base, end: loop })).toEqual({ kind: "budget_out", why: "empty_balance" });
    const thrown = new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "empty", false, 402);
    expect(automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error: thrown } })).toEqual({ kind: "budget_out", why: "empty_balance" });
  });
});

describe("thrown", () => {
  it("a silent provider error waits", () => {
    for (const [code, status] of [["llm.provider_timeout"], ["llm.provider_network_error"], ["llm.provider_rate_limited", 429], ["llm.provider_http_error", 503]] as const) {
      const error = new AutomationStudioLlmProviderError(code, "silent", true, status);
      expect(automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error } }).kind).toBe("backoff");
    }
  });
  it("an unknown error, a string and a rejected key are a fresh round, never an ending", () => {
    for (const error of [new Error("boom"), "text", undefined, new AutomationStudioLlmProviderError("llm.provider_auth_failed", "no", false, 401)]) {
      const next = automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error } });
      expect(next.kind).toBe("fresh_round");
      expect(JSON.stringify(next)).not.toContain("boom");
    }
  });
});

// t1100: the panel's replay read a 400 as silence and waited 5, 10, 20 and 40 seconds, asking the identical request again.
describe("a request the provider refused", () => {
  const message = "tools.8.custom: For 'object' type, 'additionalProperties' must be explicitly set to false";
  const record = { status: 400, contentType: "application/json", bodyBytes: 160, error: { code: null, type: "invalid_request_error", param: null, message }, withheld: [], request: null };
  const refusedError = (status = 400) => new AutomationStudioLlmProviderError("llm.provider_http_error", "Anthropic refused the request.", false, status, undefined, undefined, { ...record, status });

  it("is a refusal in the provider's words and never waited on, however many waits came before", () => {
    for (const backoffs of [0, 3]) {
      const next = automationStudioAnswerFirstNext({ ...base, backoffs, end: { kind: "thrown", error: refusedError() } });
      expect(next).toEqual({ kind: "refused", why: `the model provider refused the request: ${message}` });
      expect(JSON.stringify(next)).not.toContain("not answering");
    }
    expect(automationStudioAnswerFirstThrownKind(refusedError())).toBe("refused");
  });

  it("is a refusal without a record too, read by its status", () => {
    const next = automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error: new AutomationStudioLlmProviderError("llm.provider_http_error", "bad", false, 400) } });
    expect(next).toEqual({ kind: "refused", why: "the model provider refused the request" });
  });

  it("read from a build failure projected from the refusal", () => {
    const projected = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_http_error", message: "Anthropic refused the request.", metadata: { retryable: false, providerStatus: 400 } }],
      request: {
        requestId: "llm.evidence_tool_decision.1",
        idempotencyKey: "idempotency.one",
        taskKind: "flow_bootstrap",
        promptVersion: "automation-studio.flow-bootstrap.v1",
        expectedOutput: "flow_bootstrap",
        context: { schemaVersion: "0.1", taskKind: "flow_bootstrap", promptVersion: "automation-studio.flow-bootstrap.v1", projectId: "project.one", flowId: "flow.one", instructions: { instructionIds: [], instructions: [], diagnostics: [], tokenBudget: 384, estimatedTokens: 0 } },
        tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 },
        estimatedInputTokens: 10,
        maxEstimatedCostUsd: 0.25,
        timeoutMs: 20_000
      },
      provider: { provider: "anthropic", model: "claude-haiku-5-5" },
      providerInvocation: "attempted",
      providerRefusal: record
    });
    expect(automationStudioAnswerFirstRefusedRequest(projected)).toEqual({ words: `the model provider refused the request: ${message}` });
    expect(automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error: projected } }).kind).toBe("refused");
  });

  it("keeps silence apart: a server error, a rate limit and a request timeout still wait, with their words", () => {
    for (const error of [refusedError(503), new AutomationStudioLlmProviderError("llm.provider_rate_limited", "busy", true, 429), new AutomationStudioLlmProviderError("llm.provider_timeout", "slow", true)]) {
      const next = automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error } });
      expect(next).toMatchObject({ kind: "backoff", say: expect.stringContaining("The model service is not answering") });
    }
    expect(automationStudioAnswerFirstRefusedRequest(refusedError(408))).toBeUndefined();
    expect(automationStudioAnswerFirstRefusedRequest(refusedError(429))).toBeUndefined();
  });

  it("is no budget gone and no Stop: an empty balance and a Stop still come first", () => {
    expect(automationStudioAnswerFirstNext({ ...base, aborted: true, end: { kind: "thrown", error: refusedError() } })).toEqual({ kind: "stopped" });
    expect(automationStudioAnswerFirstNext({ ...base, purseRefused: true, end: { kind: "thrown", error: refusedError() } })).toEqual({ kind: "budget_out", why: "purse" });
    expect(automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error: new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "empty", false, 400) } })).toEqual({ kind: "budget_out", why: "empty_balance" });
  });
  it("an unknown loop code is a fresh round", () => {
    expect(automationStudioAnswerFirstNext({ ...base, end: failed("llm_evidence_loop.made_up_later") }).kind).toBe("fresh_round");
  });
  it("a loop that returned ok without achieving is a fresh round", () => {
    const end = { kind: "loop", result: { ok: true, result: {}, trace: [], steps: [], accounting: {} } } as unknown as AutomationStudioAnswerFirstRoundEnd;
    expect(automationStudioAnswerFirstNext({ ...base, end }).kind).toBe("fresh_round");
  });
});

describe("backoff", () => {
  it("grows from 5 s to a 60 s cap and never runs out", () => {
    const waits = [0, 1, 2, 3, 4, 5, 6, 50, 5_000, 1e9].map((n) => automationStudioAnswerFirstBackoff(n).waitMs);
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000]);
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF.capMs).toBe(60_000);
  });
  it("says one plain sentence about waiting and Stop", () => {
    const { say } = automationStudioAnswerFirstBackoff(2);
    expect(say).toBe("The model service is not answering, so I am waiting 20 seconds and then asking again; Stop works at any time.");
  });
  it("treats nonsense counts as the first wait", () => {
    expect(automationStudioAnswerFirstBackoff(Number.NaN).waitMs).toBe(5_000);
    expect(automationStudioAnswerFirstBackoff(-4).waitMs).toBe(5_000);
  });
});
