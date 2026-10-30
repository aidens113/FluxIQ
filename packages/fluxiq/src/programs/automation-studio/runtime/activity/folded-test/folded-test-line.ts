import { automationStudioActivityFoldedReason } from "../folded-reason.ts";

/**
 * The one line Core writes for a test it ran inside a submission because the
 * submission asked for it: a whole test says it was from the start, a run from
 * a named step says that. Generic words; no revision, digest, step key or code.
 */
export function automationStudioActivityFoldedTestLine(fromAStep: boolean): string | undefined {
  return automationStudioActivityFoldedReason({
    did: fromAStep ? "ran the saved revision from the named step" : "tested the saved revision from its start",
    because: "the submission asked for it"
  });
}
