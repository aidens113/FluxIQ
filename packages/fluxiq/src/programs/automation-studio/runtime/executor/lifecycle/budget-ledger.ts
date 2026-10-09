// What a run has spent of its lifecycle recovery budget (state-aware recovery
// plan, C7).
//
// This module owns the ledger and the one function that spends from it. The
// ledger belongs to the run, not to a frame: it is keyed by incident, never by
// frame, so entering or leaving a Subflow resets nothing, and an incident that
// crosses a frame boundary keeps what it has spent.

import type { AutomationStudioLifecycleBudget } from "./budget.ts";

/** What one incident has spent, and how often each occurrence key has run. */
export type AutomationStudioIncidentSpend = {
  handlerRuns: number;
  alternatives: number;
  occurrences: Readonly<Record<string, number>>;
};

/** One run's spending. */
export type AutomationStudioLifecycleLedger = {
  handlerRunsForRun: number;
  routesForRun: number;
  incidents: Readonly<Record<string, AutomationStudioIncidentSpend>>;
};

/** A run that has spent nothing. */
export const AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER: AutomationStudioLifecycleLedger = Object.freeze({ handlerRunsForRun: 0, routesForRun: 0, incidents: Object.freeze({}) });

/**
 * One thing the dispatcher is about to do.
 *
 * `optional_way_on` and `retry_attempt` are listed so the rule is in one
 * place: they are always allowed and never counted. The way on past an
 * optional step is the Flow's own path, not a recovery (t371), and a node's
 * attempts are its retry policy's, which no recovery budget lowers below four.
 */
export type AutomationStudioLifecycleCharge =
  | { kind: "handler_run"; incidentId: string; occurrenceKey: string; maxRuns: number }
  | { kind: "route"; incidentId: string }
  | { kind: "alternative"; incidentId: string }
  | { kind: "optional_way_on" }
  | { kind: "retry_attempt" };

/** Whether the charge is allowed, with the ledger after it; a refusal leaves the ledger as it was and says why. */
export type AutomationStudioLifecycleChargeResult =
  | { allowed: true; ledger: AutomationStudioLifecycleLedger }
  | { allowed: false; reason: string; ledger: AutomationStudioLifecycleLedger };

const NO_SPEND: AutomationStudioIncidentSpend = Object.freeze({ handlerRuns: 0, alternatives: 0, occurrences: Object.freeze({}) });

/**
 * Spends one charge, or refuses it:
 * - a handler run is refused when its occurrence key has already run
 *   `maxRuns` times (the same handler never runs twice for the same
 *   occurrence by default), when the incident has spent its handler runs, or
 *   when the run has;
 * - a Route is refused when the run has spent its Routes;
 * - an alternative is refused when the incident has spent its alternatives.
 */
export function chargeAutomationStudioLifecycleBudget(
  ledger: AutomationStudioLifecycleLedger,
  budget: AutomationStudioLifecycleBudget,
  charge: AutomationStudioLifecycleCharge
): AutomationStudioLifecycleChargeResult {
  switch (charge.kind) {
    case "optional_way_on":
    case "retry_attempt":
      return { allowed: true, ledger };
    case "handler_run": {
      const spend = ledger.incidents[charge.incidentId] ?? NO_SPEND;
      const runs = spend.occurrences[charge.occurrenceKey] ?? 0;
      if (runs >= Math.max(1, charge.maxRuns)) return refused(ledger, `This handler has already run for this occurrence (${charge.occurrenceKey}).`);
      if (spend.handlerRuns >= budget.maxHandlerRunsPerIncident) return refused(ledger, `The incident has used its ${budget.maxHandlerRunsPerIncident} handler runs.`);
      if (ledger.handlerRunsForRun >= budget.maxHandlerRunsPerRun) return refused(ledger, `The run has used its ${budget.maxHandlerRunsPerRun} handler runs.`);
      return {
        allowed: true,
        ledger: withIncident({ ...ledger, handlerRunsForRun: ledger.handlerRunsForRun + 1 }, charge.incidentId, {
          ...spend,
          handlerRuns: spend.handlerRuns + 1,
          occurrences: { ...spend.occurrences, [charge.occurrenceKey]: runs + 1 }
        })
      };
    }
    case "route":
      if (ledger.routesForRun >= budget.maxRoutesPerRun) return refused(ledger, `The run has used its ${budget.maxRoutesPerRun} routes.`);
      return { allowed: true, ledger: { ...ledger, routesForRun: ledger.routesForRun + 1 } };
    case "alternative": {
      const spend = ledger.incidents[charge.incidentId] ?? NO_SPEND;
      if (spend.alternatives >= budget.maxAlternativesPerIncident) return refused(ledger, `The incident has tried its ${budget.maxAlternativesPerIncident} alternatives.`);
      return { allowed: true, ledger: withIncident(ledger, charge.incidentId, { ...spend, alternatives: spend.alternatives + 1 }) };
    }
  }
}

function withIncident(ledger: AutomationStudioLifecycleLedger, incidentId: string, spend: AutomationStudioIncidentSpend): AutomationStudioLifecycleLedger {
  return { ...ledger, incidents: { ...ledger.incidents, [incidentId]: spend } };
}

function refused(ledger: AutomationStudioLifecycleLedger, reason: string): AutomationStudioLifecycleChargeResult {
  return { allowed: false, reason, ledger };
}
