import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS } from "../index.ts";

describe("AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS", () => {
  it("keeps the user-facing repair default independent of isolated runtime limits", () => {
    expect(AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS.repairMaxCostUsdPerRun).toBe(0.25);
  });
});
