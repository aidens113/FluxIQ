// The one reader of what an attempt's steps came to, for both places that say it: the memory a task
// keeps (`./saved-state.ts`) and the record of one attempt (`../attempt-store/outcome-of-record.ts`).
// Steps that assembled into a saved draft only partly work and are unproven; steps the attempt wrote
// that could not be assembled are kept all the same and read as notes, which is true of them; no step
// is nothing. Whether a Flow was proven whole is a third thing the memory alone knows.

/** `partly_works` for an assembled draft, `notes_only` for steps that did not assemble, nothing for no steps. */
export function automationStudioAnswerFirstKeptState(kept: { steps: boolean; assembled: boolean }): "partly_works" | "notes_only" | undefined {
  if (kept.assembled) return "partly_works";
  return kept.steps ? "notes_only" : undefined;
}
