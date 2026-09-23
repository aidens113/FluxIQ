// When a request may be made again.
//
// The loop refuses to run the same request twice over an unchanged world: it
// answers the repeat from the result it already holds, and a run of steps that
// give it nothing new ends it. That guard is what stops a build spinning, and
// it needs one idea to be got right -- what "unchanged" means.
//
// **Two counters, because two different questions are being asked.**
//
//   - `mutationEpoch` moves when an action **applied**. It is what makes a
//     repeated *action* a repeat: pressing the same control again with nothing
//     whatever having happened in between is the no-progress guard's whole job,
//     and it stays exactly as strict as it was.
//
//   - `attemptEpoch` moves whenever an action **ran at all**, applied or not.
//     It is what makes a repeated *look* a repeat.
//
// **Why a refused action counts as something having happened.** A refusal is
// the domain declining to act, and two things follow. The state may not be what
// it was -- a great many refusals are the domain saying the thing it was asked
// to act on is not there any more, which is a statement about the state having
// moved, not about it having held still. And the model has learned something it
// did not know, so looking again is the sensible answer to it rather than a
// repetition of an earlier look.
//
// Before this distinction existed, both were wrong at once. A refused action
// left `mutationEpoch` where it was, so the observation the model would have
// used to recover was withheld as "already observed"; asking for it anyway
// counted as a step without progress; and three of those ended the build
// `repeat_without_progress`, which was one of the live campaign's largest
// single failure causes. A worker improving the detail in rejection messages
// measured its own improvement being defeated by exactly this: two of its three
// live builds still ended that way.
//
// The loop's own duplicate check remains underneath both, so a look repeated
// word for word with nothing having happened is still answered rather than run.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "./evidence-loop.ts";

/**
 * What a request is, for the purpose of telling a repeat from a new question:
 * the tool, what it was asked, and the state of the world it was asked in.
 *
 * An action is keyed on what has changed and a look on what has happened, which
 * is the whole of the distinction this module exists for.
 */
export function automationStudioLlmEvidenceRequestSignature(input: {
  tool: AutomationStudioLlmEvidenceTool;
  mutationEpoch: number;
  attemptEpoch: number;
  input: JsonObject;
}): string {
  // A tool whose calls say for themselves what they did cannot be keyed on
  // what has *changed*, because whether this call will change anything is not
  // known until it has run. It is keyed on what has *happened*, which is the
  // looser of the two: a look repeated after a failed action is a new question,
  // and an action repeated after one is a retry, which is also a new question.
  const epoch = input.tool.perCallEffect === true ? input.attemptEpoch
    : input.tool.effect === "mutate" ? input.mutationEpoch : input.attemptEpoch;
  return canonicalJson([epoch, input.tool.toolId, input.input]);
}

/**
 * Whether an observation must wait for something to happen before it may be
 * made again.
 *
 * An initial observation is already the tool's observation for epoch zero, so
 * it is protected even when the domain omitted the redundant explicit repeat
 * policy, and allowed again only after an action has run.
 *
 * `mutable` is why this reads the whole offered list rather than one tool. The
 * rule only ever meant "not again until something happens", and where nothing
 * offered can do anything it means "never again" -- so a repair whose policy
 * withheld every mutating option looked once, for free, before it was asked
 * anything, and could not look a second time. That is not a gate the domain
 * asked for; it is a gate that appeared because a different gate closed. The
 * harness-option registry already drops an explicit `repeatPolicy` for exactly
 * this reason, and dropping it there was never enough, because an initial
 * observation carries the same rule implicitly. With no action reachable the
 * loop's own duplicate-request check is what bounds repeating: the same tool
 * with the same input is still refused, so looking again has to ask something
 * new.
 */
export function automationStudioLlmEvidenceLookNeedsAttempt(tool: AutomationStudioLlmEvidenceTool, mutable: boolean): boolean {
  // Only an observation waits. A tool that can act is not a look, and one whose
  // calls declare their own effect is not one either -- withholding it until
  // something has happened would shut the only way anything can happen, which
  // is exactly what it did the first time the library became one tool.
  if (tool.effect === "mutate" || tool.perCallEffect === true) return false;
  return mutable && (tool.repeatPolicy === "after_mutation" || tool.initialObservation !== undefined);
}

/** A stable rendering of a value, so two equal requests render identically. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
