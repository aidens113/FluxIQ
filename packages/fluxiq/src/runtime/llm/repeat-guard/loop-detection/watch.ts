// The ladder: what one loop does about what the detector finds, each step only
// if the last did not work.
//
// 1. **Steer.** The first finding of an incident: the model is told, and the
//    person sees it as a step. The call that showed it has already run.
// 2. **Refuse.** A further finding, or the next call that continues the one it
//    was about, is refused before it runs, through the same path as the repeat
//    guard's refusals (`../../decision-handlers/refused-repeat.ts`), so it counts
//    in the same run of refusals.
// 3. **Change approach**, 4. **ask the person.** Both need a caller that can
//    start a fresh context or wait for a person, so each is only a typed signal
//    (`./types.ts`), raised when refusing has not worked. Every fresh approach
//    goes on the attempt's record, and past
//    `AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING` the signal is
//    `ask_person`.
//
// **A lasting act done again is refused only on the new path.** A caller with no
// `loopSignal` has no way to act on what a refusal leads to, and a task may really
// ask for repeats, so there it is told and never refused (`refuseActs`). On the new
// path it is refused, up to what the caller's `askedRepeats` says the task asks for.
//
// Progress ends the incident: the ladder starts again from nothing. An act that
// lands, a row or a page never seen, and a draft never stood at are what tell
// working from repeating, so a run that recovers is treated as one that recovered.
//
// The ladder adds refusals and notes and never removes one. It gives nothing
// leave to run that would not have run, so no permission gate, retry or lasting
// act's refusal is touched: anything it lets through goes on to all of them.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopAttemptRecord } from "./attempt-record.ts";
import { automationStudioLlmLoopDetector } from "./detector.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING, AUTOMATION_STUDIO_LLM_LOOP_REFUSALS_BEFORE_CHANGE } from "./limits.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_PATTERNS, type AutomationStudioLlmLoopAmendment, type AutomationStudioLlmLoopAskedRepeats, type AutomationStudioLlmLoopCall, type AutomationStudioLlmLoopFinding, type AutomationStudioLlmLoopPattern, type AutomationStudioLlmLoopSignal } from "./types.ts";

/** What the ladder has done so far in one loop: the count the run reports, by pattern. */
export type AutomationStudioLlmLoopTally = {
  /** Incidents caught, by the pattern that first showed each. */
  caught: Record<AutomationStudioLlmLoopPattern, number>;
  steered: number;
  refused: number;
  changeApproach: number;
  askPerson: number;
};

export type AutomationStudioLlmLoopWatch = {
  /** Before a call runs: the finding to refuse it on, or nothing. */
  check(toolId: string, input: JsonObject, context: string | undefined, state: string | undefined, targetWords?: () => string | undefined): AutomationStudioLlmLoopFinding | undefined;
  /** Before an edit runs: the finding to refuse it on, or nothing. */
  checkAmendment(key: string, draftBefore: string | undefined): AutomationStudioLlmLoopFinding | undefined;
  /** A call ran: the finding to steer on, or nothing. */
  ran(call: AutomationStudioLlmLoopCall, guarded?: boolean): AutomationStudioLlmLoopFinding | undefined;
  /** An edit settled: the finding to steer on, or nothing. */
  amended(amendment: AutomationStudioLlmLoopAmendment): AutomationStudioLlmLoopFinding | undefined;
  /** The repeat guard refused this call unrun: its own first case. */
  guardRefused(toolId: string, input: JsonObject, context: string | undefined, state: string | undefined): void;
  /** The loop answered a call from memory: one more without progress. */
  answered(toolId: string, input: JsonObject, context: string | undefined, state: string | undefined): void;
  moved(): void;
  /** Refusing has not worked, whether or not they came in a row: the signal now due, or nothing. */
  due(): AutomationStudioLlmLoopSignal | undefined;
  /** The round is about to stall on refusals in a row: the signal for it, always. */
  stalling(): AutomationStudioLlmLoopSignal;
  /** The caller went on after a signal: refusals count from nothing, the ladder stays where it is. */
  signalAnswered(): void;
  /** Whether an incident stands: a steer given still applies. */
  engaged(): boolean;
  tally(): AutomationStudioLlmLoopTally;
  readonly record: AutomationStudioLlmLoopAttemptRecord;
};

export function automationStudioLlmLoopWatch(options: {
  record?: AutomationStudioLlmLoopAttemptRecord | undefined;
  holds?: ((toolId: string, input: JsonObject, state: string) => boolean) | undefined;
  /** Whether a lasting act done again is refused: on the new path, never with no `loopSignal`. */
  refuseActs?: boolean | undefined;
  askedRepeats?: AutomationStudioLlmLoopAskedRepeats | undefined;
} = {}): AutomationStudioLlmLoopWatch {
  const record = options.record ?? automationStudioLlmLoopAttemptRecord();
  const detector = automationStudioLlmLoopDetector({ record, holds: options.holds, askedRepeats: options.askedRepeats, judgesWithNoPage: options.refuseActs });
  const caught = Object.fromEntries(AUTOMATION_STUDIO_LLM_LOOP_PATTERNS.map((pattern) => [pattern, 0])) as Record<AutomationStudioLlmLoopPattern, number>;
  const tally = { steered: 0, refused: 0, changeApproach: 0, askPerson: 0 };
  // `clear`: nothing standing. `steered`: told, and it has not yet been seen whether that worked. `refusing`: it did not.
  let rung: "clear" | "steered" | "refusing" = "clear";
  let strikes = 0;
  let standing: AutomationStudioLlmLoopFinding | undefined;
  // The guard has refused since the last progress: one incident of its own, which the guard's own run of refusals stalls as it always has.
  let guardStanding = false;

  const found = (finding: AutomationStudioLlmLoopFinding): AutomationStudioLlmLoopFinding | undefined => {
    standing = finding;
    // A lasting act done again is always told, wherever the ladder stands.
    if (finding.pattern === "same_act") {
      caught.same_act += 1;
      if (rung === "clear") rung = "steered";
      tally.steered += 1;
      return finding;
    }
    if (rung === "clear") {
      caught[finding.pattern] += 1;
      rung = "steered";
      tally.steered += 1;
      return finding;
    }
    if (rung === "steered") {
      rung = "refusing";
      tally.steered += 1;
      return finding;
    }
    // Refusing has not stopped it: this was another way round, and it counts as much as a refusal does.
    strikes += 1;
    return undefined;
  };
  const refusing = (finding: AutomationStudioLlmLoopFinding): AutomationStudioLlmLoopFinding => {
    standing = finding;
    rung = "refusing";
    strikes += 1;
    tally.refused += 1;
    return finding;
  };
  const cleared = (): void => {
    rung = "clear";
    strikes = 0;
    standing = undefined;
    guardStanding = false;
  };
  const signal = (finding: AutomationStudioLlmLoopFinding): AutomationStudioLlmLoopSignal => {
    if (record.approaches >= AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING) {
      tally.askPerson += 1;
      return { ...finding, kind: "ask_person", approaches: record.approaches };
    }
    tally.changeApproach += 1;
    return { ...finding, kind: "change_approach", approaches: record.approachChanged() };
  };
  return {
    record,
    check(toolId, input, context, state, targetWords) {
      // A lasting act already told about is refused whatever else has moved: progress elsewhere does not make doing it again new work.
      const act = options.refuseActs === true ? detector.actRepeats(toolId, input, context, targetWords ?? (() => undefined)) : undefined;
      if (act) return refusing(act);
      const repeating = detector.repeating(toolId, input, context, state);
      return repeating && rung !== "clear" ? refusing(repeating) : undefined;
    },
    checkAmendment(key, draftBefore) {
      const repeating = detector.amendmentRepeats(key, draftBefore);
      return repeating && rung !== "clear" ? refusing(repeating) : undefined;
    },
    ran(call, guarded) {
      const { finding, progressed } = detector.ran(call, guarded);
      if (progressed && !finding) cleared();
      return finding ? found(finding) : undefined;
    },
    amended(amendment) {
      const { finding, progressed } = detector.amended(amendment);
      if (progressed && !finding) cleared();
      return finding ? found(finding) : undefined;
    },
    guardRefused(toolId, input, context, state) {
      detector.unrun(toolId, input, context, state);
      if (!guardStanding) caught.exact_repeat += 1;
      guardStanding = true;
      tally.refused += 1;
      // Refused again while an incident is being refused: another way round it, as a further finding is (t870: a read asked again between two repeats).
      if (rung === "refusing") strikes += 1;
    },
    answered(toolId, input, context, state) {
      detector.unrun(toolId, input, context, state, true);
    },
    moved() {
      detector.moved();
      cleared();
    },
    due() {
      if (strikes < AUTOMATION_STUDIO_LLM_LOOP_REFUSALS_BEFORE_CHANGE || !standing) return undefined;
      return signal(standing);
    },
    stalling() {
      return signal(standing ?? { pattern: "exact_repeat", repeats: AUTOMATION_STUDIO_LLM_LOOP_REFUSALS_BEFORE_CHANGE, toolIds: [], unchanged: ["page"] });
    },
    signalAnswered() {
      strikes = 0;
    },
    engaged: () => rung !== "clear",
    tally: () => ({ caught: { ...caught }, ...tally })
  };
}
