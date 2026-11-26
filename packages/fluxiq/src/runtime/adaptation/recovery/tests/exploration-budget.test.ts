import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS,
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AutomationStudioExplorationBudgetLedger,
  automationStudioExplorationScopeAllows,
  resolveAutomationStudioExplorationBudget
} from "../exploration-budget.ts";
import { AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS, type AutomationStudioExplorationRefusal } from "../exploration-outcome.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS,
  automationStudioRecoveryDeadlineExpired,
  automationStudioRecoveryDeadlineRemainingMs,
  startAutomationStudioRecoveryDeadline
} from "../recovery-deadline.ts";

describe("resolveAutomationStudioExplorationBudget", () => {
  it("defaults to a budget inside Core's ceiling", () => {
    const budget = resolveAutomationStudioExplorationBudget();

    expect(budget).toEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS);
    expect(budget.maxDurationMs).toBeLessThanOrEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxDurationMs);
  });

  // The model sees every page an exploration looks at (2026-09-30): the budget
  // has no evidence-bytes stop, only the clock and the run's cost.
  it("has no evidence-bytes stop", () => {
    expect("maxEvidenceBytes" in AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS).toBe(false);
    expect("maxEvidenceBytes" in AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS).toBe(false);
    expect("maxEvidenceBytes" in resolveAutomationStudioExplorationBudget()).toBe(false);
  });

  // t1057 (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
  // EVERYTHING"). The budget held four counts that each ended an exploration: twenty-four actions, twenty-four
  // provider calls, two attempts of one action and two refusals. None of them is in the budget now, and an old
  // caller that still asks for one is not obeyed.
  it("has no count of actions, provider calls, repeats or refusals, and ignores a caller that asks for one", () => {
    for (const key of ["maxActions", "maxProviderCalls", "maxRepeatsPerAction", "maxRefusedActions", "maxStepsWithoutProgress"]) {
      expect(key in AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS).toBe(false);
      expect(key in AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS).toBe(false);
    }
    const stale = resolveAutomationStudioExplorationBudget({ maxActions: 1, maxProviderCalls: 1, maxRepeatsPerAction: 1, maxRefusedActions: 1 } as unknown as Parameters<typeof resolveAutomationStudioExplorationBudget>[0]);
    expect(stale).toEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS);
  });

  // Clamped downwards, never upwards, and never thrown: a recovery is already a
  // failure being handled, and refusing the budget would leave it unbounded.
  it("clamps an over-large or nonsensical clock down into range", () => {
    expect(resolveAutomationStudioExplorationBudget({ maxDurationMs: 9_000_000 }).maxDurationMs).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxDurationMs);
    expect(resolveAutomationStudioExplorationBudget({ maxDurationMs: Number.NaN }).maxDurationMs).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxDurationMs);
    expect(resolveAutomationStudioExplorationBudget({ maxDurationMs: 0 }).maxDurationMs).toBe(1);
  });

  // Decision L3 mechanically: there is no value a caller can pass. The cast is
  // the test -- it is how a future call site would try, and the assertion is
  // that trying changes nothing.
  it("has no way to turn destructive actions on", () => {
    const budget = resolveAutomationStudioExplorationBudget({ maxDurationMs: 3_000 });
    const forced = resolveAutomationStudioExplorationBudget({ allowDestructive: true } as unknown as Parameters<typeof resolveAutomationStudioExplorationBudget>[0]);

    expect(budget.allowDestructive).toBe(false);
    expect(forced.allowDestructive).toBe(false);
  });
});

describe("automationStudioExplorationScopeAllows", () => {
  // The scopes are opaque strings on purpose: Core knows "stay where you are"
  // and "only these places", and never learns that the web spells those origins.
  it.each([
    ["the same scope it started in", { kind: "same_scope" } as const, { currentScope: "a", requestedScope: "a" }, true],
    ["a different scope", { kind: "same_scope" } as const, { currentScope: "a", requestedScope: "b" }, false],
    ["nowhere known", { kind: "same_scope" } as const, { requestedScope: "b" }, false],
    ["a listed scope", { kind: "allowlist", scopes: ["a", "b"] } as const, { currentScope: "a", requestedScope: "b" }, true],
    ["an unlisted scope", { kind: "allowlist", scopes: ["a"] } as const, { currentScope: "a", requestedScope: "b" }, false],
    ["anything, when the list is empty", { kind: "allowlist", scopes: [] } as const, { currentScope: "a", requestedScope: "a" }, false],
    ["an empty request", { kind: "same_scope" } as const, { currentScope: "a", requestedScope: "" }, false]
  ])("allows %s: %o", (_label, policy, input, expected) => {
    expect(automationStudioExplorationScopeAllows(policy, input)).toBe(expected);
  });
});

describe("AutomationStudioExplorationBudgetLedger", () => {
  // t1057: no count ends an exploration. The ledger keeps admitting actions and provider calls far past the old
  // twenty-four of each, and its signal stays unaborted.
  it("keeps admitting actions and provider calls far past the old allowances", () => {
    const ledger = ledgerFor();

    for (let index = 0; index < 200; index += 1) {
      expect(ledger.admitProviderCall()).toEqual({ admitted: true });
      expect(ledger.admitAction(`inspect.${index}`)).toEqual({ admitted: true });
      ledger.recordAction(step(`inspect.${index}`));
    }

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.signal.aborted).toBe(false);
    expect(ledger.providerCalls).toBe(200);
    expect(ledger.actions).toBe(200);
    ledger.close();
  });

  // A cycle with a mutation between each repeat once ended at its third turn (`repeat_window`). It is loop
  // detection's to catch now; the ledger keeps how often each identical action was attempted, as evidence.
  it("admits a cycle that repeats one action across mutations, and keeps how often it was repeated", () => {
    const ledger = ledgerFor();

    for (let turn = 0; turn < 6; turn += 1) {
      expect(ledger.admitAction("inspect")).toEqual({ admitted: true });
      expect(ledger.admitAction("reveal")).toEqual({ admitted: true });
    }

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.actions).toBe(12);
    expect(ledger.repeatedActions).toBe(10);
    ledger.close();
  });

  // The second refusal once ended an exploration on the refusal's own reason. A refusal is feedback every time
  // now: it is recorded, by kind, and never counted as observed, and it ends nothing.
  it("records refusals by kind, apart from observed actions, and never stops on them", () => {
    const ledger = ledgerFor();

    for (const signature of ["a", "b", "c", "d"]) {
      ledger.admitAction(signature);
      ledger.recordAction(step(signature, "out_of_scope_refused"));
    }
    ledger.admitAction("e");
    ledger.recordAction(step("e", "destructive_action_refused"));
    ledger.admitAction("f");
    ledger.recordAction(step("f"));

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.signal.aborted).toBe(false);
    expect(ledger.actions).toBe(6);
    expect(ledger.refusedActions).toBe(5);
    expect(ledger.observedActions).toBe(1);
    expect(ledger.refusals).toEqual({ out_of_scope_refused: 4, destructive_action_refused: 1 });
    ledger.close();
  });

  it("names only its clocks and a person's request as reasons it can stop", () => {
    expect([...AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS].sort()).toEqual(["operator_approval_required", "recovery_deadline_expired", "wall_clock_expired"]);
  });

  it("stops on its own clock and says it was this exploration's", () => {
    let nowMs = 1_000;
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 5_000 }),
      startedAtMs: nowMs,
      now: () => nowMs
    });

    expect(ledger.admitAction("a")).toEqual({ admitted: true });
    nowMs += 6_000;

    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "wall_clock_expired" });
    expect(ledger.admitProviderCall()).toEqual({ admitted: false, stopReason: "wall_clock_expired" });
    expect(ledger.signal.aborted).toBe(true);
    ledger.close();
  });

  // The whole-recovery limit is a different limit, and saying so is the point:
  // one says this exploration needs longer, the other says the recovery does.
  it("stops on the recovery's clock when that is the nearer one, and says which", () => {
    let nowMs = 1_000;
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
      startedAtMs: nowMs,
      now: () => nowMs,
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 3_000 })
    });

    expect(ledger.admitAction("a")).toEqual({ admitted: true });
    nowMs += 4_000;

    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "recovery_deadline_expired" });
    ledger.close();
  });

  it("keeps the first reason when something else is recorded afterwards", () => {
    let nowMs = 0;
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 1_000 }),
      startedAtMs: 0,
      now: () => nowMs
    });

    ledger.admitAction("a");
    nowMs = 2_000;
    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "wall_clock_expired" });
    ledger.recordAction(step("a", "destructive_action_refused"));

    expect(ledger.stopReason).toBe("wall_clock_expired");
    ledger.close();
  });

  // t1049 (user, 2026-11-24). The ledger once stopped an exploration `no_progress` after three steps in a row that
  // learned nothing new. Steps that each bring back nothing new now stop nothing, however many there are.
  it("never stops on steps that bring back nothing new, however many there are", () => {
    const ledger = ledgerFor();

    for (let index = 0; index < 20; index += 1) {
      expect(ledger.admitProviderCall()).toEqual({ admitted: true });
      expect(ledger.admitAction(`inspect.${index}`)).toEqual({ admitted: true });
      ledger.recordAction(step(`inspect.${index}`));
    }

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.signal.aborted).toBe(false);
    expect(AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS).not.toContain("no_progress");
    ledger.close();
  });

  it("is already stopped when the recovery's clock ran out before it started", () => {
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
      startedAtMs: 10_000,
      now: () => 10_000,
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 1_000 })
    });

    expect(ledger.stopReason).toBe("recovery_deadline_expired");
    expect(ledger.signal.aborted).toBe(true);
    ledger.close();
  });
});

describe("startAutomationStudioRecoveryDeadline", () => {
  it("computes the instant once and counts down to it", () => {
    const deadline = startAutomationStudioRecoveryDeadline({ startedAtMs: 1_000, maxDurationMs: 5_000 });

    expect(deadline.expiresAtMs).toBe(6_000);
    expect(automationStudioRecoveryDeadlineRemainingMs(deadline, 2_000)).toBe(4_000);
    expect(automationStudioRecoveryDeadlineRemainingMs(deadline, 99_000)).toBe(0);
    expect(automationStudioRecoveryDeadlineExpired(deadline, 5_999)).toBe(false);
    expect(automationStudioRecoveryDeadlineExpired(deadline, 6_000)).toBe(true);
  });

  it("clamps rather than refusing, so a recovery is never left with no clock", () => {
    expect(startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 0 }).maxDurationMs).toBe(1);
    expect(startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 99_999_999 }).maxDurationMs).toBe(AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS);
    expect(startAutomationStudioRecoveryDeadline({ startedAtMs: 0 }).maxDurationMs).toBeGreaterThan(0);
  });
});

/** What one completed step tells the ledger: whether it was refused, and how. The signature names it for the reader. */
function step(_signature: string, refused?: AutomationStudioExplorationRefusal): { refused?: AutomationStudioExplorationRefusal } {
  return refused ? { refused } : {};
}

function ledgerFor(): AutomationStudioExplorationBudgetLedger {
  return new AutomationStudioExplorationBudgetLedger({
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 }),
    startedAtMs: 0,
    now: () => 0
  });
}
