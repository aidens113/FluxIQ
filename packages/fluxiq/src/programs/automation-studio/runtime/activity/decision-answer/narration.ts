// The model's stated reason for a call, said only as far as what happened
// bears it out (t378).
//
// The observer said a decision's reason the moment `decide` returned, as the
// heading of the call it made. Two kinds of call made that a claim the chat
// then contradicted:
//
// - **A call sent again unchanged.** Lane C (`run-mv0fuotv-805294d7`, steps
//   0037-0042) showed "Resubmitting the corrected Flow: the repeat now sits on
//   the read step ..." three times over a script that had not changed by a
//   byte, each refused as a repeat before it ran.
// - **A candidate's own call.** Lane D (`run-mv0fuual-f9e6f089`) read "Testing,
//   which now confirms only requests with 5+ mutual friends" over a Flow whose
//   test confirmed all eight.
//
// So the reason of a call identical to one decided before, and of a
// candidate's saving or testing of its Flow, is held until Core has answered
// the call. A call that runs (an identical one may, once the page has changed)
// or a candidate call Core accepted or passed is said as the model said it; one
// never run, a refused submission and a failed test are said in Core's words of
// what happened instead. Every other reason is said at once, as before.

import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivityThought } from "../thought.ts";

type Call = { callId: string; toolId: string; value?: unknown };
type Thought = { phase: ClientGatewayActivityPhase; title: string; text: unknown };
type Held = { thought: Thought; call: Call; repeat: boolean };

/** A candidate build's own calls (`../candidate/result.ts`), read as plain strings so this module does not reach into the loop. */
const SUBMIT_CANDIDATE = "core.submit_candidate";
const TEST_CANDIDATE = "core.test_candidate";
/**
 * A part's own calls in a project build (`core.submit_subflow`, `core.test_subflow`),
 * and any other tool that saves or tests a builder's steps: read like the
 * candidate's (`../candidate/result.ts` reads every one, t649). A refused
 * subflow submission was narrated "Submitting the subflow with the store name
 * read via a list extraction" above its refusal (A8 frozen pair 3,
 * `run-mv9zn5ob-d929084d`, screenshot 00012).
 */
const SUBMIT = /^core.submit_[a-z_]+$/u;
const TEST = /^core.test_[a-z_]+$/u;
const own = (toolId: string): boolean => SUBMIT.test(toolId) || TEST.test(toolId);

/** What is said in place of the reason of a call sent again unchanged, which Core did not run. */
const AGAIN: Readonly<Record<string, string>> = Object.freeze({
  [SUBMIT_CANDIDATE]: "This is the same Flow it had already sent, unchanged, so it was not checked again.",
  [TEST_CANDIDATE]: "This asks for the same test again with nothing in the Flow changed, so it was not run again."
});
/** The same, for a part's own calls and any other that saves or tests a builder's steps. */
const AGAIN_PART = Object.freeze({
  submit: "These are the same steps it had already sent, unchanged, so they were not checked again.",
  test: "This asks for the same test again with nothing changed, so it was not run again."
});
const AGAIN_STEP = "This is exactly the step it had already tried, so it was not done again.";
/** Said of a call Core did not run for another reason. */
const NOT_RUN = "This was not done.";
/** Said of a candidate call Core answered with a refusal or a failed test, in place of the model's claim. */
const REFUSED: Readonly<Record<string, string>> = Object.freeze({
  [SUBMIT_CANDIDATE]: "The AI model sent a version of the Flow's steps, but it was refused, so it is not what the Flow does.",
  [TEST_CANDIDATE]: "The test of the whole Flow didn't go through, so it showed nothing about this version."
});
/** The same, for a part's own calls and any other that saves or tests a builder's steps. */
const REFUSED_PART = Object.freeze({
  submit: "The AI model sent a version of this part's steps, but it was refused, so it is not what the Flow does.",
  test: "The test of this part didn't go through, so it showed nothing about this version."
});
/** What `table` says of `toolId`, else the part's words for its kind; undefined for a tool that is neither. */
function wordsFor(table: Readonly<Record<string, string>>, part: Readonly<{ submit: string; test: string }>, toolId: string): string | undefined {
  return table[toolId] ?? (SUBMIT.test(toolId) ? part.submit : TEST.test(toolId) ? part.test : undefined);
}
/**
 * Said of a Flow Core refused as the one already saved, sent again unchanged
 * (`candidate.unchanged_submission`). "it was refused, so it is not what the
 * Flow does" said its steps were wrong, when they were the Flow's own steps
 * already (round 12, lane B build 2, `run-mv636xvb-e1426db1`, defect 4). Its
 * input may differ from the first sending in how it is spelled, so `AGAIN`,
 * which needs the same input, does not catch it.
 */
const UNCHANGED = "The AI model sent the same steps again, unchanged, so the Flow stays as it was.";
const TEST_FAILED = "The AI model expected this version to do what was asked, but the test showed it doesn't yet.";
/**
 * Said of a test that ran but whose result could not be confirmed either way
 * (t480): lane C round 11 (`run-mv5yaapy-8c34bf34`, trial 3) said the test
 * "showed it doesn't yet" when its two checks had disagreed, and the model then
 * tested the same version again.
 */
const TEST_UNCONFIRMED = "The AI model expected this version to do what was asked, and the test couldn't confirm whether it does.";

/**
 * A call's identity for "sent again unchanged": its tool and its input as
 * written. A decision's input is parsed JSON (`../../llm/evidence-loop-decision.ts`),
 * so it always writes back down.
 */
function keyOf(call: Call): string {
  return `${call.toolId} ${JSON.stringify(call.value) ?? ""}`;
}

/**
 * One loop's narration: `decided` as `decide` returns (says the reason now, or
 * holds it); `ran` as the held call starts; `ended` as a candidate's own call
 * ends -- `failed` when Core refused it (`declined`), refused it as the same
 * Flow sent again unchanged (`unchanged`), its test did not pass
 * (`failed`), or its test's result could not be confirmed either way
 * (`unconfirmed`); `unrun` when the loop moved on, or stalled, without running it.
 */
export function automationStudioActivityNarration(): {
  decided(thought: Thought, call: Call | undefined): void;
  ran(call: Call): void;
  ended(call: Call, failed: "declined" | "unchanged" | "failed" | "unconfirmed" | undefined): void;
  unrun(): void;
} {
  const decided = new Set<string>();
  let held: Held | undefined;
  // A decision that gave no reason has nothing to bear out or correct: its call's own card says it.
  const say = (thought: Thought, text?: string): void => {
    if (typeof thought.text !== "string" || !thought.text.trim()) return;
    emitAutomationStudioActivityThought({ phase: thought.phase, title: thought.title, text: text ?? thought.text });
  };
  const same = (call: Call): boolean => held !== undefined && held.call.callId === call.callId && held.call.toolId === call.toolId;
  return {
    decided: (thought, call) => {
      if (!call) return say(thought);
      const key = keyOf(call);
      const repeat = decided.has(key);
      decided.add(key);
      if (repeat || own(call.toolId)) held = { thought, call, repeat };
      else say(thought);
    },
    ran: (call) => {
      if (!held || !same(call) || own(call.toolId)) return;
      say(held.thought);
      held = undefined;
    },
    ended: (call, failed) => {
      if (!held || !same(call)) return;
      const { thought } = held;
      held = undefined;
      const tested = failed === "failed" ? TEST_FAILED : failed === "unconfirmed" ? TEST_UNCONFIRMED : undefined;
      say(thought, failed === undefined ? undefined : failed === "unchanged" ? UNCHANGED : tested !== undefined && TEST.test(call.toolId) ? tested : wordsFor(REFUSED, REFUSED_PART, call.toolId) ?? NOT_RUN);
    },
    unrun: () => {
      if (!held) return;
      const { thought, call, repeat } = held;
      held = undefined;
      say(thought, repeat ? wordsFor(AGAIN, AGAIN_PART, call.toolId) ?? AGAIN_STEP : NOT_RUN);
    }
  };
}
