// Every guard that refuses to build a model request has its own closed code,
// so a failed build says which guard refused (`run-mulxk0ro-36bf090d`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES, AutomationStudioLlmRequestRefusedError } from "../../../llm/index.ts";
import { automationStudioFlowBootstrapFailureDiagnosticOf, parseAutomationStudioFlowBootstrapGenerationError } from "../index.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../error.ts";

describe("a model request a guard refused to build", () => {
  it("is named by its guard, as a pre-provider failure with no provider called, at whatever stage the caller vouched for", () => {
    const seen = new Set<string>();
    for (const refusal of AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES) {
      const diagnostic = automationStudioFlowBootstrapFailureDiagnosticOf(new AutomationStudioLlmRequestRefusedError(refusal, "message that never travels"), "provider_request");
      expect(diagnostic.code, refusal).toBe(`flow_bootstrap.request_refused_${refusal.slice("llm.request.".length)}`);
      expect(diagnostic).toMatchObject({ stage: "pre_provider_validation", providerInvocation: "not_attempted" });
      expect(JSON.stringify(diagnostic)).not.toContain("message that never travels");
      // It reads back as itself.
      expect(parseAutomationStudioFlowBootstrapGenerationError(new AutomationStudioFlowBootstrapGenerationError(diagnostic))?.code).toBe(diagnostic.code);
      seen.add(diagnostic.code);
    }
    expect(seen.size).toBe(AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES.length);
  });

  it("leaves a plain throw classified by its kind, as before", () => {
    expect(automationStudioFlowBootstrapFailureDiagnosticOf(new Error("anything"), "provider_request").code).toBe("flow_bootstrap.unexpected_error");
  });
});
