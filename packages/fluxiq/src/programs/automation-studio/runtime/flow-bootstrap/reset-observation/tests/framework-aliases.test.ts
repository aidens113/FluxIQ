import { expect, it } from "vitest";
import * as framework from "../../../../../../runtime/flow-authoring/execution/observation/index.ts";
import { authoringExecutionScopes } from "../../../../../../runtime/flow-authoring/execution/observation/internal/index.ts";
import { automationStudioSiteResetObservations } from "../registry.ts";
import { AutomationStudioSiteResetObservation, invokeAutomationStudioSiteResetCallback, invokeAutomationStudioSiteResetProducer, invokeAutomationStudioSiteResetSync } from "../index.ts";

it("keeps the original Studio symbols as exact framework identities with one private scope registry", () => {
  expect(AutomationStudioSiteResetObservation).toBe(framework.AuthoringExecutionScope);
  expect(invokeAutomationStudioSiteResetCallback).toBe(framework.invokeAuthoringExecutionCallback);
  expect(invokeAutomationStudioSiteResetProducer).toBe(framework.invokeAuthoringExecutionProducer);
  expect(invokeAutomationStudioSiteResetSync).toBe(framework.invokeAuthoringExecutionSync);
  expect(automationStudioSiteResetObservations).toBe(authoringExecutionScopes);
  expect(Object.hasOwn(framework, "authoringExecutionScopes")).toBe(false);
});
