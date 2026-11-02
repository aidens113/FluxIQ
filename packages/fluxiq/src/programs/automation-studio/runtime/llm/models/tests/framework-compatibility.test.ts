import { expect, it } from "vitest";
import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure, AUTOMATION_STUDIO_DEEPSEEK_MODELS, automationStudioLlmProviderCall } from "../../../../../../runtime/models/index.ts";
import * as errors from "../../provider-contract.ts";
import * as models from "../index.ts";
import * as retry from "../../provider-retry/index.ts";

it("keeps canonical model classes, registries and retry execution identical at legacy Studio seams", () => {
  expect(errors.AutomationStudioLlmProviderError).toBe(AutomationStudioLlmProviderError);
  expect(errors.normalizedAutomationStudioLlmProviderFailure).toBe(normalizedAutomationStudioLlmProviderFailure);
  expect(models.AUTOMATION_STUDIO_DEEPSEEK_MODELS).toBe(AUTOMATION_STUDIO_DEEPSEEK_MODELS);
  expect(retry.automationStudioLlmProviderCall).toBe(automationStudioLlmProviderCall);
  expect(Object.keys(models)).toContain("AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD");
});
