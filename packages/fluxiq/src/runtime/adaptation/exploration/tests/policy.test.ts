import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  AutomationStudioExplorationProgressGuard,
  automationStudioExplorationCompletionOutcome,
  automationStudioExplorationEvidenceDigest,
  automationStudioExplorationScopeAllows,
  resolveAutomationStudioExplorationBudget
} from "../index.ts";

describe("canonical exploration policy", () => {
  it("keeps the wire shape, immutable defaults and bounded scope normalization", () => {
    expect(Object.isFrozen(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.scopePolicy)).toBe(true);
    expect(JSON.parse(JSON.stringify(resolveAutomationStudioExplorationBudget()))).toEqual({
      schemaVersion: "automation-studio.exploration-budget.v1", maxDurationMs: 600_000,
      maxActions: 24, maxProviderCalls: 24, maxRefusedActions: 2, maxRepeatsPerAction: 2,
      maxStepsWithoutProgress: 3, allowDestructive: false, scopePolicy: { kind: "same_scope" }
    });
    const scopes = [" Scope ", " Scope ", "", "x".repeat(2_001), ...Array.from({ length: 55 }, (_, index) => `s${index}`)];
    const budget = resolveAutomationStudioExplorationBudget({
      maxActions: 1.9, maxProviderCalls: Number.NaN, maxStepsWithoutProgress: 0,
      scopePolicy: { kind: "allowlist", scopes }
    });
    expect(budget.maxActions).toBe(1);
    expect(budget.maxProviderCalls).toBe(24);
    expect(budget.maxStepsWithoutProgress).toBe(1);
    expect(budget.scopePolicy).toEqual({ kind: "allowlist", scopes: [" Scope ", " Scope ", ...scopes.slice(4, 52)] });
    expect(automationStudioExplorationScopeAllows(budget.scopePolicy, { requestedScope: " Scope " })).toBe(true);
    expect(automationStudioExplorationScopeAllows(budget.scopePolicy, { requestedScope: "Scope" })).toBe(false);
  });

  it("keeps the original UTF-16 digest and refusal/progress priorities", () => {
    expect(automationStudioExplorationEvidenceDigest("")).toBe("0:811c9dc5");
    expect(automationStudioExplorationEvidenceDigest("a")).toBe("1:e40c292c");
    expect(automationStudioExplorationEvidenceDigest("😀")).toBe("2:cb31c4b8");
    const guard = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: 2 });
    expect(guard.record({ signature: "one", evidenceDigest: "a", evidenceBytes: 1, refused: false }).advanced).toBe(true);
    expect(guard.record({ signature: "one", evidenceDigest: "a", evidenceBytes: 0, refused: true })).toMatchObject({ reason: "repeated_request" });
    expect(guard.recordUnusableDecision().stalled).toBe(true);
    expect(guard.reason).toBe("unusable_decision");
    expect(guard.record({ signature: "two", evidenceDigest: "b", evidenceBytes: 1, refused: false }).advanced).toBe(true);
    expect(guard.stepsWithoutProgress).toBe(0);
  });

  it("requires observed actions, actual evidence bytes and a nonempty finding independently", () => {
    expect(automationStudioExplorationCompletionOutcome({ observedActions: 0, evidenceBytes: 1, result: { finding: "x" } })).toBe("no_evidence_found");
    expect(automationStudioExplorationCompletionOutcome({ observedActions: 1, evidenceBytes: 0, result: { finding: "x" } })).toBe("no_evidence_found");
    expect(automationStudioExplorationCompletionOutcome({ observedActions: 1, evidenceBytes: 1, result: {} })).toBe("no_evidence_found");
    expect(automationStudioExplorationCompletionOutcome({ observedActions: 1, evidenceBytes: 1, result: { finding: "x" } })).toBe("evidence_gathered");
  });
});
