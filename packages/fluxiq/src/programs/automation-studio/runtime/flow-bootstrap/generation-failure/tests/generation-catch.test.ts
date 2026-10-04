import { expect, it } from "vitest";
import { automationStudioFlowBootstrapGenerationCatch as caught, flowBootstrapPhaseFailure, flowBootstrapUnclassifiedThrowCode, parseAutomationStudioFlowBootstrapGenerationError } from "../index.ts";

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
