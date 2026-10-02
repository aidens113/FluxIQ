// What each call did on the page it found, so the same call on the same page is
// not made again when it failed or changed nothing.
//
// **The failure this closes (user, 2026-10-01: "the model isnt just being
// called again and again trying the same action and failing").** The loop let
// the model repeat a call that had already failed, or already changed nothing,
// on a page nothing had touched since:
//
// - `run-muq310ht-ab80eed0` (t227): the cookie banner's close button pressed 20
//   times and refused 20 times, eleven of them the domain's
//   `answered_the_same_again`; then one list read rerun eight times on an
//   unchanged page.
// - `run-muq3ubys-4b4dbf5b` (t193, run 36): a press refused `target_covered`
//   five times, and one `keep` amendment sent seven times.
//
// Each was a paid decision. Nothing refused the repeat, because a press that
// fails still counts as an attempt, so the repeat policy (`../repeat-policy.ts`)
// sees every repeat as a new request; a rerun is exempt from that policy
// altogether; and the domain only marks an identical refusal
// (`answered_the_same_again`, `repeatedAnswer`), because ending the build is
// Core's job.
//
// **The rule.** Every call is recorded by its key: the tool, its whole input
// (canonical JSON, so key order does not matter) and the page it found -- the
// domain's own `stateDigests.before`, or else the last state the loop saw. A
// call whose key matches an earlier call that failed (a refusal) or changed
// nothing (no effect applied, or the page after it the same as before) is
// refused before it runs (`../decision-handlers/refused-repeat.ts`), and the
// model is told what happened then and what to do instead.
//
// **A call that goes where it went before is no progress either.** Lane D's
// run 37 (t195) navigated its repair to the same address eight times. Each
// navigation succeeded and moved the page, so it was neither failed nor a call
// that changed nothing, and nothing here counted it. A call made again from the
// same page that ends on the same page as the identical call before it did
// (`same_result`) is recorded like one that changed nothing: the next identical
// call from that page is refused. The second one still runs -- the first time
// a call is repeated, nothing yet says it will end the same way.
//
// **A look that answered the same on the same page is answered from memory.**
// Lane A's crossborder build asked `find_on_page "Voltbay"` 29 times on the
// unchanged home page, each "0 matches": a refused press between finds reopened
// every look to the repeat policy. A look made again on the same page that
// answered exactly as the identical look before it (`same_answer`, from
// `answer`) is refused like an action repeat: the next identical look there is
// not run, the model is pointed at the answer it already has, and three refused
// in a row stall the round. Looks in a row of any kind are counted as well
// (`./searching.ts`).
//
// **A rerun is keyed where it runs.** A rerun runs from the page its step
// started on (`../node-tools/step-place.ts`), not from the page the last call
// left, so it is checked against that page (`blocks(..., at)`).
//
// **What still runs.**
//
// - Anything after the page changed: the key holds the page.
// - A look, which changes nothing by nature: looks stay with the repeat policy,
//   which answers one asked again from memory and runs one after an attempt.
// - A call whose earlier outcome said to wait and try again: a rate limit, a
//   control briefly disabled, a page still loading (`RETRY_LATER`).
// - A call that threw: nothing answered it, so it is not a repeat.
// - The judgement's and the repair's replays: they go through the dry-run gate
//   (`../node-tools/dry-run-gate.ts`), not through the loop's calls. A replay
//   moves the page without the loop seeing it, so the last state seen is
//   forgotten (`moved`), and nothing is refused until the page is seen again.

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceSearchStreak, type AutomationStudioLlmEvidenceSearchStreak } from "./searching.ts";

/** Words in a result code or reason that say the call may work if made again later. */
const RETRY_LATER = /rate[_-]?limit|too[_-]?many|throttl|retry|disabled|busy|not[_-]?ready|loading|timed[_-]?out|timeout|try[_-]?again/iu;

/** How an earlier call went, as the model is told it. */
export type AutomationStudioLlmEvidenceRepeatedOutcome = {
  /** The call that already did it. */
  callId: string;
  /**
   * `failed`: it was refused or did not work. `changed_nothing`: it ran and the
   * page was as before. `same_result`: it ran again from the same page and
   * ended on the same page as the identical call before it. `same_answer`: a
   * look that answered on this page exactly as the identical look before it.
   */
  outcome: "failed" | "changed_nothing" | "same_result" | "same_answer";
  resultCode?: string;
  resultReason?: string;
};

/** One call as it ran, for the record. */
export type AutomationStudioLlmEvidenceCallOutcome = {
  callId: string;
  toolId: string;
  input: JsonObject;
  /** The page the call found and left, when either was observed. */
  stateBefore?: string | undefined;
  stateAfter?: string | undefined;
  effect: "observe" | "mutate";
  /** Whether the call proposed a step (a read the Flow could hold) rather than only looking. */
  proposes: boolean;
  effectApplied: boolean;
  /** The result was a refusal (`ok: false`). */
  refused: boolean;
  resultCode?: string | undefined;
  resultReason?: string | undefined;
  /** What the call answered, as the model was shown it: compared for a look only. */
  answer?: string | undefined;
};

/** The loop's record of what its calls did. */
export type AutomationStudioLlmEvidenceRepeatGuard = AutomationStudioLlmEvidenceSearchStreak & {
  /** A call reported the page as `state`. */
  seen(state: string): void;
  /** The page as the loop last saw it, when it has seen one since anything moved it unseen. */
  state(): string | undefined;
  /** Something moved the page without the loop seeing it (a dry run): nothing is refused until it is seen again. */
  moved(): void;
  /** A call ran, and this is how. */
  recorded(call: AutomationStudioLlmEvidenceCallOutcome): void;
  /** The earlier outcome that makes this call a repeat to refuse, or undefined when it may run; `at` is the page it would run on, when not the last one seen. */
  blocks(toolId: string, input: JsonObject, at?: string): AutomationStudioLlmEvidenceRepeatedOutcome | undefined;
  /** Decision `iteration` was refused as a repeat; returns how many decisions in a row have been, this one included. */
  refusedAgain(iteration: number): number;
};

export function automationStudioLlmEvidenceRepeatGuard(): AutomationStudioLlmEvidenceRepeatGuard {
  const outcomes = new Map<string, AutomationStudioLlmEvidenceRepeatedOutcome>();
  // Where each call that changed something left the page, and what each look answered, by its key.
  const endedOn = new Map<string, string>();
  const answered = new Map<string, string>();
  const searching = automationStudioLlmEvidenceSearchStreak();
  let latest: string | undefined;
  let refusedInARow = 0;
  let lastRefused = Number.NEGATIVE_INFINITY;
  const key = (toolId: string, input: JsonObject, state: string): string => `${toolId}\u0000${state}\u0000${automationStudioLlmEvidenceCanonicalJson(input)}`;
  return {
    ...searching,
    seen(state) {
      latest = state;
    },
    moved() {
      latest = undefined;
    },
    state() {
      return latest;
    },
    recorded(call) {
      const state = call.stateBefore ?? latest;
      if (call.stateAfter !== undefined) latest = call.stateAfter;
      const look = call.effect === "observe" && !call.proposes;
      // A look seen to leave the page as it found it is one more look in a row; anything else -- a look whose page was not seen
      // included, since nothing says it did not move -- ends the run (`./searching.ts`).
      if (look && state !== undefined && call.stateAfter === state) searching.looked({ callId: call.callId, toolId: call.toolId, input: call.input });
      else searching.acted();
      if (state === undefined) return;
      if (look) {
        const at = key(call.toolId, call.input, state);
        const answer = call.answer === undefined || call.refused ? undefined : createHash("sha256").update(call.answer).digest("hex");
        if (answer !== undefined && answered.get(at) === answer) outcomes.set(at, { callId: call.callId, outcome: "same_answer", ...(call.resultCode ? { resultCode: call.resultCode } : {}) });
        else if (answer !== undefined) answered.set(at, answer);
        return;
      }
      const failed = call.refused || (call.effect === "mutate" && !call.effectApplied);
      const changedNothing = !call.effectApplied || (call.stateAfter !== undefined && call.stateAfter === state);
      const retryLater = RETRY_LATER.test(`${call.resultCode ?? ""} ${call.resultReason ?? ""}`);
      const at = key(call.toolId, call.input, state);
      const sameResult = !failed && !changedNothing && call.stateAfter !== undefined && endedOn.get(at) === call.stateAfter;
      if (!failed && !changedNothing && call.stateAfter !== undefined) endedOn.set(at, call.stateAfter);
      if ((!failed && !changedNothing && !sameResult) || retryLater) {
        outcomes.delete(at);
        return;
      }
      outcomes.set(at, {
        callId: call.callId,
        outcome: failed ? "failed" : changedNothing ? "changed_nothing" : "same_result",
        ...(call.resultCode ? { resultCode: call.resultCode } : {}),
        ...(call.resultReason ? { resultReason: call.resultReason } : {})
      });
    },
    blocks(toolId, input, at) {
      const state = at ?? latest;
      return state === undefined ? undefined : outcomes.get(key(toolId, input, state));
    },
    refusedAgain(iteration) {
      // In a row means one decision after another: anything else decided between breaks the run.
      refusedInARow = iteration === lastRefused + 1 ? refusedInARow + 1 : 1;
      lastRefused = iteration;
      return refusedInARow;
    }
  };
}
