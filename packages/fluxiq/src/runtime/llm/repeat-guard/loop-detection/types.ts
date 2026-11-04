// The nouns of loop detection: the patterns, the facts one call is judged on,
// what the detector finds, and the signal the loop's caller answers.
//
// Facts only. Nothing here holds a row's values, a page's text or a word the
// model wrote: a row is a digest, a page is its state digest, an input is the
// digest of what it asks (`./meaningful-input.ts`). The model's own words grant
// nothing and count for nothing (t826).

import type { JsonObject } from "../../../../core/index.ts";

/**
 * The shapes a loop takes (`docs/working/answer-first-plan.md`, D14).
 *
 * - `exact_repeat`: the same call on the same page that failed or changed
 *   nothing, refused by the repeat guard (`../outcomes.ts`), which stays the
 *   first case.
 * - `near_repeat`: the same call with only free text changed.
 * - `cycle`: A B A B, across pages too, with nothing new in the second pass.
 * - `no_progress`: a window of calls that each ran and brought nothing new.
 * - `same_fix`: a draft edit undone and redone, or a repair already tried,
 *   after a fresh start too (`./attempt-record.ts`).
 * - `same_act`: the same stated-lasting act on the same target, landing again
 *   with no new row identity, however much the page changes each time.
 */
export const AUTOMATION_STUDIO_LLM_LOOP_PATTERNS = Object.freeze(["exact_repeat", "near_repeat", "cycle", "no_progress", "same_fix", "same_act"] as const);
export type AutomationStudioLlmLoopPattern = (typeof AUTOMATION_STUDIO_LLM_LOOP_PATTERNS)[number];

/** What did not change over the calls a finding is about, in closed words the steer says in its own. */
export type AutomationStudioLlmLoopUnchanged = "page" | "rows" | "acts" | "draft";

/** One call that ran, as the detector reads it. */
export type AutomationStudioLlmLoopCall = {
  callId: string;
  toolId: string;
  input: JsonObject;
  /**
   * What the call really ran with, where the caller says (`draft.ranWith`): the
   * same control by its fingerprint, which a page's reload does not renumber.
   * Its handles are left out of the call's key.
   */
  ranAs?: JsonObject | undefined;
  /** The domain's name for what the call acts on (`describeCall`): a handle reused for another control is another target. */
  targetWords?: string | undefined;
  /**
   * Where the call left the work, by the domain's own route state (`routeState.page.location`),
   * digested. An "Add to cart" on another product's page has the very same
   * fingerprint: the place is what says it is another target.
   */
  placeAfter?: string | undefined;
  /** The call states it does something lasting: it declared a consequence, or it says it does an act of the instruction. */
  lasting?: boolean | undefined;
  /** The act of the instruction the decision names: what the caller's `askedRepeats` is asked by. */
  act?: string | undefined;
  /** The call undoes an act of this build (`undoes`): what it undid may be done again. */
  undo?: boolean | undefined;
  /** The task's own row binding says this call is about a row, so the same act again is another row's. */
  rowBound?: boolean | undefined;
  /** What the call is answered against besides its page (the loop's `requestContextKey` or a part run's draft): a call on a moved build is a new call. */
  context?: string | undefined;
  stateBefore?: string | undefined;
  stateAfter?: string | undefined;
  effect: "observe" | "mutate";
  effectApplied: boolean;
  /** The result was a refusal (`ok: false`). */
  refused: boolean;
  /** A digest per row the answer kept (`./row-digests.ts`), so a repeated read that brought new rows is progress. */
  rows?: readonly string[] | undefined;
  /** A digest of the answer: a look asked again that answered differently is not the same look again. */
  answer?: string | undefined;
  /** The draft's key after the call (`../draft-key.ts`), where the loop drafts. */
  draftKey?: string | undefined;
  /** The call moved the work forward by what was accepted rather than by what it did on a page: a plan written, a Flow's revision accepted. Only its first time from a page is progress. */
  accepted?: boolean | undefined;
  /** A trial of what was last submitted (`finishingTools.test`): one that ran and was refused says that submission did not work. */
  judges?: boolean | undefined;
  /** A submission of a whole Flow or part (`finishingTools.submit`): a repair, recorded so it is known when it comes back. */
  fix?: boolean | undefined;
  /**
   * The call is not the model's to be counted: a validated temporary failure,
   * a trial whose gate owns its re-tests, a rerun measured as its amendment, a
   * check, a written step, a member of a prior-node batch. What it brought
   * still counts as progress; it is never counted as a repeat.
   */
  exempt?: boolean | undefined;
};

/** What the caller is asked about a lasting act: the call, and the act of the instruction it names. Never the model's words. */
export type AutomationStudioLlmLoopAct = { toolId: string; input: JsonObject; act?: string | undefined };

/**
 * How many times the task asks for this act in all, from the attempt's act record;
 * nothing when it does not say. Only the caller's configuration lifts the refusal
 * of a repeat: nothing the model replies can, and the answer stands from the
 * target's first landing, so naming another act later does not raise it.
 */
export type AutomationStudioLlmLoopAskedRepeats = (act: AutomationStudioLlmLoopAct) => number | undefined;

/** One `amend_draft` decision as it settled. */
export type AutomationStudioLlmLoopAmendment = {
  /** The digest of what it asks, free text out (`./meaningful-input.ts`). */
  key: string;
  draftBefore?: string | undefined;
  draftAfter?: string | undefined;
  /** How many of its amendments landed. */
  applied: number;
  /** Its edits put the draft back exactly as it stood before. */
  undone: boolean;
  /** The steps it named and how it changed them. */
  changes?: ReadonlyArray<{ step: number; change: string }> | undefined;
};

/** A pattern the detector found standing. */
export type AutomationStudioLlmLoopFinding = {
  pattern: AutomationStudioLlmLoopPattern;
  /** How many times the thing has now been done without getting anywhere. */
  repeats: number;
  /** The tools involved, oldest first: Core's ids, never a value. */
  toolIds: readonly string[];
  /** What did not change over those calls. */
  unchanged: readonly AutomationStudioLlmLoopUnchanged[];
  /** The latest call it is about, where one ran: what a refused call is told it is the same as. */
  callId?: string | undefined;
};

/**
 * The ladder's last two steps (`./watch.ts`), which need the single-loop path:
 * `change_approach` asks for a fresh, small context from the page as it stands,
 * and `ask_person` for the work to stop spending and ask. Carries what a caller
 * needs to do either; nothing a page or the model wrote.
 */
export type AutomationStudioLlmLoopSignal = AutomationStudioLlmLoopFinding & {
  kind: "change_approach" | "ask_person";
  /** Fresh approaches already signalled in this attempt (`./attempt-record.ts`), this one included. */
  approaches: number;
};

/** What the caller answers: `continue` when it has dealt with the signal and the loop goes on; `end` to end as a stall does today. */
export type AutomationStudioLlmLoopSignalAnswer = "continue" | "end";
