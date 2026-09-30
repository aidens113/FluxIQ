// A build whose grant refused a call is recorded as that refusal, named.
//
// `run-mun5e1ie-5aeefbbd` (2026-09-29) stopped on its first decision with
// `flow_bootstrap.provider_transport_unknown` at `provider_request` -- a request
// whose answer is unknown. The grant had refused the call before any request
// existed, and the harness code it arrived as, `llm.provider_request_failed`,
// could not say so. The harness now carries the grant's own code and the check
// that refused; this is the projection of that into the stored diagnostic, read
// back through the parser a caller uses.
//
// The barrel is imported first for the reason `provider-refusal.test.ts` gives.
import { describe, expect, it } from "vitest";

import {
  flowBootstrapHarnessFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic
} from "../index.ts";
import {
  automationStudioLlmExecutionGrantCallRefusal,
  normalizedAutomationStudioLlmProviderFailure,
  type AutomationStudioLlmExecutionGrantCallRefusalReason,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";

const REQUEST = {
  requestId: "llm.evidence_tool_decision.refused",
  taskKind: "evidence_tool_decision",
  expectedOutput: "evidence_tool_decision",
  context: { projectId: "project.one", flowId: "flow.one" },
  tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
  estimatedInputTokens: 14_280,
  maxEstimatedCostUsd: 0.25,
  timeoutMs: 25_000
} as unknown as AutomationStudioLlmTaskRequest;

/** What the harness returns for a call the grant refused: the diagnostic it writes from the normalised failure. */
function refusedCall(reason: AutomationStudioLlmExecutionGrantCallRefusalReason) {
  const failure = normalizedAutomationStudioLlmProviderFailure(automationStudioLlmExecutionGrantCallRefusal(reason, "Core's own sentence."));
  return flowBootstrapHarnessFailure({
    request: REQUEST,
    provider: { provider: "deepseek", model: "deepseek-flash" },
    providerInvocation: failure.provenance.providerInvocation,
    diagnostics: [{
      severity: "error",
      code: failure.code,
      message: failure.message,
      metadata: { retryable: failure.retryable, ...(failure.grantRefusalReason ? { grantRefusalReason: failure.grantRefusalReason } : {}) }
    }]
  });
}

describe("a Flow build whose grant refused a call", () => {
  it("records the grant's refusal and the check that made it, not a transport failure", () => {
    const diagnostic = refusedCall("flow_changed").diagnostic;
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.execution_grant_no_longer_valid",
      stage: "provider_resolution",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      issueCodes: ["llm.execution_grant.flow_changed"]
    });
    expect(diagnostic.accounting).toBeUndefined();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
  });

  it.each([
    ["request_exceeds_grant", "flow_bootstrap.execution_grant_scope_mismatch"],
    ["reveal_unavailable", "flow_bootstrap.execution_grant_unavailable"],
    ["session_invalid", "flow_bootstrap.execution_grant_no_longer_valid"]
  ] as const)("names %s under %s", (reason, code) => {
    const diagnostic = refusedCall(reason).diagnostic;
    expect(diagnostic).toMatchObject({ code, issueCodes: [`llm.execution_grant.${reason}`] });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
  });

  it("keeps the request stage and the call's accounting when the grant ended while the provider was answering", () => {
    const diagnostic = refusedCall("revoked_in_flight").diagnostic;
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.execution_grant_revoked_in_flight",
      stage: "provider_request",
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: REQUEST.requestId, estimatedInputTokens: 14_280, provider: "deepseek", model: "deepseek-flash" }
    });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
  });
});
