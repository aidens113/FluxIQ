// Whether a trial step's act repeats an act the build made while exploring
// (L1 reset settlement; office checkout r2, `run-mvfq94ff-c8c21493`).
//
// A Flow step cannot carry a `resetDestination` ref, so a trial's act had no
// destination, and the trial's own press of the very control an exploration
// call had named a destination for could never settle. A trial act that
// repeats an explored act of its build -- any brief's (`./project-ledger.ts`) --
// shares that act's destinations, lazily: one named for the explored act later
// covers the trial act too (`./ledger.ts`).
//
// A repeat is positive only: the same lasting classes; the same registered
// operation where both say which (the explored call's landed operation, the
// trial step's definition); the subject or the page token present on both and
// equal; and none of subject, page or resource present on both and different.
// Pure.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetSpot } from "./contracts.ts";

type Side = { consequences: readonly AutomationStudioActionConsequence[]; spot?: AutomationStudioSiteResetSpot | undefined };

/** Whether `trial` repeats `explored` (header). */
export function automationStudioSiteResetTrialRepeats(trial: Side & { definitionId?: string | undefined }, explored: Side & { operation?: string | undefined }): boolean {
  const classes = new Set(trial.consequences);
  if (classes.size !== new Set(explored.consequences).size || !explored.consequences.every((consequence) => classes.has(consequence))) return false;
  if (trial.definitionId !== undefined && explored.operation !== undefined && trial.definitionId !== explored.operation) return false;
  const a = trial.spot ?? {}, b = explored.spot ?? {};
  const equal = (key: "subject" | "page"): boolean => a[key] !== undefined && a[key] === b[key];
  if (!equal("subject") && !equal("page")) return false;
  return (["subject", "page", "resource"] as const).every((key) => a[key] === undefined || b[key] === undefined || a[key] === b[key]);
}
