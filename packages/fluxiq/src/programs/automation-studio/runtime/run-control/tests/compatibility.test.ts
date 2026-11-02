import { describe, expect, it } from "vitest";
import * as legacy from "../index.ts";
import * as control from "../../../../../runtime/run-control/index.ts";

describe("the Studio run-control compatibility surface", () => {
  it("shares classes, constants, and registry readers with canonical runtime", () => {
    expect(legacy.AutomationStudioRunController).toBe(control.AutomationStudioRunController);
    expect(legacy.AutomationStudioRunControlRegistry).toBe(control.AutomationStudioRunControlRegistry);
    expect(legacy.AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS).toBe(control.AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS);
    expect(legacy.AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES).toBe(control.AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES);
    expect(legacy.automationStudioRunControlOf).toBe(control.automationStudioRunControlOf);
    expect(legacy.automationStudioMarkRunAdapting).toBe(control.automationStudioMarkRunAdapting);
    const registry = new legacy.AutomationStudioRunControlRegistry();
    expect(control.automationStudioRunControlOf({ runControl: registry })).toBe(registry);
  });
});
