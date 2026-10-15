// The one classification of a loop the model provider stopped answering
// (`../evidence-failure.ts`, `../loop-provider-unavailable.ts`, t619): it is
// published as the build ending `flow_bootstrap.provider_unavailable`, which
// reads back as written, never as `flow_bootstrap.provider_timeout` at a stage
// that code does not belong to -- the pair whose refused parse the service's
// catch turned into `flow_bootstrap.post_provider_validation_failed` on A8
// canary `run-mv8zw5l2-98064abf`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { flowBootstrapEvidenceLoopFailure, flowBootstrapLoopProviderUnavailableEnding, parseAutomationStudioFlowBootstrapFailureDiagnostic, parseAutomationStudioFlowBootstrapGenerationError } from "../index.ts";

type Failed = Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>;
const ACCOUNTING = { iterations: 3, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

function silent(code: string, options: { acted?: number; summary?: boolean; replied?: boolean } = {}): Failed {
  const acts = Array.from({ length: options.acted ?? 0 }, (_, index) => ({ iteration: index + 1, decision: "tool_call" as const, toolId: "example.act", effectApplied: true, resultCode: "example.acted" }));
  const unanswered = [1, 2, 3].map((n) => ({ iteration: acts.length + n, decision: "unusable" as const, resultCode: code }));
  return {
    ok: false, code: "llm_evidence_loop.provider_unavailable", trace: [...acts, ...unanswered], steps: [], accounting: { ...ACCOUNTING, iterations: acts.length + 3 },
    ...(options.summary === false ? {} : { providerUnavailable: { inARow: 3, codes: [code], said: code === "llm.provider_network_error" ? "it could not be reached" : "it did not answer before the time allowed for each request ran out", replied: options.replied ?? (options.acted ?? 0) > 0 } })
  };
}

describe("a loop the model provider stopped answering", () => {
  it("is published as the provider-unavailable ending, which reads back as written", () => {
    const failure = flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout"));
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    expect(diagnostic).toEqual(failure.diagnostic);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.provider_unavailable", retryable: true, issueCodes: ["llm.provider_timeout"], ending: { kind: "provider_unavailable", tried: { rounds: 1, decisions: 3, stepsInFlow: 0, tested: "not_tested" } } });
    expect(diagnostic!.ending!.message).toBe("The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out. Nothing was built: no Flow was created or changed, and nothing on the page was changed. What the Flow should do is kept, so you can try again later, once the provider is answering.");
  });

  it("says the acts its own loop took on the page, or leaves the page to a caller whose builders acted", () => {
    expect(flowBootstrapLoopProviderUnavailableEnding(silent("llm.provider_timeout", { acted: 2 })).message).toContain("Nothing was built: no Flow was created or changed. The build had taken 2 actions on the page before it stopped.");
    const left = flowBootstrapLoopProviderUnavailableEnding(silent("llm.provider_timeout"), "said_by_caller").message;
    expect(left).toContain("Nothing was built: no Flow was created or changed. What the Flow should do is kept");
    expect(left).not.toContain("page");
  });

  it("says a provider that could not be reached as that, and reads the run from the trace when the loop gave none", () => {
    expect(flowBootstrapLoopProviderUnavailableEnding(silent("llm.provider_network_error")).message).toMatch(/^The build stopped because the AI model provider could not be reached: 3 requests in a row got no answer\. Nothing was built/u);
    expect(flowBootstrapLoopProviderUnavailableEnding(silent("llm.provider_network_error", { summary: false })).message).toMatch(/^The build stopped because the AI model provider could not be reached: 3 requests in a row got no answer\./u);
    expect(flowBootstrapLoopProviderUnavailableEnding(silent("llm.provider_timeout", { summary: false })).message).toMatch(/^The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer\./u);
  });

  // A8 canary `run-mv8zw5l2-98064abf` recorded `providerResponse: "received"` over three timeouts and nothing else (t619).
  it("says no reply was received when every call failed before one arrived, and received once one had", () => {
    const none = flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout"));
    expect(none.diagnostic).toMatchObject({ providerInvocation: "attempted", providerResponse: "not_received" });
    expect(parseAutomationStudioFlowBootstrapGenerationError(none)).toEqual(none.diagnostic);
    const answered = flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout", { acted: 1 }));
    expect(answered.diagnostic.providerResponse).toBe("received");
    expect(parseAutomationStudioFlowBootstrapGenerationError(answered)).toEqual(answered.diagnostic);
    // Tokens the build's accounting holds came with a reply: the instruction reading, a judge, a builder.
    const paid = flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout"), { requestId: "request.paid", estimatedInputTokens: 10, inputTokens: 10, outputTokens: 4, totalTokens: 14, estimatedCostUsd: 0.0001 });
    expect(paid.diagnostic.providerResponse).toBe("received");
    // A loop that did not say whether anything arrived is read as before: received.
    expect(flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout", { summary: false })).diagnostic.providerResponse).toBe("received");
  });

  it("admits not_received past the request stage for this ending's code alone", () => {
    const none = flowBootstrapEvidenceLoopFailure(silent("llm.provider_timeout")).diagnostic;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(none)).not.toBeNull();
    const other = { code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", retryable: true, providerInvocation: "attempted" };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...other, providerResponse: "received" })).not.toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...other, providerResponse: "not_received" })).toBeNull();
  });
});
