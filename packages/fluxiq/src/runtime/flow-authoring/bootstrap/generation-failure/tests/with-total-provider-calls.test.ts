import { expect, it } from "vitest";
import { automationStudioFlowBootstrapFailureWithTotalProviderCalls as withCalls, flowBootstrapPhaseFailure, parseAutomationStudioFlowBootstrapFailureDiagnostic as parse } from "../index.ts";

it("preserves the original failure and legacy absence, and parses an actual aggregate", () => {
  const original = flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.invalid_input").diagnostic;
  expect(withCalls(original, undefined)).toBe(original);
  expect(parse(original)).toEqual(original);
  expect(parse(withCalls(original, 0))).toEqual({ ...original, totalProviderCallCount: 0 });
  expect(parse(withCalls(original, 68))).toEqual({ ...original, totalProviderCallCount: 68 });
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(parse({ ...original, totalProviderCallCount: invalid })).toBeNull();
});
