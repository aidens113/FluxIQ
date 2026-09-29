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
// A call that **applied** an effect is always progress, whatever it answered:
// two presses of the same control answer `{ok:true}` twice and did two
// different things.
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
  /** Whether this answer is one its own tool already gave. Records it either way. */
  answerRepeats(input: { toolId: string; answer: string; repeatedAnswer?: number | undefined; mutated: boolean }): boolean;
  /** Record an answer nothing asked for, such as the loop's free first look. */
  answered(toolId: string, answer: string): void;
  /**
   * The model tried to finish and was refused for these issues. Kept until it
   * tries again, not until the next tool call: the refusal is what the
   * redirection has to keep naming, and on `run-mulum3x7-18ceeb75` it was said
   * once at iteration 20 and then lost for the fourteen decisions that circled it.
   */
  completionRefused(issueCodes: readonly string[]): void;
  /** Say plainly that this is going nowhere, when saying so is due. */
  redirect(iteration: number): void;
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
    answerRepeats({ toolId, answer, repeatedAnswer, mutated }) {
      const repeats = !mutated && (repeatedAnswer !== undefined || lastAnswer.get(toolId) === answer);
      lastAnswer.set(toolId, answer);
      return repeats;
    },
    answered(toolId, answer) {
      lastAnswer.set(toolId, answer);
    },
    completionRefused(issueCodes) {
      lastRefusal = [...issueCodes];
    },
    redirect(iteration) {
      if (steps < input.redirectAt || steps >= input.max) return;
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
