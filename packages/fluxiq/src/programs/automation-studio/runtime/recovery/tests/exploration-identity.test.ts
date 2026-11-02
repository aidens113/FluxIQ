import { expect, expectTypeOf, it } from "vitest";
import * as canonical from "../../../../../runtime/adaptation/exploration/index.ts";
import * as deadline from "../../../../../runtime/adaptation/deadline/index.ts";
import type { EvidenceLoopFailureCode } from "../../../../../runtime/agents/loop/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode } from "../../llm/evidence-loop/index.ts";
import * as oldBudget from "../exploration-budget.ts";
import * as oldProgress from "../progress-guard.ts";
import * as oldOutcome from "../exploration-outcome.ts";
import * as oldDeadline from "../recovery-deadline.ts";

it("retains every legacy policy value, function and constructor as the same canonical object", () => {
  for (const facade of [oldBudget, oldProgress, oldOutcome]) {
    for (const [name, value] of Object.entries(facade)) {
      expect(value, name).toBe(Reflect.get(canonical, name));
    }
  }
  for (const [name, value] of Object.entries(oldDeadline)) {
    expect(value, name).toBe(Reflect.get(deadline, name));
  }
  expectTypeOf<AutomationStudioLlmEvidenceLoopFailureCode>().toEqualTypeOf<EvidenceLoopFailureCode>();
  const ledger = new oldBudget.AutomationStudioExplorationBudgetLedger({
    budget: canonical.resolveAutomationStudioExplorationBudget(), startedAtMs: 0, now: () => 0
  });
  expect(ledger).toBeInstanceOf(canonical.AutomationStudioExplorationBudgetLedger);
  ledger.close();
});
