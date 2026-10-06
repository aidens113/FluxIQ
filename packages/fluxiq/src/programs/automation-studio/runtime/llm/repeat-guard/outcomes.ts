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
// **A call that runs the draft is keyed on the draft too.** In
// `run-musr9pv3-f4bf6256` (t195) the model sent `core.run_flow {from: 15, to: 16}`
// about twenty times from step 0066 to 0178, between unchanged `complete`s the
// plan check refused, on one unchanged draft and page: every run passed with
// the same answer, and round 0 ran to its 64-decision bound. Nothing here
// refused it: the part run reported no page states, and it counted as applied
// because the read it replayed did -- though it pressed nothing, its press only
// checked. A part run now applies only what its changing steps did
// (`../node-tools/run-flow-part.ts`), and a tool whose answer is the draft run
// again (`draftOf`) is keyed on the draft's Flow signature as well as the page
// (`./draft-key.ts`): the same call on the same draft and page that changed
// nothing (`same_draft`) is refused unrun, and the model is told to change the
// draft first. Once the draft changes it is a new call, so the first run of a
// part, and a run after an amendment, run as they always did. An unchanged
// completion refused again over the same draft counts in the same run of
// refusals (`../evidence-loop.ts`, `unusable`), so that run stalls after two
// refused part runs, not twenty.
//
// **A rerun is keyed where it runs.** A rerun runs from the page its step
// started on (`../node-tools/step-place.ts`), not from the page the last call
// left, so it is checked against that page (`blocks(..., at)`).
//
// **A call that failed on a handle not yet shown runs again once handles were
// shown.** Lane t194's run-musp39u8 (debug cause C-B1) read a list by an
// extraction handle no detect had minted yet: `handle_not_in_packet`. The
// detect that minted it ran next, on the same page, and the identical read was
// then refused four times as "failed before" and the round stalled. The
// failure was about the evidence the model had, not the call: a failure whose
// reason says the handle it names was never shown (`HANDLE_UNSHOWN`) is lifted
// on that page as soon as a later call there ran and answered something new --
// a look, a detect, a find, anything not refused and not answering exactly as
// before. Until then it is refused like any failure, and the note says the
// handle was never shown and which call shows it (`./feedback.ts`). Any other
// failure stays refused while the page is unchanged, looks or not.
//
// **A rerun that changed nothing is keyed on the decision and the draft, not
// the page.** Live run `run-muwaobm2-882cadd9` (lane A, iterations 17-24) sent
// one `amend_draft` -- step 14 `rerun` as the Spain press beside `add` or
// `keep` act a1.origin -- six times. Each rerun reset the page and replayed six
// clicks before its press, put an identical step back with the same result,
// and left the Flow's signature (`./draft-key.ts`) as it was; the act part was
// refused `act_already_named` each time. Nothing here refused one, for three
// reasons: the first identical call from a page always runs and only the third
// is refused (`same_result` needs the second to end where the first did);
// every reset reloads the page, and the web domain's state digest moved with
// each reload (the rerun answers differ only in `[frame 10]`, `[frame 11]`,
// `[frame 12]`: the digest includes each element's frame id), so no rerun ever
// started on a page already keyed; and the loop's own check of the rerun's
// call looked at the page the last press left, not at the rerun's place. So
// once a decision that ran a rerun has settled, what it came to is recorded
// here by the decision's signature and the draft it left (`amended`): a rerun
// that took its step's place and changed neither the Flow nor what the step
// observed changed nothing, and one that ran and did not work left the Flow as
// it was: the same reset and replay on the same draft fails the same way, as
// an identical failed call on the same page does. The identical decision sent
// on that same draft is refused before anything of it runs -- no reset, no
// replay, no press
// (`amendmentBlocks`, `same_amendment`) -- and counted in the same run of
// refusals as any repeat (`../decision-handlers/amendment.ts`). Once the draft
// changes it is a new decision and runs, as a call does once its page changes.
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

/**
 * Reasons that say the call named a handle no call had shown or minted yet on
 * this page: the call may work once one has. A handle that was shown and has
 * since gone (`handle_no_longer_on_page`, `stale_handle`) is not one of them.
 */
const HANDLE_UNSHOWN = /^(?:handle[_-]?not[_-]?in[_-]?packet|handle[_-]?not[_-]?issued|unknown[_-]?handle)$/iu;

/** How an earlier call went, as the model is told it. */
export type AutomationStudioLlmEvidenceRepeatedOutcome = {
  /** The call that already did it. */
  callId: string;
  /**
   * `failed`: it was refused or did not work. `changed_nothing`: it ran and the
   * page was as before. `same_result`: it ran again from the same page and
   * ended on the same page as the identical call before it. `same_answer`: a
   * look that answered on this page exactly as the identical look before it.
   * `same_draft`: a call that runs the draft ran on this same draft and page
   * and changed nothing (`core.run_flow`, run-musr9pv3-f4bf6256).
   * `same_amendment`: the same `amend_draft` decision ran its rerun on this same
   * draft and changed nothing (`run-muwaobm2-882cadd9`), or its rerun did not
   * work (`rerunFailed`); `callId` is that rerun's call.
   */
  outcome: "failed" | "changed_nothing" | "same_result" | "same_answer" | "same_draft" | "same_amendment";
  resultCode?: string;
  resultReason?: string;
  /** It failed only because a handle it names was never shown on this page; a later call that shows handles lifts it. */
  handleUnshown?: true;
  /** `same_amendment` only: the decision's rerun ran and did not work, rather than putting back an identical step. */
  rerunFailed?: true;
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
  /**
   * An `amend_draft` decision whose rerun ran has settled: `signature` is the
   * decision's (`../decision-context/signature.ts`), `draft` the draft's key
   * after it (`./draft-key.ts`), `changed` whether it changed the Flow or what
   * the step observed, `failed` whether the rerun did not work (and so left the
   * Flow as it was), and `callId` the rerun's call.
   */
  amended(outcome: { signature: string; draft: string; changed: boolean; failed?: boolean | undefined; callId: string; resultCode?: string | undefined; resultReason?: string | undefined }): void;
  /** The earlier outcome that makes this `amend_draft` decision, on the draft whose key is `draft`, a repeat to refuse before any of it runs. */
  amendmentBlocks(signature: string, draft: string): AutomationStudioLlmEvidenceRepeatedOutcome | undefined;
};

/**
 * `draftOf` names the draft, by its key (`./draft-key.ts`), for a tool whose
 * answer is the draft run again (`core.run_flow`), and nothing for any other:
 * such a call is keyed on the draft it ran on as well as its page (see the header).
 */
export function automationStudioLlmEvidenceRepeatGuard(options: { draftOf?: ((toolId: string) => string | undefined) | undefined } = {}): AutomationStudioLlmEvidenceRepeatGuard {
  const outcomes = new Map<string, AutomationStudioLlmEvidenceRepeatedOutcome>();
  // Where each call that changed something left the page, and what each look answered, by its key.
  const endedOn = new Map<string, string>();
  const answered = new Map<string, string>();
  // Failures on a handle not yet shown, by key, with the page each is on: lifted when a later call there shows something new.
  const unshown = new Map<string, string>();
  const showed = (state: string): void => {
    for (const [at, on] of unshown) {
      if (on !== state) continue;
      unshown.delete(at);
      if (outcomes.get(at)?.handleUnshown) outcomes.delete(at);
    }
  };
  const searching = automationStudioLlmEvidenceSearchStreak();
  let latest: string | undefined;
  let refusedInARow = 0;
  let lastRefused = Number.NEGATIVE_INFINITY;
  const key = (toolId: string, input: JsonObject, state: string): string => `${toolId}\u0000${state}\u0000${options.draftOf?.(toolId) ?? ""}\u0000${automationStudioLlmEvidenceCanonicalJson(input)}`;
  // A decision is keyed on the draft it was sent on, which a call key never starts with (a call's starts with its tool id, never empty).
  const amendmentKey = (signature: string, draft: string): string => `\u0000amend_draft\u0000${draft}\u0000${signature}`;
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
        else if (answer !== undefined) {
          answered.set(at, answer);
          showed(state);
        }
        return;
      }
      // A part run that acted on nothing did not fail: it ran the draft and changed nothing (`same_draft`).
      const runsDraft = options.draftOf?.(call.toolId) !== undefined;
      const failed = call.refused || (call.effect === "mutate" && !call.effectApplied && !runsDraft);
      const changedNothing = !call.effectApplied || (call.stateAfter !== undefined && call.stateAfter === state);
      const retryLater = RETRY_LATER.test(`${call.resultCode ?? ""} ${call.resultReason ?? ""}`);
      const at = key(call.toolId, call.input, state);
      if (!call.refused) showed(state);
      const sameResult = !failed && !changedNothing && call.stateAfter !== undefined && endedOn.get(at) === call.stateAfter;
      if (!failed && !changedNothing && call.stateAfter !== undefined) endedOn.set(at, call.stateAfter);
      if ((!failed && !changedNothing && !sameResult) || retryLater) {
        outcomes.delete(at);
        return;
      }
      const handleUnshown = failed && HANDLE_UNSHOWN.test(call.resultReason ?? "");
      if (handleUnshown) unshown.set(at, state);
      else unshown.delete(at);
      outcomes.set(at, {
        callId: call.callId,
        outcome: failed ? "failed" : !changedNothing ? "same_result" : runsDraft ? "same_draft" : "changed_nothing",
        ...(call.resultCode ? { resultCode: call.resultCode } : {}),
        ...(call.resultReason ? { resultReason: call.resultReason } : {}),
        ...(handleUnshown ? { handleUnshown: true as const } : {})
      });
    },
    blocks(toolId, input, at) {
      const state = at ?? latest;
      return state === undefined ? undefined : outcomes.get(key(toolId, input, state));
    },
    amended(outcome) {
      const at = amendmentKey(outcome.signature, outcome.draft);
      // As for a call: one that changed something, or whose outcome says to wait and try again, is not a repeat to refuse.
      if (outcome.changed || RETRY_LATER.test(`${outcome.resultCode ?? ""} ${outcome.resultReason ?? ""}`)) {
        outcomes.delete(at);
        return;
      }
      outcomes.set(at, {
        callId: outcome.callId,
        outcome: "same_amendment",
        ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}),
        ...(outcome.resultReason ? { resultReason: outcome.resultReason } : {}),
        ...(outcome.failed ? { rerunFailed: true as const } : {})
      });
    },
    amendmentBlocks(signature, draft) {
      return outcomes.get(amendmentKey(signature, draft));
    },
    refusedAgain(iteration) {
      // In a row means one decision after another: anything else decided between breaks the run.
      refusedInARow = iteration === lastRefused + 1 ? refusedInARow + 1 : 1;
      lastRefused = iteration;
      return refusedInARow;
    }
  };
}
