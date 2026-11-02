import { describe, expect, it } from "vitest";
import { automationStudioClassifyLegacyStepAct } from "../index.ts";
import { AutomationPureCallbacks } from "../../../../../../engine/automation/execution-admission/kernel/index.ts";
import { runAutomationStudioGraph } from "../../../../../../engine/automation/index.ts";
import { automationObservationFixture } from "../../../../../../engine/automation/execution-admission/tests/fixture.ts";

describe("the original legacy classifier's intrinsic contract", () => {
  it("keeps actual compute-only engine frames covered with the exact original classifier", async () => {
    const f = await automationObservationFixture();
    f.options.classifyLegacyStepAct = automationStudioClassifyLegacyStepAct;
    const trace = await runAutomationStudioGraph({ flowId: "flow.compute", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] }, f.options);
    expect(trace.status).toBe("succeeded");
    const actual = [...f.store.rows.values()].filter(row => row.row.sourceKey === "automation.engine");
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.every(row => row.closed)).toBe(true);
  });

  it("does not authorize a different function with the same name", () => {
    const copiedName = () => false;
    Object.defineProperty(copiedName, "name", { value: automationStudioClassifyLegacyStepAct.name });
    expect(copiedName.name).toBe(automationStudioClassifyLegacyStepAct.name);
    expect(AutomationPureCallbacks.has({}, automationStudioClassifyLegacyStepAct)).toBe(true);
    expect(AutomationPureCallbacks.has({}, copiedName)).toBe(false);
  });
});
