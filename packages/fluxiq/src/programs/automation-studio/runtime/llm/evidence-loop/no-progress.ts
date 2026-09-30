// Everything the loop remembers in order to tell working from repeating, and
// what it does when the answer is repeating.
//
// **Why this is a module rather than six variables in the loop.** It was six
// variables in the loop, smeared across five increment sites in a nine-hundred
// line file, and the consequence was not untidiness -- it was that nobody could
// see the guard was dead. `maxStepsWithoutProgress` defaulted to
// `min(24, maxIterations)`, and on a Lab creation run `maxIterations` *is* the
// call budget, so no run of repetition could ever reach it: every stall arrived
// as "the loop used its last call", and the only lever anyone reached for was a
// bigger budget, which buys more repetition. `run-mulum3x7-18ceeb75`
// (2026-09-28) spent 22 of its 34 paid decisions on answers it already held and
// wrote no Flow. `../../loop-limits/evidence-loop.ts` carries the numbers this
// is held to and how they were read off that trace.
//
// **What counts as a step without progress.** Not "the call failed" -- the
// question is what the loop *learned*, and there are four ways of learning
// nothing:
//
//   1. **Nothing happened.** No applied effect and an `ok: false` answer
//      (`../repeat-policy.ts`). A refused look and a refused action are both
//      this, and a call that did something is never this.
//   2. **The same answer again.** A call that changed nothing and handed back
//      the bytes its own tool handed back last time. An identical answer is by
//      definition a world that did not move, whatever the code on it says --
//      and this is the half that "did the call fail?" cannot see. The tail of
//      `run-mulum3x7-18ceeb75` was one inspection re-run four times through the
//      amendment path, which is deliberately never a repeat because the model
//      had just asked for it again (`./rerun-request.ts`), answering the same
//      8,960 bytes each time and clearing the count each time.
//   3. **A repeat the caller announces.** A caller that writes the repetition
//      onto its own answer -- which is right, since a model told the same words
//      again cannot tell a repeat from a new answer that agrees -- makes every
//      repeat differ from the last by the count it carries, and goes invisible
//      to (2). So the caller says so in `repeatedAnswer` and is believed
//      (`./tool-execution.ts`).
//   4. **Nothing asked.** A request the loop answered from what it held and had
//      already brought back, an amendment that applied nothing, an unusable
//      decision refused for issues already seen since the last tool result.
//
// A call that **applied** an effect was always progress, whatever it answered,
// because two presses of the same control answer `{ok:true}` twice and did two
// different things. That let a circling build run to the backstop: 24 of 57
// failed builds of 2026-09-29/30 ended at 64 decisions, `run-munwmfrs-b81bbc65`
// with 47 applied actions going open, add, open cart ten times over (audit A1,
// cause 2). So an applied call is progress only when it reaches a state the
// build has not been in (`stateAfter`, the digest of the page it left); a call
// that lands on a page already seen, by any tool, is a step without progress.
// A call with no digest is judged as before. What the model authors is
// progress too -- a step added to the Flow is the draft advancing -- and the
// loop clears the count for it wherever it happens. And a refused completion
// over the same proposed steps for the same issues is a step even after calls
// between, because refuse, act, refuse the same way again is the same place.
//
// **What the loop does about it, in order.** It redirects first and stops last.
// From `redirectAt` steps it tells the model plainly that it already holds this
// and what is still missing (`./stall-redirect.ts`), at no cost in calls or
// iterations, and again on every further step; only at `max` does it end the
// build. Five plain warnings, then the stop.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceStallRedirect, type AutomationStudioLlmEvidenceStallRedirectInput } from "./stall-redirect.ts";

export type AutomationStudioLlmEvidenceNoProgress = {
  /** Steps in a row that gave the loop nothing new. */
  readonly steps: number;
  /** True once the guard is reached, which is when the caller ends the loop. */
  reached(): boolean;
  /** The loop learned something, so every run it was counting starts again. */
  cleared(): void;
  /** One more step that gave nothing new, named by the tool that gave it where a tool did. */
  stepped(toolId?: string): void;
  /** The first step of a new run of them: refused for something not seen since the last tool result. */
  restarted(): void;
  /** Whether an unusable decision's issues have been seen since the last tool result. Records them. */
  sameIssuesAgain(issueSet: string): boolean;
  /** A request answered from what the loop held: counted only when the model could already see that result. */
  answeredFromEvidence(answeredByCallId: string, toolId: string): void;
  /** What the last decision was shown, so a result brought back into view is told from one that never left. */
  shown(callIds: readonly string[]): void;
  /**
   * Whether this answer is one its own tool already gave, or, for a call that
   * applied an effect, whether the state it left is one the build was already
   * in. Records both either way.
   */
  answerRepeats(input: { toolId: string; answer: string; repeatedAnswer?: number | undefined; mutated: boolean; stateAfter?: string | undefined }): boolean;
  /**
   * Whether a completion refused for `issueSet` over the draft `signature` was
   * refused the same way before, since the draft last changed. Records it.
   * Not reset by a tool call, only by the draft changing.
   */
  refusedAgain(signature: string, issueSet: string): boolean;
  /** Record an answer nothing asked for, such as the loop's free first look. */
  answered(toolId: string, answer: string): void;
  /**
   * The model tried to finish and was refused for these issues. Kept until it
   * tries again, not until the next tool call: the refusal is what the
   * redirection has to keep naming, and on `run-mulum3x7-18ceeb75` it was said
   * once at iteration 20 and then lost for the fourteen decisions that circled it.
   */
  completionRefused(issueCodes: readonly string[]): void;
  /** The last refusal to finish, until the model tries to finish again: what a continuation still owes. */
  readonly outstanding: readonly string[];
  /**
   * Say plainly that this is going nowhere, when saying so is due. `now` says
   * it below `redirectAt`: a request answered from memory a second time has
   * already shown what the count would take more steps to learn: run 6 of
   * 2026-09-28 asked the same look eleven times, answered alike each time.
   */
  redirect(iteration: number, now?: boolean): void;
};

export function automationStudioLlmEvidenceNoProgress(input: {
  max: number;
  redirectAt: number;
  /** What the redirection needs that this module does not hold: the draft, the attempts to finish, and what refused the last one. */
  facts(): Omit<AutomationStudioLlmEvidenceStallRedirectInput, "stepsWithoutProgress" | "maxStepsWithoutProgress" | "repeatingToolIds" | "lastIssueCodes">;
  /** Put the redirection in front of the model, or drop it when it will not fit. */
  show(iteration: number, note: JsonObject): void;
}): AutomationStudioLlmEvidenceNoProgress {
  let steps = 0;
  // The unusable issue sets seen since the last tool result; the tools whose
  // latest answer gave the loop nothing; the last answer each tool gave.
  const issueSets = new Set<string>();
  const repeating = new Set<string>();
  const lastAnswer = new Map<string, string>();
  // What the last decision was shown, and what has been brought back into view
  // since the last tool result. Asking once for a result that had left the
  // window is how the model sees it again, so only a second ask, or one for a
  // result it could already see, is a step without progress.
  let lastShown = new Set<string>();
  const broughtBack = new Set<string>();
  let lastRefusal: readonly string[] = [];
  // Every state a call left, for the life of the loop: a page seen once is
  // never new again. And the refusals seen per draft signature.
  const visited = new Set<string>();
  const refusals = new Map<string, Set<string>>();
  return {
    get steps() { return steps; },
    reached: () => steps >= input.max,
    cleared() {
      steps = 0;
      issueSets.clear();
      broughtBack.clear();
      repeating.clear();
    },
    stepped(toolId) {
      steps += 1;
      if (toolId !== undefined) repeating.add(toolId);
    },
    restarted() {
      steps = 1;
      repeating.clear();
    },
    sameIssuesAgain(issueSet) {
      if (issueSets.has(issueSet)) return true;
      issueSets.add(issueSet);
      return false;
    },
    answeredFromEvidence(answeredByCallId, toolId) {
      if (lastShown.has(answeredByCallId) || broughtBack.has(answeredByCallId)) {
        steps += 1;
        repeating.add(toolId);
      } else broughtBack.add(answeredByCallId);
    },
    shown(callIds) {
      lastShown = new Set(callIds);
    },
    answerRepeats({ toolId, answer, repeatedAnswer, mutated, stateAfter }) {
      const revisits = mutated && stateAfter !== undefined && visited.has(stateAfter);
      const repeats = revisits || (!mutated && (repeatedAnswer !== undefined || lastAnswer.get(toolId) === answer));
      lastAnswer.set(toolId, answer);
      if (stateAfter !== undefined) visited.add(stateAfter);
      return repeats;
    },
    refusedAgain(signature, issueSet) {
      const seen = refusals.get(signature);
      if (seen?.has(issueSet)) return true;
      refusals.clear();
      refusals.set(signature, new Set([...(seen ?? []), issueSet]));
      return false;
    },
    answered(toolId, answer) {
      lastAnswer.set(toolId, answer);
    },
    completionRefused(issueCodes) {
      lastRefusal = [...issueCodes];
    },
    get outstanding() { return [...lastRefusal]; },
    redirect(iteration, now) {
      if ((!now && steps < input.redirectAt) || steps >= input.max) return;
      input.show(iteration, automationStudioLlmEvidenceStallRedirect({
        stepsWithoutProgress: steps,
        maxStepsWithoutProgress: input.max,
        repeatingToolIds: [...repeating],
        lastIssueCodes: lastRefusal,
        ...input.facts()
      }));
    }
  };
}
