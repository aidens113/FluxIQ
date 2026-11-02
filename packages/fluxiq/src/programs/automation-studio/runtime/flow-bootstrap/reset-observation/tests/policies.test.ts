import { expect, it } from "vitest";
import { ExecutionCallbackPolicies } from "../../../../../../runtime/execution-observation/policies/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "../index.ts";

it("preserves the exact framework policy authority through the legacy Studio alias", () => {
  expect(AutomationStudioSiteResetCallbackPolicies).toBe(ExecutionCallbackPolicies);
  const owner = { read: () => 42 };
  ExecutionCallbackPolicies.remember(owner, owner.read, "pure");
  expect(AutomationStudioSiteResetCallbackPolicies.isPure(owner, owner.read)).toBe(true);
  expect(AutomationStudioSiteResetCallbackPolicies.isPure({ ...owner }, owner.read)).toBe(false);
});
