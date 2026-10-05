// The card that says what came of an edit to the draft, from the loop's answer
// to it and never from the model's own summary.
//
// Live run `run-musp4h2f-72e8ed99` (t193 1003, C13/C14): an edit Core refused
// was a header and prose with no card -- "Didn't change the Flow -- That step is
// already in the Flow ..., so this was not done: <the model's summary>" -- and
// one done only in part (a drop landed, a keep and a bind did not) read as all
// the model said it was doing. The model's sentence is now only the decision's
// reason, said as what was tried (`../decision-answer/draft-edit.ts`); this card under it is
// Core's answer: done, partly done, or not done, and why, in Core's words.

import { ACTIVITY_ACTION_REFUSAL_WORDS } from "../../../../../ui/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, type AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import type { AutomationStudioActivityEmission } from "../contracts.ts";

/**
 * Every reason the draft can refuse an amendment for has Core's words in the
 * shared card reading (`ACTIVITY_ACTION_REFUSAL_WORDS`, `fluxiq/ui`): a reason
 * added to the draft fails to compile here until it is said there.
 */
const SAID: Readonly<Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], string>> = ACTIVITY_ACTION_REFUSAL_WORDS.amendment;

/**
 * The loop's codes the card's record carries, read as plain strings so this
 * module does not reach into the loop (`../../llm/draft-amendment-feedback.ts`,
 * `../../llm/repeat-guard/feedback.ts`).
 */
const AMENDMENTS_REFUSED = "llm_evidence_loop.draft_amendments_refused";
const AMENDMENT_UNDONE = "llm_evidence_loop.draft_amendment_undone";
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";

/** The reasons that refuse only a step asked to run again. */
const RERUN_REASONS: ReadonlySet<string> = new Set(["changes_nothing", "rerun_holds_binding"]);
/** A repeat's earlier outcome as the record may carry it: a code, never a sentence. */
const OUTCOME_SHAPED = /^[a-z0-9_]{1,64}$/u;

/** What the loop answered an edit with. */
type Answer =
  | { kind: "landed" }
  /** Its amendments' refusal reasons, and how many of the decision's amendments did land. */
  | { kind: "refused"; reasons: readonly string[]; applied: number }
  /** Its amendments put the draft back exactly as it stood before. */
  | { kind: "undone" }
  /** A step it asked to run again was refused as a repeat; `outcome` is what the same call came to before. */
  | { kind: "repeated"; outcome: string };

const hasWords = (reason: string): boolean => Object.prototype.hasOwnProperty.call(SAID, reason);

/**
 * The edit's card, as an activity row: a tool row of the draft tool, so every
 * client draws it as the "Edit the Flow" card, under the decision it answers.
 * Its title says what was asked -- "Editing the Flow", or "Running the step
 * again" for a step asked to run again that was not -- and its status line
 * adds "done", "partly done" or "not done". Its record is codes and a count
 * only: the loop's code, each refusal reason the card reading has words for,
 * and how many changes landed when some did (`activityActionOf`, `fluxiq/ui`,
 * reads them into "Not done: that step is already in the Flow"). An edit done
 * in part is `succeeded`; one that changed nothing is `failed`.
 */
export function automationStudioActivityDraftEditCard(answer: Answer): AutomationStudioActivityEmission {
  const rerun = answer.kind === "repeated" || (answer.kind === "refused" && answer.reasons.length > 0 && answer.reasons.every((reason) => RERUN_REASONS.has(reason)));
  const title = rerun ? "Running the step again" : "Editing the Flow";
  const outcome = answer.kind === "landed" ? "done" : answer.kind === "refused" && answer.applied > 0 ? "partly done" : "not done";
  const text = recordOf(answer);
  return {
    phase: "building",
    label: `${title} — ${outcome}`,
    detail: { kind: "tool", title, status: outcome === "not done" ? "failed" : "succeeded", ref: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, ...(text ? { text } : {}) }
  };
}

function recordOf(answer: Answer): string | undefined {
  if (answer.kind === "landed") return undefined;
  if (answer.kind === "undone") return `Result: ${AMENDMENT_UNDONE}`;
  if (answer.kind === "repeated") return `Result: ${REPEAT_REFUSED}${OUTCOME_SHAPED.test(answer.outcome) ? ` · Reason: ${answer.outcome}` : ""}`;
  const known = [...new Set(answer.reasons.filter(hasWords))];
  return [`Result: ${AMENDMENTS_REFUSED}`, known.length ? `Reason: ${known.join(",")}` : "", answer.applied > 0 ? `Applied: ${answer.applied}` : ""].filter(Boolean).join(" · ");
}
