// The grant's numbers and the recovery's, held together.
//
// `runtime/llm/` may not import a value out of `runtime/recovery/`, so the
// grant writes its defaults as literals that describe a recovery. This pins
// those literals to the recovery constants they describe, so neither side can
// move without the other noticing.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS,
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS,
  AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD
} from "../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS,
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN
} from "../recovery/index.ts";

describe("the limits a default recovery grant and a recovery share", () => {
  it("gives a default grant a diagnosis, a patch and the exploration's own default decisions", () => {
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS).toBe(2 + AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxProviderCalls);
    expect(AUTOMATION_STUDIO_LLM_HIGH_TOKEN_CONFIRMATION_THRESHOLD).toBe(100_000);
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN).toBe(2);
  });

  // The recovery clock starts before the grant is claimed, so a lease at least
  // as long as the longest recovery means the recovery's own deadline is what
  // ends a recovery; the lease only ends a claimed grant nobody released.
  it("keeps a claimed grant's lease at least as long as the longest recovery", () => {
    expect(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS);
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });

  // Twenty-six calls at a few seconds each is longer than two minutes, so a
  // two-minute clock would quietly have been the new call cap.
  it("gives a recovery ten minutes by default, and an exploration the same clock", () => {
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS).toBe(600_000);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS);
  });
});
