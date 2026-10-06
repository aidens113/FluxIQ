// The draft a call's answer is about, for a call that runs the draft again
// (`core.run_flow`): what makes the same part run after an amendment a new call.
//
// **Why (t195, `run-musr9pv3-f4bf6256`).** A part run's answer is the draft's
// steps run again, so the same `{from, to}` over a changed draft asks something
// new, and over an unchanged draft and page asks what it already answered. The
// repeat guard keys such a call on this (`./outcomes.ts`, `draftOf`), and so does
// the repeat policy's request signature (`../evidence-loop.ts`): a part run that
// changed nothing no longer moves the mutation epoch, and keyed on the epoch
// alone a run after an amendment would be answered from memory instead of run.
//
// It is the Flow signature (`../../flow-draft/flow-signature.ts`) -- each proposed
// step in order, with what it runs with (`ranWith` before its first input),
// its routing, settings and acts -- digested, so a key stays short. That is
// the Flow the part run walks, and it changes whenever the amendment memory
// (`../evidence-loop/amendment-memory.ts`) sees an amendment change what a
// kept step does (its acts, `ranWith`, routing or settings), so an amendment
// that applied is never refused here as the same draft. What moves that memory
// and not this key is what a part run does not walk: a step the Flow does not
// hold (one withdrawn), or a step's id where a rerun put an identical step in
// its place.

import { createHash } from "node:crypto";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/** A short digest of the Flow the draft stands for. */
export function automationStudioLlmEvidenceDraftKey(steps: readonly AutomationStudioFlowDraftStep[]): string {
  return createHash("sha256").update(automationStudioFlowDraftFlowSignature(steps)).digest("hex").slice(0, 32);
}
