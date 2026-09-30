// A Core note the model has acted on leaves the window when a newer one of the
// same kind arrives.
//
// Core's notes -- an answered repeat, a no-progress redirect, a refused
// decision, amendment or completion -- each answer one decision. Kept in the
// evidence, they competed newest-first with the pages for the window: the
// rebuilt window of run 6's decision 22 spent 8,398 of its 23,919 bytes on seven
// answered-repeat notes and six redirects saying the same thing, and run 4's
// decision 47 still showed a dry-run refusal that three clean replays since had
// made untrue. The newest note of a kind is the one that is still true; every
// earlier one is recorded, compressed, in the decision history
// (`./entry.ts`), which is where its trace now lives.
//
// Only the tool ids the caller names are removed. A tool's result is never
// passed here: a result is evidence of the page, and which results a decision
// sees is the window's choice alone (`../context-window.ts`).

import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";

/** Removes every entry of these tool ids from `evidence`, in place, before a newer one is pushed. */
export function automationStudioLlmDecisionContextSupersede(evidence: AutomationStudioLlmEvidenceEntry[], ...toolIds: readonly string[]): void {
  const superseded = new Set(toolIds);
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    if (superseded.has(evidence[index]!.toolId)) evidence.splice(index, 1);
  }
}
