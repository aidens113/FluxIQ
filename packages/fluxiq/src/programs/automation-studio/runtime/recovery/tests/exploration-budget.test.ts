import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS,
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AutomationStudioExplorationBudgetLedger,
  automationStudioExplorationScopeAllows,
  resolveAutomationStudioExplorationBudget
} from "../exploration-budget.ts";
import type { AutomationStudioExplorationStopReason } from "../exploration-outcome.ts";
import { automationStudioExplorationEvidenceDigest } from "../progress-guard.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS,
  automationStudioRecoveryDeadlineExpired,
  automationStudioRecoveryDeadlineRemainingMs,
  startAutomationStudioRecoveryDeadline
} from "../recovery-deadline.ts";

describe("resolveAutomationStudioExplorationBudget", () => {
  it("defaults to a budget inside every one of Core's ceilings", () => {
    const budget = resolveAutomationStudioExplorationBudget();

    expect(budget).toEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS);
    expect(budget.maxActions).toBeLessThanOrEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions);
    expect(budget.maxProviderCalls).toBeLessThanOrEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxProviderCalls);
    expect(budget.maxDurationMs).toBeLessThanOrEqual(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxDurationMs);
  });

  // The three ceilings that bound the loop are Core's own, written out in the
  // budget because reading them back at module-evaluation time closes an import
  // cycle through `llm/harness/intervention.ts`. Pinned here so the copy cannot
  // drift above what the loop would actually accept.
  it("keeps its loop ceilings equal to the evidence loop's own limits", () => {
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxProviderCalls).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations);
    expect(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxEvidenceBytes).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes);
  });

  // Clamped downwards, never upwards, and never thrown: a recovery is already a
  // failure being handled, and refusing the budget would leave it unbounded.
  it("clamps an over-large or nonsensical request down into range", () => {
    const budget = resolveAutomationStudioExplorationBudget({
      maxDurationMs: 9_000_000,
      maxActions: 400,
      maxProviderCalls: 400,
      maxEvidenceBytes: 99_000_000,
      maxRefusedActions: 0,
      maxRepeatsPerAction: Number.NaN
    });

    expect(budget.maxDurationMs).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxDurationMs);
    expect(budget.maxActions).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions);
    expect(budget.maxProviderCalls).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxProviderCalls);
    expect(budget.maxEvidenceBytes).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxEvidenceBytes);
    expect(budget.maxRefusedActions).toBe(1);
    expect(budget.maxRepeatsPerAction).toBe(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxRepeatsPerAction);
  });

  // Decision L3 mechanically: there is no value a caller can pass. The cast is
  // the test -- it is how a future call site would try, and the assertion is
  // that trying changes nothing.
  it("has no way to turn destructive actions on", () => {
    const budget = resolveAutomationStudioExplorationBudget({ maxActions: 3 });
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
  it("admits actions up to the cap and then names the cap that stopped it", () => {
    const ledger = ledgerFor({ maxActions: 2 });

    expect(ledger.admitAction("a")).toEqual({ admitted: true });
    expect(ledger.admitAction("b")).toEqual({ admitted: true });
    expect(ledger.admitAction("c")).toEqual({ admitted: false, stopReason: "action_limit" });
    expect(ledger.stopReason).toBe("action_limit");
    expect(ledger.signal.aborted).toBe(true);
    ledger.close();
  });

  // The mutation the scoping report named: count only the successes and the
  // budget stops bounding anything, because a run can be refused indefinitely.
  it("charges a refused action against the action count, not only a successful one", () => {
    const ledger = ledgerFor({ maxActions: 2, maxRefusedActions: 5 });

    ledger.admitAction("a");
    ledger.recordAction(step("a", "out_of_scope_refused"));
    ledger.admitAction("b");
    ledger.recordAction(step("b"));

    expect(ledger.actions).toBe(2);
    expect(ledger.refusedActions).toBe(1);
    expect(ledger.observedActions).toBe(1);
    expect(ledger.admitAction("c")).toEqual({ admitted: false, stopReason: "action_limit" });
    ledger.close();
  });

  // The gap Core's loop cannot see: it refuses the identical request inside one
  // mutation epoch, so a cycle with a mutation between each repeat is legal to
  // it. The ledger counts identity for the whole exploration instead.
  it("stops a cycle that repeats one action across mutations", () => {
    const ledger = ledgerFor({ maxActions: 8, maxRepeatsPerAction: 2 });

    expect(ledger.admitAction("inspect")).toEqual({ admitted: true });
    expect(ledger.admitAction("reveal")).toEqual({ admitted: true });
    expect(ledger.admitAction("inspect")).toEqual({ admitted: true });
    expect(ledger.admitAction("reveal")).toEqual({ admitted: true });
    expect(ledger.admitAction("inspect")).toEqual({ admitted: false, stopReason: "repeat_window" });
    ledger.close();
  });

  it("stops once the refusal allowance is spent, keeping the refusal's own reason", () => {
    const ledger = ledgerFor({ maxActions: 8, maxRefusedActions: 2 });

    ledger.admitAction("a");
    ledger.recordAction(step("a", "destructive_action_refused"));
    expect(ledger.stopReason).toBeUndefined();
    ledger.admitAction("b");
    ledger.recordAction(step("b", "destructive_action_refused"));

    expect(ledger.stopReason).toBe("destructive_action_refused");
    expect(ledger.signal.aborted).toBe(true);
    ledger.close();
  });

  it("caps provider calls separately from actions", () => {
    const ledger = ledgerFor({ maxActions: 8, maxProviderCalls: 2 });

    expect(ledger.admitProviderCall()).toEqual({ admitted: true });
    expect(ledger.admitProviderCall()).toEqual({ admitted: true });
    expect(ledger.admitProviderCall()).toEqual({ admitted: false, stopReason: "provider_call_limit" });
    expect(ledger.providerCalls).toBe(2);
    ledger.close();
  });

  it("stops on its own clock and says it was this exploration's", () => {
    let nowMs = 1_000;
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 5_000, maxActions: 8 }),
      startedAtMs: nowMs,
      now: () => nowMs
    });

    expect(ledger.admitAction("a")).toEqual({ admitted: true });
    nowMs += 6_000;

    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "wall_clock_expired" });
    ledger.close();
  });

  // The whole-recovery limit is a different limit, and saying so is the point:
  // one says this exploration needs longer, the other says the recovery does.
  it("stops on the recovery's clock when that is the nearer one, and says which", () => {
    let nowMs = 1_000;
    const ledger = new AutomationStudioExplorationBudgetLedger({
      budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000, maxActions: 8 }),
      startedAtMs: nowMs,
      now: () => nowMs,
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 3_000 })
    });

    expect(ledger.admitAction("a")).toEqual({ admitted: true });
    nowMs += 4_000;

    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "recovery_deadline_expired" });
    ledger.close();
  });

  it("keeps the first reason when something else aborts afterwards", () => {
    const ledger = ledgerFor({ maxActions: 1 });

    ledger.admitAction("a");
    expect(ledger.admitAction("b")).toEqual({ admitted: false, stopReason: "action_limit" });
    ledger.recordAction(step("a", "destructive_action_refused"));

    expect(ledger.stopReason).toBe("action_limit");
    ledger.close();
  });

  // The guard that replaced the call caps. The ledger runs for as long as each
  // step brings back something new, however many steps that is, and stops on
  // `no_progress` -- not on a count -- once three steps in a row have not.
  it("keeps admitting a loop that is still learning, well past any old call count", () => {
    const ledger = ledgerFor({ maxActions: 24, maxProviderCalls: 24 });

    for (let index = 0; index < 20; index += 1) {
      expect(ledger.admitProviderCall()).toEqual({ admitted: true });
      expect(ledger.admitAction(`inspect.${index}`)).toEqual({ admitted: true });
      ledger.recordAction(step(`inspect.${index}`));
    }

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.providerCalls).toBe(20);
    expect(ledger.stepsWithoutProgress).toBe(0);
    ledger.close();
  });

  it("stops on no_progress when different requests keep returning an answer it already has", () => {
    const ledger = ledgerFor({ maxActions: 24, maxRepeatsPerAction: 4 });

    ledger.admitAction("inspect.a");
    ledger.recordAction(step("inspect.a", undefined, "same"));
    for (const signature of ["inspect.b", "inspect.c"]) {
      ledger.admitAction(signature);
      ledger.recordAction(step(signature, undefined, "same"));
      expect(ledger.stopReason).toBeUndefined();
    }
    ledger.admitAction("inspect.d");
    ledger.recordAction(step("inspect.d", undefined, "same"));

    expect(ledger.stopReason).toBe("no_progress");
    expect(ledger.noProgressReason).toBe("repeated_evidence");
    expect(ledger.signal.aborted).toBe(true);
    // Four actions, nowhere near the cap of twenty-four: the guard, not a count.
    expect(ledger.actions).toBe(4);
    ledger.close();
  });

  // A slow start is not a stuck loop. Only a streak counts, so two barren steps
  // followed by a finding reset it.
  it("forgives barren steps once a step brings something new", () => {
    const ledger = ledgerFor({ maxActions: 24 });

    for (const [signature, bytes] of [["a", 0], ["b", 0], ["c", 32], ["d", 0], ["e", 0], ["f", 32]] as const) {
      ledger.admitAction(signature);
      ledger.recordAction({ signature, evidenceDigest: `digest.${signature}`, evidenceBytes: bytes });
    }

    expect(ledger.stopReason).toBeUndefined();
    expect(ledger.stepsWithoutProgress).toBe(0);
    ledger.close();
  });

  it("lets a spent refusal allowance name itself even when the progress streak comes due on the same step", () => {
    const ledger = ledgerFor({ maxActions: 8, maxRefusedActions: 3, maxStepsWithoutProgress: 3 });

    for (const signature of ["a", "b", "c"]) {
      ledger.admitAction(signature);
      ledger.recordAction(step(signature, "out_of_scope_refused"));
    }

    expect(ledger.stopReason).toBe("out_of_scope_refused");
    expect(ledger.noProgressReason).toBeUndefined();
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

/** One completed step. Distinct evidence per signature unless told otherwise. */
function step(signature: string, refused?: AutomationStudioExplorationStopReason, evidence = `evidence.${signature}`) {
  return {
    signature,
    evidenceDigest: automationStudioExplorationEvidenceDigest(evidence),
    evidenceBytes: evidence.length,
    ...(refused ? { refused } : {})
  };
}

function ledgerFor(overrides: Parameters<typeof resolveAutomationStudioExplorationBudget>[0]): AutomationStudioExplorationBudgetLedger {
  return new AutomationStudioExplorationBudgetLedger({
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000, ...overrides }),
    startedAtMs: 0,
    now: () => 0
  });
}
