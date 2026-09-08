import { describe, expect, it } from "vitest";

import {
  flowBootstrapHarnessFailure,
  flowBootstrapPhaseFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError
} from "./flow-bootstrap-generation-failure.ts";

describe("Flow Bootstrap generation failure diagnostics", () => {
  it("projects provider failures into a bounded, sanitized public diagnostic", () => {
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_http_error", message: "must not escape", metadata: { retryable: false, providerStatus: 400, privateBody: "must not escape" } }],
      request: {
        requestId: "request.one",
        idempotencyKey: "idempotency.one",
        taskKind: "flow_bootstrap",
        promptVersion: "automation-studio.flow-bootstrap.v1",
        expectedOutput: "flow_bootstrap",
        context: { schemaVersion: "0.1", taskKind: "flow_bootstrap", promptVersion: "automation-studio.flow-bootstrap.v1", projectId: "project.one", flowId: "flow.one", instructions: { instructionIds: [], instructions: [], diagnostics: [], tokenBudget: 384, estimatedTokens: 0 } },
        tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 },
        estimatedInputTokens: 1996,
        maxEstimatedCostUsd: 0.25,
        timeoutMs: 20_000
      },
      provider: { provider: "deepseek", model: "deepseek-chat" }
    });

    expect(failure.diagnostic).toEqual({
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.one", estimatedInputTokens: 1996, provider: "deepseek", model: "deepseek-chat", providerStatus: 400 }
    });
    expect(JSON.stringify(failure.diagnostic)).not.toContain("must not escape");
  });

  it("parses exact public diagnostics and rejects extra, secret-shaped, or unbounded fields", () => {
    const valid = {
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.one", estimatedInputTokens: 1996, provider: "deepseek", model: "deepseek-chat", providerStatus: 400 }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, code: "flow_bootstrap.unsupported_request_field", stage: "pre_provider_validation", providerInvocation: "not_attempted", providerResponse: "not_received", accounting: undefined })).toEqual({ code: "flow_bootstrap.unsupported_request_field", stage: "pre_provider_validation", retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received" });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, prompt: "private" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, authorization: "private" } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, estimatedInputTokens: 50_001 } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, stage: "raw_provider_body" })).toBeNull();
  });

  it("parses a canonical foreign-constructor error without relying on class identity", () => {
    const diagnostic = {
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received"
    };
    const foreignError = Object.assign(
      new Error("Flow Bootstrap generation failed (llm.provider_http_error)."),
      { name: "AutomationStudioFlowBootstrapGenerationError", diagnostic, rawResponse: "must not escape" }
    );
    expect(parseAutomationStudioFlowBootstrapGenerationError(foreignError)).toEqual(diagnostic);
  });

  it("rejects spoofed, noncanonical, malformed, and hostile structural errors", () => {
    const diagnostic = {
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received"
    };
    const message = "Flow Bootstrap generation failed (llm.provider_http_error).";
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "OtherError", message, diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ message, diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "AutomationStudioFlowBootstrapGenerationError", message: "raw upstream", diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "AutomationStudioFlowBootstrapGenerationError", message, diagnostic: { ...diagnostic, rawResponse: "private" } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError(new Proxy({}, { get: () => { throw new Error("hostile getter"); } }))).toBeNull();
  });

  it("reports provider call and response state truthfully for harness failures", () => {
    const request = { requestId: "request.truth", estimatedInputTokens: 100 } as any;
    expect(flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm_budget.input_limit_exceeded", message: "private budget detail" }],
      request
    }).diagnostic).toMatchObject({
      stage: "pre_provider_validation",
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm_output.invalid_provider_result", message: "private output detail" }],
      request,
      provider: { provider: "mock-production", model: "mock-bootstrap" }
    }).diagnostic).toMatchObject({
      stage: "provider_output_validation",
      providerInvocation: "attempted",
      providerResponse: "received"
    });
  });

  it("enforces fixed reason-code stage semantics and falls back on cross-stage construction", () => {
    const valid = {
      code: "flow_bootstrap.active_instructions_required",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, stage: "provider_resolution" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, retryable: true })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, providerInvocation: "attempted" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, providerResponse: "unknown" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      accounting: { requestId: "request.private", estimatedInputTokens: 1 }
    })).toBeNull();

    expect(flowBootstrapPhaseFailure(
      "provider_resolution",
      undefined,
      "flow_bootstrap.invalid_input" as any
    ).diagnostic).toEqual({
      code: "flow_bootstrap.provider_resolution_failed",
      stage: "provider_resolution",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
  });
});
