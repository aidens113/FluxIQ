import { expect, it } from "vitest";
import { automationStudioRouterStatePaths, resolveAutomationStudioRouterState, routeAutomationStudioRun } from "../router-state.ts";
import * as canonical from "../../../../../engine/automation/router/state/index.ts";

it("retains the canonical state-routing function identities at the old module", () => {
  expect(automationStudioRouterStatePaths).toBe(canonical.automationStudioRouterStatePaths);
  expect(resolveAutomationStudioRouterState).toBe(canonical.resolveAutomationStudioRouterState);
  expect(routeAutomationStudioRun).toBe(canonical.routeAutomationStudioRun);
});
