import { describe, expect, it } from "vitest";

import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES,
  automationStudioFlowBootstrapFailureDiagnosticOf,
  flowBootstrapHarnessFailure,
  flowBootstrapPhaseFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError,
  type AutomationStudioFlowBootstrapFailureStage,
  type AutomationStudioFlowBootstrapPhaseFailureCode
} from "../index.ts";

const ACCOUNTING = { requestId: "request.round-trip", estimatedInputTokens: 100 };
const STAGES = Object.entries(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES) as Array<
  [AutomationStudioFlowBootstrapFailureStage, readonly AutomationStudioFlowBootstrapPhaseFailureCode[]]
>;
/**
 * The one code a phase failure may not use: it carries the question a person
 * answers, and only `flowBootstrapPermissionRequiredFailure` has one to put on
 * it. A phase failure asked for it gives way to its stage's default, which is
 * checked on its own below.
 */
const PERMISSION_REQUIRED = "flow_bootstrap.permission_required";
/** The endings a build that could not finish carries for the person, which only `flowBootstrapBuildEndingFailure` writes. */
const ENDINGS: readonly string[] = ["flow_bootstrap.not_doable", "flow_bootstrap.evidence_budget_exhausted", "flow_bootstrap.model_replies_unreadable", "flow_bootstrap.provider_unavailable"];
const EVERY_CODE = STAGES.flatMap(([stage, codes]) => codes.flatMap((code) => code === PERMISSION_REQUIRED || ENDINGS.includes(code) ? [] : [[stage, code] as const]));

describe("Flow Bootstrap failure diagnostics round-trip", () => {
  // **The check that was missing.** `flowBootstrapPhaseFailure` wrote a
  // provider_request failure's state from the stage and the parser read it from
  // a per-code table of its own, so three codes added to the stage by `a8cc85e`
  // came back as `null` -- which at the wrong-answer re-author is published as
  // the single word `flow_bootstrap.extend_failed`. Nothing said that a code
  // Core can produce must be a code Core can read. This does, for every one of
  // them, so the next code added to the taxonomy cannot repeat it.
  it.each(EVERY_CODE)("parses back the %s failure Core produces for %s", (stage, code) => {
    for (const accounting of [undefined, ACCOUNTING]) {
      const { diagnostic } = flowBootstrapPhaseFailure(stage, accounting, code);
      expect(diagnostic.stage).toBe(stage);
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
    }
    // With the accounting a code needs, the code itself survives. Without it,
    // a code that must carry accounting gives way to the stage's default rather
    // than publishing a record that says a call was costed and names no cost.
    expect(flowBootstrapPhaseFailure(stage, ACCOUNTING, code).diagnostic.code).toBe(code);
  });

  // A code that needs something a phase failure has no way to supply cannot be
  // used by one: the diagnostic would name a needs-permission ending with
  // nothing to ask, and would not read back. The stage's default says less and
  // is true.
  it("refuses a phase failure the code whose question it cannot ask", () => {
    const { diagnostic } = flowBootstrapPhaseFailure("provider_output_validation", ACCOUNTING, PERMISSION_REQUIRED);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_output_validation_failed");
    expect(diagnostic).not.toHaveProperty("permissionRequest");
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
    // And the code still cannot be published without one from the other side.
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, code: PERMISSION_REQUIRED })).toBeNull();
  });

  it.each(EVERY_CODE)("keeps the stage recoverable from the %s code %s alone", (stage, code) => {
    const { diagnostic } = flowBootstrapPhaseFailure(stage, ACCOUNTING, code);
    expect(diagnostic.code).toBe(code);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, stage: stage === "persistence" ? "provider_request" : "persistence" })).toBeNull();
  });

  // A refused run-budget reservation never reaches the provider. Without a name
  // of their own these six fell to the `default` arm and came out as
  // `flow_bootstrap.provider_transport_unknown` at stage `provider_request` with
  // `providerInvocation: "attempted"` -- a request attempted whose answer is
  // unknown, true of nothing that happened.
  //
  // Both halves of that are now fixed from both ends: the harness no longer hands
  // the projection provider metadata for a refusal made before the call, and the
  // projection no longer needs it to tell. The case below is the belt-and-braces
  // one -- metadata present anyway -- and it is asserted to record exactly what
  // the pre-provider branch records, because the same refusal must not be written
  // down two ways depending on which branch it arrived on.
  //
  // (`run-muhs8hx3-6fd929e6` and `run-muhtuizo-c458e49c` recorded that projection
  // and were read as this failure for a day. They were builds, a build passes no
  // run budget, and `harness-vocabulary.ts` records what they actually were.)
  it.each([
    ["llm_budget.run_call_limit", "flow_bootstrap.run_budget_calls_exhausted"],
    ["llm_budget.run_total_limit", "flow_bootstrap.run_budget_total_tokens_exhausted"],
    ["llm_budget.run_output_limit", "flow_bootstrap.run_budget_output_tokens_exhausted"],
    ["llm_budget.run_cost_limit", "flow_bootstrap.run_budget_cost_exhausted"],
    ["llm_budget.duplicate_request", "flow_bootstrap.run_budget_duplicate_request"],
    ["llm_budget.invalid_reservation", "flow_bootstrap.run_budget_reservation_invalid"]
  ] as const)("names the refused reservation %s rather than claiming a provider was reached", (code, expectedCode) => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code, message: "private budget detail" }],
      request: { requestId: "request.budget", estimatedInputTokens: 1_000 } as never,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });
    expect(failure.diagnostic).toEqual({
      code: expectedCode,
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      // The request that was never sent is the only thing the refusal is about,
      // so its accounting travels -- and nothing else does: no status and no
      // usage, because there was no call to have either, and no provider and no
      // model, because naming the provider a call would have gone to reads as the
      // provider it went to. That is what `accounting.provider` means everywhere
      // else, and what `result.provider` on the harness now means too.
      accounting: { requestId: "request.budget", estimatedInputTokens: 1_000 }
    });
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
    expect(JSON.stringify(failure)).not.toContain("private budget detail");
    // The same refusal on the branch it now actually arrives on, recorded the
    // same way. Two records for one refusal is the drift this whole chain of
    // fixes was about.
    expect(flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code, message: "private budget detail" }],
      request: { requestId: "request.budget", estimatedInputTokens: 1_000 } as never
    }).diagnostic).toEqual(failure.diagnostic);
  });

  // A harness code with no arm still becomes a provider transport failure, which
  // is the honest answer for a failure whose kind was never established -- and
  // the shape the budget refusals above were wrongly getting.
  it("still names an unrecognised harness code a transport failure of unknown answer", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "unknown",
      diagnostics: [{ severity: "error", code: "llm.something_core_has_never_seen", message: "private" }],
      request: { requestId: "request.unknown", estimatedInputTokens: 1 } as never,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });
    expect(failure.diagnostic).toMatchObject({
      code: "flow_bootstrap.provider_transport_unknown",
      stage: "provider_request",
      providerInvocation: "unknown",
      providerResponse: "unknown"
    });
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
  });

  describe("the diagnostic of any thrown value", () => {
    it("gives up the diagnostic a Flow Bootstrap failure carries", () => {
      const { diagnostic } = flowBootstrapPhaseFailure("persistence", ACCOUNTING);
      expect(automationStudioFlowBootstrapFailureDiagnosticOf(flowBootstrapPhaseFailure("persistence", ACCOUNTING), "pre_provider_validation")).toEqual(diagnostic);
    });

    // Never `null`. `null` is what the wrong-answer re-author turned into
    // `flow_bootstrap.extend_failed` -- a code belonging to no stage, that
    // nothing reads back, and that was the whole account
    // `run-muhubegx-9469de5e` left of its repair.
    it.each([
      [new Error("raw"), "provider_request", "flow_bootstrap.unexpected_error"],
      [new TypeError("raw"), "provider_request", "flow_bootstrap.internal_error"],
      [new Error("raw"), "persistence", "flow_bootstrap.persistence_failed"],
      ["a string nobody expected", "pre_provider_validation", "flow_bootstrap.pre_provider_validation_failed"],
      [undefined, "provider_resolution", "flow_bootstrap.provider_resolution_failed"]
    ] as const)("names %s thrown at %s rather than answering nothing", (thrown, stage, code) => {
      const diagnostic = automationStudioFlowBootstrapFailureDiagnosticOf(thrown, stage);
      expect(diagnostic.code).toBe(code);
      expect(diagnostic.stage).toBe(stage);
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
      expect(JSON.stringify(diagnostic)).not.toContain("raw");
    });

    it("does not let a value that fights being read replace the failure it is reporting", () => {
      const hostile = { name: "AutomationStudioFlowBootstrapGenerationError", get diagnostic(): never { throw new Error("read me and see"); } };
      expect(parseAutomationStudioFlowBootstrapGenerationError(hostile)).toBeNull();
      expect(automationStudioFlowBootstrapFailureDiagnosticOf(hostile, "provider_request").code).toBe("flow_bootstrap.provider_request_failed");
    });
  });

  // The parser reads the state from the same table the producers write it from,
  // which must not have made it a rubber stamp: a record claiming a state its
  // code does not have is still refused.
  it.each([
    ["a refused reservation claiming the provider answered", { code: "flow_bootstrap.run_budget_cost_exhausted", stage: "pre_provider_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received", accounting: ACCOUNTING }],
    ["a rate limit that says nothing came back", { code: "flow_bootstrap.provider_rate_limited", stage: "provider_request", retryable: true, providerInvocation: "attempted", providerResponse: "not_received" }],
    ["a rate limit that is not retryable", { code: "flow_bootstrap.provider_rate_limited", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "received" }],
    ["an unexpected throw claiming an answer", { code: "flow_bootstrap.unexpected_error", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "received" }],
    ["an unknown invocation claiming a received answer", { code: "flow_bootstrap.provider_http_error", stage: "provider_request", retryable: false, providerInvocation: "unknown", providerResponse: "received" }],
    ["a call not attempted claiming an unknown answer", { code: "flow_bootstrap.provider_secret_unavailable", stage: "provider_request", retryable: false, providerInvocation: "not_attempted", providerResponse: "unknown" }],
    ["a stage default that also claims a cost", { code: "flow_bootstrap.provider_request_failed", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "unknown", accounting: ACCOUNTING }],
    ["a refused reservation with no record of the request", { code: "flow_bootstrap.run_budget_cost_exhausted", stage: "pre_provider_validation", retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received" }]
  ])("refuses %s", (_name, stored) => {
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toBeNull();
  });

  it("reads an HTTP failure's retryability and answer off the status its accounting carries", () => {
    const stored = (providerStatus: number) => ({
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: providerStatus >= 500,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { ...ACCOUNTING, providerStatus }
    });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored(503))).toEqual(stored(503));
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored(400))).toEqual(stored(400));
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...stored(400), retryable: true })).toBeNull();
  });

  it.each(["flow_bootstrap.provider_timeout", "flow_bootstrap.provider_aborted", "flow_bootstrap.provider_transport_unknown"])("keeps a legacy attempted record for ambiguous %s readable", (code) => {
    const stored = { code, stage: "provider_request", retryable: code === "flow_bootstrap.provider_timeout", providerInvocation: "attempted", providerResponse: code === "flow_bootstrap.provider_transport_unknown" ? "unknown" : "not_received" };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toEqual(stored);
  });
});
