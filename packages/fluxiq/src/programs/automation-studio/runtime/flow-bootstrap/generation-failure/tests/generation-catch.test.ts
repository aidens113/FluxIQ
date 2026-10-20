import { expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioFlowBootstrapGenerationCatch as caught, flowBootstrapHarnessFailure, flowBootstrapPhaseFailure, flowBootstrapUnclassifiedThrowCode, parseAutomationStudioFlowBootstrapFailureDiagnostic, parseAutomationStudioFlowBootstrapGenerationError } from "../index.ts";

it("preserves recognized classification with known count, and omits an unknown count", () => {
  const original = flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.invalid_input");
  for (const totalProviderCallCount of [undefined, 0, 68]) {
    const result = caught(original, "provider_request", undefined, "flow_bootstrap.provider_transport_unknown", totalProviderCallCount);
    expect(result.diagnostic).toEqual({ ...original.diagnostic, ...(totalProviderCallCount === undefined ? {} : { totalProviderCallCount }) });
    expect(parseAutomationStudioFlowBootstrapGenerationError(result)).toEqual(result.diagnostic);
  }
});

it("matches existing named and unclassified fallback constructors without exposing thrown messages", () => {
  for (const stage of ["pre_provider_validation", "provider_request", "provider_output_validation"] as const) {
    for (const error of [new Error("synthetic credential text must stay private"), new TypeError("synthetic credential text must stay private")]) {
      const fallbackCode = "flow_bootstrap.provider_transport_unknown" as const;
      const original = flowBootstrapPhaseFailure(stage, undefined, flowBootstrapUnclassifiedThrowCode(error, stage, fallbackCode), error);
      const result = caught(error, stage, undefined, fallbackCode, 2);
      expect(result.diagnostic).toEqual({ ...original.diagnostic, totalProviderCallCount: 2 });
      expect(parseAutomationStudioFlowBootstrapGenerationError(result)).toEqual(result.diagnostic);
      expect(JSON.stringify(result.diagnostic)).not.toContain("credential text");
      expect(result.message).toBe(original.message);
    }
  }
});

it("names what the gate read the instruction to ask for, classes only, deduplicated in Core's order", () => {
  const original = flowBootstrapPhaseFailure("provider_output_validation", undefined, "flow_bootstrap.evidence_unusable_decision");
  const instructed = [
    { consequence: "modify_existing" as const, instructionId: "instruction.one", instructionDigest: `sha256:${"0".repeat(64)}`, quote: "a person's own words" },
    { consequence: "create_new" as const, instructionId: "instruction.one", instructionDigest: `sha256:${"0".repeat(64)}`, quote: "more words" },
    { consequence: "modify_existing" as const, instructionId: "instruction.two", instructionDigest: `sha256:${"1".repeat(64)}`, quote: "again" }
  ];
  const result = caught(original, "provider_request", undefined, "flow_bootstrap.provider_transport_unknown", 3, instructed);
  expect(result.diagnostic).toEqual({ ...original.diagnostic, totalProviderCallCount: 3, instructedConsequences: ["modify_existing", "create_new"] });
  expect(parseAutomationStudioFlowBootstrapGenerationError(result)).toEqual(result.diagnostic);
  expect(JSON.stringify(result.diagnostic)).not.toContain("own words");
  // None read, or none asked for: nothing said.
  expect(caught(original, "provider_request", undefined, "flow_bootstrap.provider_transport_unknown", 3, []).diagnostic).not.toHaveProperty("instructedConsequences");
  expect(caught(original, "provider_request", undefined, "flow_bootstrap.provider_transport_unknown", 3, undefined).diagnostic).not.toHaveProperty("instructedConsequences");
});

it("refuses a stored instructed-consequence list Core would not write", () => {
  const { diagnostic } = flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.invalid_input");
  for (const instructedConsequences of [[], ["purchase"], ["create_new", "modify_existing"], ["delete", "delete"], "delete"]) {
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, instructedConsequences })).toBeNull();
  }
  expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...diagnostic, instructedConsequences: ["move_money", "delete"] })).toEqual({ ...diagnostic, instructedConsequences: ["move_money", "delete"] });
});

it("projects an exhausted provider balance as its own build failure, which reads back", () => {
  const failure = flowBootstrapHarnessFailure({
    providerInvocation: "attempted",
    diagnostics: [{ severity: "error", code: "llm.provider_balance_exhausted", message: "private", metadata: { retryable: false, providerStatus: 402 } }],
    request: { requestId: "request.balance", estimatedInputTokens: 100 } as unknown as AutomationStudioLlmTaskRequest,
    provider: { provider: "deepseek", model: "deepseek-flash" }
  }).diagnostic;
  expect(failure).toMatchObject({ code: "flow_bootstrap.provider_balance_exhausted", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "received" });
  expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure)).toEqual(failure);
});
