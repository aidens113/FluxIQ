import { describe, expect, it } from "vitest";

import {
  flowBootstrapEvidenceLoopFailure,
  flowBootstrapHarnessFailure,
  flowBootstrapPhaseFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError
} from "./flow-bootstrap-generation-failure.ts";

describe("Flow Bootstrap generation failure diagnostics", () => {
  it.each([
    ["llm_evidence_loop.invalid_decision", "flow_bootstrap.evidence_invalid_decision"],
    ["llm_evidence_loop.unknown_tool", "flow_bootstrap.evidence_unknown_tool"],
    ["llm_evidence_loop.duplicate_call", "flow_bootstrap.evidence_duplicate_call"],
    ["llm_evidence_loop.duplicate_tool_request", "flow_bootstrap.evidence_duplicate_tool_request"],
    ["llm_evidence_loop.repeat_without_progress", "flow_bootstrap.evidence_repeat_without_progress"],
    ["llm_evidence_loop.tool_failed", "flow_bootstrap.evidence_tool_failed"],
    ["llm_evidence_loop.evidence_limit", "flow_bootstrap.evidence_limit"],
    ["llm_evidence_loop.iteration_limit", "flow_bootstrap.evidence_iteration_limit"],
    ["llm_evidence_loop.cancelled", "flow_bootstrap.evidence_cancelled"]
  ] as const)("preserves closed evidence coordinator failure %s", (code, expectedCode) => {
    const failure = flowBootstrapEvidenceLoopFailure({
      ok: false,
      code,
      trace: [{ iteration: 1, decision: "tool_call", callId: "private.call", toolId: "web.click_safe", evidenceBytes: 123, effectApplied: false, resultCode: "action.recoverable" }],
      accounting: { iterations: 2, toolCalls: 1, evidenceBytes: 123, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
    });
    expect(failure.diagnostic).toEqual({
      code: expectedCode,
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: { iterationCount: 2, decisionCount: 1, toolCallCount: 1, evidenceBytes: 123, steps: [{ toolId: "web.click_safe", effectApplied: false, resultCode: "action.recoverable" }] }
    });
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
    expect(JSON.stringify(failure)).not.toContain("private.call");
  });

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
      code: "flow_bootstrap.provider_http_error",
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
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.one", estimatedInputTokens: 1996, provider: "deepseek", model: "deepseek-chat", providerStatus: 400 }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, code: "flow_bootstrap.invalid_input", stage: "pre_provider_validation", providerInvocation: "not_attempted", providerResponse: "not_received", accounting: undefined })).toEqual({ code: "flow_bootstrap.invalid_input", stage: "pre_provider_validation", retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received" });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, prompt: "private" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, authorization: "private" } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, estimatedInputTokens: 50_001 } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, stage: "raw_provider_body" })).toBeNull();
  });

  it("accepts only bounded categorical evidence steps", () => {
    const valid = {
      code: "flow_bootstrap.evidence_tool_failed",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: {
        iterationCount: 2,
        decisionCount: 2,
        toolCallCount: 1,
        evidenceBytes: 123,
        steps: [{ toolId: "web.click", effectApplied: false, resultCode: "target.not_found" }]
      }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      evidenceLoop: { ...valid.evidenceLoop, steps: [{ toolId: "web.click", resultCode: "private result text!" }] }
    })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      evidenceLoop: { ...valid.evidenceLoop, steps: Array.from({ length: 17 }, () => ({ toolId: "web.click" })) }
    })).toBeNull();
  });

  it("parses a canonical foreign-constructor error without relying on class identity", () => {
    const diagnostic = {
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "unknown"
    };
    const foreignError = Object.assign(
      new Error("Flow Bootstrap generation failed (flow_bootstrap.provider_http_error)."),
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

  it("projects length-limited provider output to the exact sanitized output-validation diagnostic", () => {
    const partialContent = '{"kind":"flow_bootstrap","private":"must not escape"';
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_output_truncated", message: partialContent, metadata: { rawResponse: partialContent } }],
      request: { requestId: "request.truncated", estimatedInputTokens: 1_996 } as any,
      provider: { provider: "deepseek", model: "deepseek-chat" },
      usage: { inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_truncated",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.truncated", estimatedInputTokens: 1_996, provider: "deepseek", model: "deepseek-chat", inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });
    expect(JSON.stringify(failure)).not.toContain(partialContent);
  });

  it("projects structurally invalid provider output without exposing provider content or issue paths", () => {
    const privateDetail = "plan.subflows[0].nodes[0].private";
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_output_invalid", message: privateDetail, metadata: { rawResponse: privateDetail } }],
      request: { requestId: "request.invalid-output", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-chat" }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_invalid",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.invalid-output", estimatedInputTokens: 1_000, provider: "deepseek", model: "deepseek-chat" }
    });
    expect(JSON.stringify(failure)).not.toContain(privateDetail);
  });

  it("does not let an earlier instruction diagnostic mask the appended provider failure", () => {
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [
        { severity: "error", code: "instruction.invalid_scope", message: "private instruction detail" },
        { severity: "error", code: "llm.provider_configuration_invalid", message: "private provider detail", metadata: { retryable: false } }
      ],
      request: { requestId: "request.ordered", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-chat" }
    });
    expect(failure.diagnostic).toMatchObject({
      code: "flow_bootstrap.provider_configuration_invalid",
      stage: "provider_request",
      providerResponse: "not_received"
    });
    expect(JSON.stringify(failure)).not.toMatch(/private instruction|private provider/);
  });

  it("projects valid but over-limit provider usage without exposing raw counts", () => {
    const privateUsage = "prompt=2001 completion=512 total=2513";
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_usage_limit_exceeded", message: privateUsage, metadata: { rawUsage: privateUsage } }],
      request: { requestId: "request.usage-limit", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-chat" }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_usage_limit_exceeded",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.usage-limit", estimatedInputTokens: 1_000, provider: "deepseek", model: "deepseek-chat" }
    });
    expect(JSON.stringify(failure)).not.toContain(privateUsage);
  });

  it("projects padding-only truncation without exposing provider content", () => {
    const providerContent = " \n\t ";
    const failure = flowBootstrapHarnessFailure({
      diagnostics: [{ severity: "error", code: "llm.provider_output_padding_truncated", message: providerContent, metadata: { rawResponse: providerContent } }],
      request: { requestId: "request.padding", estimatedInputTokens: 1_996 } as any,
      provider: { provider: "deepseek", model: "deepseek-chat" },
      usage: { inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_padding_truncated",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.padding", estimatedInputTokens: 1_996, provider: "deepseek", model: "deepseek-chat", inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });
    expect(Object.values(failure.diagnostic)).not.toContain(providerContent);
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
