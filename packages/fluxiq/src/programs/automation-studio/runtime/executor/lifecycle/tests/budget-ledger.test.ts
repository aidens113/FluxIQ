import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_INCIDENT,
  AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_RUN,
  AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW,
  AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN,
  defaultAutomationStudioFlowSettingsMetadata,
  type AutomationStudioFlowDocument
} from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY, automationStudioNodeRetryPolicy } from "../../retry-policy.ts";
import { automationStudioLifecycleBudget } from "../budget.ts";
import { AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER, chargeAutomationStudioLifecycleBudget, type AutomationStudioLifecycleCharge, type AutomationStudioLifecycleLedger } from "../budget-ledger.ts";
import { automationStudioHandlerOccurrenceKey } from "../incident.ts";

const budget = automationStudioLifecycleBudget();

function spend(ledger: AutomationStudioLifecycleLedger, charge: AutomationStudioLifecycleCharge): AutomationStudioLifecycleLedger {
  const result = chargeAutomationStudioLifecycleBudget(ledger, budget, charge);
  if (!result.allowed) throw new Error(result.reason);
  return result.ledger;
}

function key(handlerId: string, invocationId: string, arrival: number, evidence: JsonValue = { dialog: "open" }): string {
  return automationStudioHandlerOccurrenceKey({ handlerId, nodeArrival: { invocationId, nodeId: "press", arrival }, conditionEvidence: evidence });
}

describe("lifecycle recovery budget", () => {
  it("defaults to the named constants in the recovery-budget owner", () => {
    expect(budget).toEqual({
      maxHandlerRunsPerIncident: AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_INCIDENT,
      maxHandlerRunsPerRun: AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_RUN,
      maxRoutesPerRun: AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN,
      maxAlternativesPerIncident: AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW
    });
    expect(budget).toEqual({ maxHandlerRunsPerIncident: 3, maxHandlerRunsPerRun: 12, maxRoutesPerRun: 2, maxAlternativesPerIncident: 2 });
    const stored = (defaultAutomationStudioFlowSettingsMetadata().trainingModeSettings as { recoveryBudget: Record<string, number> }).recoveryBudget;
    expect(stored).toMatchObject({ maxReroutesPerRun: 2, maxRecoveryAttemptsPerSubflow: 2 });
    expect(automationStudioLifecycleBudget({ maxReroutesPerRun: 5, maxHandlerRunsPerRun: 4.7, maxHandlerRunsPerIncident: -1 })).toEqual({ maxHandlerRunsPerIncident: 3, maxHandlerRunsPerRun: 4, maxRoutesPerRun: 5, maxAlternativesPerIncident: 2 });
  });

  it("refuses the same handler for the same occurrence, and allows it at a new arrival or new evidence", () => {
    const first = key("child/h-1", "inv-2", 1);
    const ledger = spend(AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: first, maxRuns: 1 });
    const again = chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: first, maxRuns: 1 });
    expect(again).toMatchObject({ allowed: false, reason: expect.stringContaining("already run for this occurrence") });
    expect(again.ledger).toBe(ledger);
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: first, maxRuns: 2 }).allowed).toBe(true);
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("child/h-1", "inv-2", 2), maxRuns: 1 }).allowed).toBe(true);
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("child/h-1", "inv-2", 1, { dialog: "other" }), maxRuns: 1 }).allowed).toBe(true);
  });

  it("caps handler runs per incident, and carries the incident across frames", () => {
    // The incident opened in the child frame (inv-2) and moved to its Call Subflow node in the parent (inv-1).
    let ledger = spend(AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("child/h-1", "inv-2", 1), maxRuns: 1 });
    ledger = spend(ledger, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("child/h-2", "inv-2", 1), maxRuns: 1 });
    ledger = spend(ledger, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("parent/h-3", "inv-1", 1), maxRuns: 1 });
    expect(ledger.incidents["inc-1"]?.handlerRuns).toBe(3);
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-1", occurrenceKey: key("recovery/h-4", "inv-1", 1), maxRuns: 1 }))
      .toMatchObject({ allowed: false, reason: expect.stringContaining("incident has used its 3") });
    // A new incident still has its own allowance.
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-2", occurrenceKey: key("recovery/h-4", "inv-1", 2), maxRuns: 1 }).allowed).toBe(true);
  });

  it("caps handler runs per run, whatever frame or incident they ran in", () => {
    let ledger = AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER;
    for (let index = 0; index < 12; index += 1) {
      ledger = spend(ledger, { kind: "handler_run", incidentId: `inc-${index}`, occurrenceKey: key("h", `inv-${index % 3}`, index), maxRuns: 1 });
    }
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "handler_run", incidentId: "inc-99", occurrenceKey: key("h", "inv-9", 99), maxRuns: 1 }))
      .toMatchObject({ allowed: false, reason: expect.stringContaining("run has used its 12") });
  });

  it("caps routes per run and alternatives per incident", () => {
    let ledger = spend(spend(AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER, { kind: "route", incidentId: "inc-1" }), { kind: "route", incidentId: "inc-2" });
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "route", incidentId: "inc-3" }).allowed).toBe(false);
    ledger = spend(spend(ledger, { kind: "alternative", incidentId: "inc-1" }), { kind: "alternative", incidentId: "inc-1" });
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "alternative", incidentId: "inc-1" }).allowed).toBe(false);
    expect(chargeAutomationStudioLifecycleBudget(ledger, budget, { kind: "alternative", incidentId: "inc-2" }).allowed).toBe(true);
  });

  it("never counts the optional way-on or a retry attempt, and never lowers the four-attempt floor", () => {
    const zero = automationStudioLifecycleBudget({ maxReroutesPerRun: 0, maxRecoveryAttemptsPerSubflow: 0, maxHandlerRunsPerRun: 0, maxHandlerRunsPerIncident: 0, maxRetriesPerAction: 0 });
    for (const charge of [{ kind: "optional_way_on" }, { kind: "retry_attempt" }] as const) {
      const result = chargeAutomationStudioLifecycleBudget(AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER, zero, charge);
      expect(result).toEqual({ allowed: true, ledger: AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER });
    }
    const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "f", ownerKind: "routine", ownerId: "o", name: "f", nodes: [{ id: "press", definitionId: "web.press" }], edges: [], createdAt: 0, updatedAt: 0 } as AutomationStudioFlowDocument;
    const policy = automationStudioNodeRetryPolicy(flow, flow.nodes[0]!, { recoveryBudget: { maxRetriesPerAction: 0, maxReroutesPerRun: 0, maxRecoveryAttemptsPerSubflow: 0 } });
    expect(policy.maxAttempts).toBe(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts);
    expect(policy.maxAttempts).toBe(4);
  });
});
