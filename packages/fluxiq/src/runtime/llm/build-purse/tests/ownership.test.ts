import { expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse as canonicalPurse, automationStudioLlmBuildPurseScope as canonicalScope } from "../../../agents/budget/index.ts";
import { AutomationStudioLlmBuildPurse } from "../purse.ts";
import { automationStudioLlmBuildPurseScope } from "../run.ts";

it("keeps purse authority and async scopes shared with canonical agents", () => {
  expect(AutomationStudioLlmBuildPurse).toBe(canonicalPurse);
  expect(automationStudioLlmBuildPurseScope).toBe(canonicalScope);
});
