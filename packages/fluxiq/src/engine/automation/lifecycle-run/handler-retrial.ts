// Letting a repaired handler run once more for its incident (state-aware
// recovery plan, C6 step 8, C7).
//
// A handler runs at most once per occurrence and is never tried twice for one
// incident (`./dispatch.ts`). An in-run repair whose unit is that handler
// replaces it in the frame's graph and re-attempts the failing node; the
// replaced handler is that attempt's trial only if the incident forgets it
// ran. Nothing else the incident spent is given back: its handler-run count
// and the run's stay charged, so a repair never buys a run more budget.

import type { AutomationStudioRunFrames } from "../frames/index.ts";

/** Forgets that `handlerId` ran for `incidentId`: its occurrence keys leave the incident and the ledger's occurrence counts. */
export function automationStudioIncidentHandlerRetrial(run: AutomationStudioRunFrames, incidentId: string, handlerId: string): void {
  const state = run.lifecycle;
  const prefix = `${handlerId}@`;
  const incident = state.incidents.get(incidentId);
  if (incident) incident.handlersRun = incident.handlersRun.filter((key) => !key.startsWith(prefix));
  const spend = state.ledger.incidents[incidentId];
  if (!spend) return;
  const occurrences = Object.fromEntries(Object.entries(spend.occurrences).filter(([key]) => !key.startsWith(prefix)));
  state.ledger = { ...state.ledger, incidents: { ...state.ledger.incidents, [incidentId]: { ...spend, occurrences } } };
}
