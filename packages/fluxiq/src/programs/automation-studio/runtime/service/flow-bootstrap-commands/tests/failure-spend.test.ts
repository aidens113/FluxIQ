import { describe, expect, it } from "vitest";
import { AutomationStudioFlowBootstrapGenerationError, flowBootstrapPhaseFailure, parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import { automationStudioFlowBootstrapFailureWithSpend } from "../failure-spend.ts";

const spent = { requestId: "candidate.build", estimatedInputTokens: 900, provider: "mock", model: "mock-model", inputTokens: 170, outputTokens: 85, totalTokens: 255, estimatedCostUsd: 0.0206 };

function diagnosticOf(value: unknown) {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(value);
  if (!diagnostic) throw new Error("expected a readable Flow Bootstrap failure");
  return diagnostic;
}

describe("a build failure carries what the build spent", () => {
  it("gives a failure that names no cost the build's, and it reads back", () => {
    const failed = flowBootstrapPhaseFailure("provider_output_validation", undefined, "flow_bootstrap.provider_output_validation_failed");
    expect(failed.diagnostic.accounting).toBeUndefined();
    expect(diagnosticOf(automationStudioFlowBootstrapFailureWithSpend(failed, spent))).toMatchObject({ code: "flow_bootstrap.provider_output_validation_failed", stage: "provider_output_validation", accounting: spent });
  });

  it("replaces a failed request's own tokens and cost with the build's, keeping the request's identity", () => {
    const request = { requestId: "llm.evidence_tool_decision.1", estimatedInputTokens: 300, provider: "mock", model: "mock-model", inputTokens: 10, outputTokens: 0, totalTokens: 10, estimatedCostUsd: 0.0001 };
    const failed = new AutomationStudioFlowBootstrapGenerationError({ ...flowBootstrapPhaseFailure("provider_request", undefined, "flow_bootstrap.provider_timeout").diagnostic, accounting: request });
    expect(diagnosticOf(automationStudioFlowBootstrapFailureWithSpend(failed, spent)).accounting).toEqual({ ...request, inputTokens: 170, outputTokens: 85, totalTokens: 255, estimatedCostUsd: 0.0206 });
  });

  it("never lowers a figure the failure already names", () => {
    const failed = flowBootstrapPhaseFailure("persistence", { ...spent, estimatedCostUsd: 0.05 }, "flow_bootstrap.persistence_failed");
    expect(diagnosticOf(automationStudioFlowBootstrapFailureWithSpend(failed, spent)).accounting?.estimatedCostUsd).toBe(0.05);
  });

  it("leaves a failure whose code may name no cost, and any throw that is not a build failure, as they came", () => {
    // Nothing was sent, or the request's answer is unknown: a cost there would not read back.
    const unsent = flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.invalid_input");
    const unknown = flowBootstrapPhaseFailure("provider_request", undefined, "flow_bootstrap.provider_request_failed");
    expect(automationStudioFlowBootstrapFailureWithSpend(unsent, spent)).toBe(unsent);
    expect(automationStudioFlowBootstrapFailureWithSpend(unknown, spent)).toBe(unknown);
    const other = new Error("not ours"), abort = new DOMException("stopped", "AbortError");
    expect(automationStudioFlowBootstrapFailureWithSpend(other, spent)).toBe(other);
    expect(automationStudioFlowBootstrapFailureWithSpend(abort, spent)).toBe(abort);
  });
});
