// The keep-going table: every loop failure code, the order of the rules, and
// the rule that nothing unknown ever ends a task.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurseRefused } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/evidence-loop/index.ts";
import { AutomationStudioLlmProviderError } from "../../../models/failures/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_BACKOFF, AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS, automationStudioAnswerFirstBackoff, automationStudioAnswerFirstNext, type AutomationStudioAnswerFirstRoundEnd } from "../index.ts";

const failed = (code: string, extra: Record<string, unknown> = {}): AutomationStudioAnswerFirstRoundEnd => ({
  kind: "loop",
  result: { ok: false, code, trace: [], steps: [], accounting: {}, ...extra } as unknown as AutomationStudioLlmEvidenceLoopResult
});
const base = { aborted: false, purseRefused: false, achieved: false, backoffs: 0 };
const refusal = { code: "llm_budget.run_cost_limit", estimatedInputTokens: 1, maxOutputTokens: 1, spentUsd: 0, pendingUsd: 0, ceilingUsd: 1 } as const;

describe("every loop failure code", () => {
  const codes = Object.keys(AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS) as AutomationStudioLlmEvidenceLoopFailureCode[];
  it("names all twelve", () => expect(codes).toHaveLength(12));
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
    for (const error of [new Error("boom"), "text", undefined, new AutomationStudioLlmProviderError("llm.provider_auth_failed", "no", false, 401), new AutomationStudioLlmProviderError("llm.provider_http_error", "bad", false, 400)]) {
      const next = automationStudioAnswerFirstNext({ ...base, end: { kind: "thrown", error } });
      expect(next.kind).toBe("fresh_round");
      expect(JSON.stringify(next)).not.toContain("boom");
    }
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
