// The model's decision about a caught repeat, carried out (user, 2026-11-19: "we should prompt the
// model saying its repeating and have the model itself decide what to do"). A steer told it what
// it repeated, how often and what came back each time (`./loop-check.ts`), and asked for one
// decision from a fixed set (`../loop-decision/`). Each is done here, and each goes on the
// attempt's record (`decisions`), into a step folder `NNNN-loop_decision` and into the chat:
//
//   continue          the incident ends: the repeat may run, and if it is caught again the model is
//                     asked again, with the count
//   change_approach   the repeat stays refused, and the model goes on the way it named
//   ask_person        the person is asked the model's own question through the loop's caller
//                     (`loopSignal`), which ends the round there and carries the attempt on
//   finish_with_best  its result goes to the completion check as any completion does
//
// The repeat guard's refusal of an exact repeat asks for the same decision
// (`./refusal-decision-ask.ts`): there `continue` lets the call run again once
// something on the page has changed, since the guard still refuses the same failed call on the
// same page.
//
// A decision that is not one of these, or lacks what it must carry, is answered with what is
// missing and the model is asked again. Nothing here is a new way to end: the round ends only where
// the person is asked, as a caller's signal always could, and the purse ends the rest.
//
// **Handed what ends a round, never importing it.** The completion handler and the stall live in
// the loop's module cycle; the loop hands them in (`steps`), so this module stays out of it.

import type { JsonObject } from "../../../core/index.ts";
import { emitAutomationStudioActivity } from "../../activity/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision, AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, automationStudioLlmLoopDecisionRead, type AutomationStudioLlmLoopDecision, type AutomationStudioLlmLoopDecisionOptions } from "../loop-decision/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES, type AutomationStudioLlmLoopFinding, type AutomationStudioLlmLoopSignal } from "../repeat-guard/index.ts";
import { automationStudioLlmStepLogEvent } from "../step-log/index.ts";
import { automationStudioLlmEvidenceLoopDecisionOptions } from "./decision-options.ts";
import { automationStudioLlmEvidenceLoopRaise } from "./loop-signal.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

export { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID } from "../loop-decision/index.ts";

/** What ends a round, handed in by the loop: a completion as the completion handler takes it, and the stall now. */
export type AutomationStudioLlmEvidenceModelDecisionSteps = {
  complete(result: JsonObject): Promise<Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }>>;
  stall(issueCode: string): AutomationStudioLlmEvidenceLoopResult;
};

type ToolCall = Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;

/** The codes a decision's answer comes back under. */
const CODES = Object.freeze({
  carried: "core.loop_decision.carried_out",
  invalid: "core.loop_decision.invalid",
  noPerson: "core.loop_decision.no_person",
  notYet: "core.loop_decision.ask_person_not_offered"
});

/** Why `ask_person` is not on offer yet (`../loop-decision/options.ts`), in the model's terms. */
const NOT_YET: Readonly<Record<Exclude<AutomationStudioLlmLoopDecisionOptions["askPerson"], "offered">, string>> = Object.freeze({
  after_change_approach: "Asking the person is a last resort, for after you have changed approach and the repeat still comes back, and you have not changed approach yet.",
  after_repeat_persists: "Asking the person is a last resort, for after you have changed approach and the repeat still comes back, and nothing has been repeated since you changed approach."
});

/** What the model is told once each decision is carried out. */
const CARRIED: Readonly<Record<AutomationStudioLlmLoopDecision["decision"], string>> = Object.freeze({
  continue: "The repeat may run again. If it is caught again, you will be asked again, with how many times it has been.",
  change_approach: "Take the way you named now. The call you repeated stays refused.",
  ask_person: "The person has been asked your question. Their answer comes to you as guidance; do not wait for it.",
  finish_with_best: "Your result is being checked as this attempt's result."
});

/** What `continue` is told about an exact repeat: the guard still refuses it until something changes. */
const CONTINUE_EXACT = "The same call on the same unchanged page is still refused, because it already failed or changed nothing here. Make it again once something on the page has changed, or decide again.";

/** Carries out a `core.loop_decision` call. Answers how the loop ends, or nothing where it goes on. */
export async function automationStudioLlmEvidenceHandleLoopDecision(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, call: ToolCall, steps: AutomationStudioLlmEvidenceModelDecisionSteps): Promise<AutomationStudioLlmEvidenceLoopResult | undefined> {
  context.counters.unusableInARow = 0;
  const read = automationStudioLlmLoopDecisionRead(call.input);
  if ("issue" in read) return answered(context, iteration, call, { ok: false, code: CODES.invalid, instruction: `${read.issue} Call ${AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID} again with one decision.` });
  // The repeat the model was told of: the watch's, or a completion refused again, which never passes the watch.
  const about = context.loops.standing() ?? context.loops.record.lastNoted;
  // What was on offer when the model was asked, before this decision changes it.
  const options = automationStudioLlmEvidenceLoopDecisionOptions(context);
  if (read.decision === "ask_person") {
    // A last resort (t969, restored by t1000): refused, with what is on offer, until the attempt changed approach and the repeat came back.
    if (options.askPerson !== "offered") return answered(context, iteration, call, { ok: false, code: CODES.notYet, offered: [...options.offered], instruction: `${NOT_YET[options.askPerson]} Give it a solid effort first: call ${AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID} again with one of: ${options.offered.join(", ")}.` });
    return asked(context, iteration, call, read.question, read.why, about, steps, options);
  }
  recorded(context, iteration, read, about, options);
  context.loops.decided(read.decision);
  answered(context, iteration, call, { ok: true, code: CODES.carried, decision: read.decision, instruction: read.decision === "continue" && about?.pattern === "exact_repeat" ? CONTINUE_EXACT : CARRIED[read.decision] });
  if (read.decision !== "finish_with_best") return undefined;
  const next = await steps.complete(read.result);
  return next.kind === "end" ? next.result : undefined;
}

/** The person is asked the model's own question through the loop's caller, which ends the round there; with no caller, nobody can be asked and the model chooses again. */
function asked(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, call: ToolCall, question: string, why: string, about: AutomationStudioLlmLoopFinding | undefined, steps: AutomationStudioLlmEvidenceModelDecisionSteps, options: AutomationStudioLlmLoopDecisionOptions): AutomationStudioLlmEvidenceLoopResult | undefined {
  if (!context.input.loopSignal) return answered(context, iteration, call, { ok: false, code: CODES.noPerson, instruction: `No person can be asked from here. Call ${AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID} again with another decision.` });
  recorded(context, iteration, { decision: "ask_person", question, why }, about, options);
  answered(context, iteration, call, { ok: true, code: CODES.carried, decision: "ask_person", instruction: CARRIED.ask_person });
  const finding = about ?? { pattern: "exact_repeat", repeats: 0, toolIds: [], unchanged: [] };
  const signal: AutomationStudioLlmLoopSignal = { ...finding, kind: "ask_person", approaches: context.loops.record.approaches, question };
  if (automationStudioLlmEvidenceLoopRaise(context, iteration, signal) === "continue") return undefined;
  return steps.stall(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.ask_person);
}

/** The decision's answer, in front of the model under its own call, and its row. */
function answered(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, call: ToolCall, value: JsonObject): undefined {
  context.accountEvidence(value);
  context.evidence.push({ callId: call.callId, toolId: AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, value });
  context.recordRow({ iteration, decision: "tool_call", toolId: AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, resultCode: String(value.code), ...(typeof value.decision === "string" ? { resultReason: value.decision } : {}) });
  return undefined;
}

/** On the attempt's record, in a step folder and in the chat. */
function recorded(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, decision: AutomationStudioLlmLoopDecision, about: AutomationStudioLlmLoopFinding | undefined, options: AutomationStudioLlmLoopDecisionOptions): void {
  context.loops.record.decided({ decision: decision.decision, ...(about ? { pattern: about.pattern, repeats: about.repeats } : {}) });
  const words = wordsOf(decision);
  const text = `FluxIQ noticed it was repeating itself and decided ${CHAT[decision.decision]}${words ? `: ${words}` : "."}`;
  emitAutomationStudioActivity({ phase: "thinking", label: "Decided how to go on", detail: { kind: "thought", title: "Decided how to go on", text, status: "succeeded" } });
  stepFolder(iteration, decision.decision, words, about, options);
}

/** How the chat says each decision, before the model's own words for it. */
const CHAT: Readonly<Record<AutomationStudioLlmLoopDecision["decision"], string>> = Object.freeze({
  continue: "that repeating is right here",
  change_approach: "to try a different way",
  ask_person: "to ask you",
  finish_with_best: "to answer with what it has, which is checked now"
});

function wordsOf(decision: AutomationStudioLlmLoopDecision): string | undefined {
  if (decision.decision === "continue") return decision.why;
  if (decision.decision === "change_approach") return decision.approach;
  if (decision.decision === "ask_person") return decision.question;
  return undefined;
}

function stepFolder(iteration: number, decision: AutomationStudioLlmLoopDecision["decision"], words: string | undefined, about: AutomationStudioLlmLoopFinding | undefined, options: AutomationStudioLlmLoopDecisionOptions): void {
  const summary = `${decision}${about ? ` on ${about.pattern} x${about.repeats}` : ""}`;
  automationStudioLlmStepLogEvent("loop_decision", { iteration, decision, pattern: about?.pattern ?? null, repeats: about?.repeats ?? null, toolIds: [...(about?.toolIds ?? [])], words: words ?? null, offered: [...options.offered], askPerson: options.askPerson, approachesChanged: options.approachesChanged }, summary, AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID);
}
