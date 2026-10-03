import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "../../llm/flow-execution-limits/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS } from "../index.ts";

// t250: the default ceiling of an unattended repair claims to be Core's own
// ceiling for a recovery. It was a literal $0.25 that outlived the run cost
// ceiling it restated when that became $0.10 and configurable.
describe("AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS", () => {
  it("defaults an unattended repair's ceiling to the run cost ceiling, whatever it is configured to", () => {
    expect(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.repairMaxCostUsdPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);
  });
});
