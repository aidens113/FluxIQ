// How many steps one amendment decision edited, beside which kind of edit it
// was.
//
// **Why a count had to join the word.** One decision may carry sixteen
// amendments and the row records one word for all of them, with `rerun` beating
// everything applied beside it -- so `draft_rerun` is equally consistent with
// one amendment and with sixteen. On `run-muht9lpw-a39aa056` two amend rows both
// read `draft_rerun`, nine action steps were withdrawn alongside them, and a
// reader had to establish that by eliminating three files and counting output
// tokens. A count cannot say which steps went; it says at once that steps went
// at all, and `targetedStepIds` says which.

/** Stable build-local identities and counts for one draft amendment decision. */
export type AutomationStudioLlmEvidenceLoopDraftChange = {
  targetedStepIds: string[];
  appliedCount: number;
  refusedCount: number;
  keptStepCount: number;
  rerunStepId?: string;
};
