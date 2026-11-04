// The ladder run over a recorded loop instead of a live one: what it would have
// done at each step, with the real repeat guard beside it.
//
// A recording cannot be refused, so the calls after a refusal are the ones the
// model really went on to make. Each is read as made. So a run's count says
// where the ladder would have stepped in, and how far it would have climbed had
// the model gone on as it did, which is the worst case. It answers for the new
// path, where a lasting act done again is refused; with no `loopSignal` such an
// act is only told. Reads events only, which
// its caller builds from step logs (the Lab's `packages/test-runner`): digests,
// tool ids and closed codes.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceRepeatGuard } from "../outcomes.ts";
import { automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopAttemptRecord } from "./attempt-record.ts";
import type { AutomationStudioLlmLoopAmendment, AutomationStudioLlmLoopCall, AutomationStudioLlmLoopPattern } from "./types.ts";
import { automationStudioLlmLoopWatch, type AutomationStudioLlmLoopTally } from "./watch.ts";

/** One recorded step of one loop, in order. */
export type AutomationStudioLlmLoopReplayEvent =
  | { kind: "call"; step: number; call: AutomationStudioLlmLoopCall; proposes: boolean; resultCode?: string | undefined; resultReason?: string | undefined; answerText?: string | undefined }
  /** The recording's own loop refused this call unrun. */
  | { kind: "guard_refused"; step: number; toolId: string; input: JsonObject; state?: string | undefined }
  /** The recording's own loop answered this call from memory. */
  | { kind: "answered"; step: number; toolId: string; input: JsonObject; state?: string | undefined }
  | { kind: "amended"; step: number; amendment: AutomationStudioLlmLoopAmendment }
  | { kind: "moved"; step: number };

/** One thing the ladder would have done. */
export type AutomationStudioLlmLoopFiring = {
  step: number;
  rung: "steer" | "refuse" | "change_approach" | "ask_person";
  pattern: AutomationStudioLlmLoopPattern;
  repeats: number;
  toolIds: readonly string[];
};

/** Replays one loop's events; `record` carries what was tried across the loops of one run. */
export function automationStudioLlmLoopReplay(events: readonly AutomationStudioLlmLoopReplayEvent[], options: { record?: AutomationStudioLlmLoopAttemptRecord } = {}): { firings: AutomationStudioLlmLoopFiring[]; tally: AutomationStudioLlmLoopTally } {
  const guard = automationStudioLlmEvidenceRepeatGuard();
  const watch = automationStudioLlmLoopWatch({ record: options.record ?? automationStudioLlmLoopAttemptRecord(), holds: (toolId, input, state) => guard.blocks(toolId, input, state) !== undefined, refuseActs: true });
  const firings: AutomationStudioLlmLoopFiring[] = [];
  const say = (step: number, rung: AutomationStudioLlmLoopFiring["rung"], finding: { pattern: AutomationStudioLlmLoopPattern; repeats: number; toolIds: readonly string[] }): void => {
    firings.push({ step, rung, pattern: finding.pattern, repeats: finding.repeats, toolIds: finding.toolIds });
  };
  const due = (step: number): void => {
    const signal = watch.due();
    if (!signal) return;
    say(step, signal.kind, signal);
    watch.signalAnswered();
  };
  for (const event of events) {
    if (event.kind === "moved") {
      watch.moved();
      guard.moved();
    } else if (event.kind === "guard_refused") {
      watch.guardRefused(event.toolId, event.input, undefined, event.state);
      say(event.step, "refuse", { pattern: "exact_repeat", repeats: 2, toolIds: [event.toolId] });
    } else if (event.kind === "answered") {
      watch.answered(event.toolId, event.input, undefined, event.state);
    } else if (event.kind === "amended") {
      const refused = watch.checkAmendment(event.amendment.key, event.amendment.draftBefore);
      if (refused) {
        say(event.step, "refuse", refused);
        due(event.step);
      }
      const finding = watch.amended(event.amendment);
      if (finding) say(event.step, "steer", finding);
    } else {
      const { call } = event;
      const state = call.stateBefore ?? guard.state();
      const blocked = state !== undefined && call.exempt !== true ? guard.blocks(call.toolId, call.input, state) : undefined;
      const refused = watch.check(call.toolId, call.input, call.context, state, () => call.targetWords);
      if (blocked) {
        watch.guardRefused(call.toolId, call.input, call.context, state);
        say(event.step, "refuse", { pattern: "exact_repeat", repeats: 2, toolIds: [call.toolId] });
      } else if (refused) {
        say(event.step, "refuse", refused);
        due(event.step);
      }
      guard.recorded({
        callId: call.callId, toolId: call.toolId, input: call.input, stateBefore: call.stateBefore, stateAfter: call.stateAfter, effect: call.effect, proposes: event.proposes,
        effectApplied: call.effectApplied, refused: call.refused, resultCode: event.resultCode, resultReason: event.resultReason, answer: event.answerText
      });
      const guarded = state !== undefined && guard.blocks(call.toolId, call.input, state) !== undefined;
      // A call the ladder or the guard would have refused was not the model's to make here: what it brought still counts, but it is not counted again.
      const finding = watch.ran(blocked || refused ? { ...call, exempt: true } : call, guarded);
      if (finding) say(event.step, "steer", finding);
    }
  }
  return { firings, tally: watch.tally() };
}
