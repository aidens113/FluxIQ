// A step the test from the start found missing, which the Flow did not need.
//
// **The failure this closes.** A build presses a cookie banner's "Accept"
// because the banner is up, and the model authors that press as an ordinary
// step. The test from the start resets by navigation only and keeps what the
// site remembers (decision D1, `./verify-only.ts`), so the banner the build
// answered is not shown again, and the press comes back `unreproducible`. That
// refused the Flow until the model marked the step optional, which needs one
// more paid decision. In t194's run `run-mup2u8o3-6697c4be` the build had no
// money left for it: a correct Flow was never proposed for want of one word.
//
// The draft could already say "do this only when it is there" (`./routing.ts`),
// and the draft entry tells the model to say it. This is the same answer, given
// by the replay itself when the replay has proved it.
//
// **When a step counts as only sometimes there.** All four must hold:
//
// - the replay ran the step again, and its target was not there:
//   `unreproducible`, never `failed`, `changed` or a step that was only checked;
// - the step does none of the acts the person asked for. Optional means the
//   Flow may skip it, and a step that does an act must never be skipped. That
//   is also what the instructed-acts check refuses (`step_is_optional`);
// - the step does not already say when it runs;
// - every later step of the same replay passed without it, or is itself one of
//   these, and at least one later step was run and replayed. The rest of the
//   Flow, run from the start, did not need it. A missing last step proves
//   nothing, because nothing after it was run.
//
// The last rule is what separates a banner the site remembers from a draft that
// lost its way. If an amendment withdrew the steps that reach a product page,
// the add-to-cart is absent too, and so is everything after it. Live runs 18,
// 21 and 33 shipped or nearly shipped such drafts when a missing step was waved
// through on being insisted on (`./dry-run.ts`). A missing step with a failing
// step after it is still refused, as before.
//
// **A step the host says answered an interruption.** The replay is one way to
// learn a step is only sometimes there; the press itself is another. A host
// that saw the press answer a layer standing in front of the page -- a dialog,
// a consent wall, a covering popup -- that was gone after it says so on the
// call (`./step.ts`, `interruption`). Such a step is optional from the moment
// it is drafted, under the same exclusions as above: it does none of the
// person's acts and says nothing else about when it runs. The draft is not
// rewritten; the routing the Flow is written from reads it
// (`../flow-bootstrap/authoring/draft-routing.ts`), and so does every
// judgement of the draft, through the steps the Flow would not always run
// (`./routing.ts`). Both read one predicate (`./interruption.ts`).

import type { AutomationStudioFlowDraftDryRun } from "./dry-run.ts";
import { automationStudioFlowDraftReplayOutcomeBlocks } from "./dry-run.ts";
import { automationStudioFlowDraftStepAnsweredInterruption } from "./interruption.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftStepId } from "./routing.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftExemptStepIds } from "./excused.ts";

/**
 * The ids of the steps one replay proved are only sometimes there, by the rules
 * in this file's header. Empty when the reset failed, because a replay that put
 * nothing back proved nothing about any step.
 */
export function automationStudioFlowDraftSometimesPresentStepIds(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  verdict: AutomationStudioFlowDraftDryRun;
}): ReadonlySet<string> {
  const found = new Set<string>();
  if (input.verdict.reset !== "ok") return found;
  const excused = automationStudioFlowDraftExemptStepIds(input.steps, input.verdict.outcomes);
  // Read from the last step back, so what the later steps did is known by the
  // time a step is reached. The first later step that did not pass ends it.
  let laterPassed = true;
  let laterReplayed = false;
  for (const outcome of [...input.verdict.outcomes].reverse()) {
    const id = outcome.stepId;
    if (!automationStudioFlowDraftReplayOutcomeBlocks(outcome)) {
      laterReplayed = true;
      continue;
    }
    if (id !== undefined && excused.has(id)) continue;
    const step = id === undefined ? undefined : automationStudioFlowDraftStepById(input.steps, id);
    const missing = outcome.status === "unreproducible" && outcome.mode === undefined;
    if (laterPassed && laterReplayed && missing && id !== undefined && step && !step.acts?.length && step.routing === undefined) {
      found.add(id);
      continue;
    }
    laterPassed = false;
  }
  return found;
}

/**
 * The ids of the proposed steps the host says answered an interruption and
 * that may therefore be skipped when it is not there: `interruption` set, no
 * act claimed, and no routing of their own -- the same exclusions as a step
 * the replay proved only sometimes there (`./interruption.ts`).
 */
export function automationStudioFlowDraftInterruptionStepIds(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string> {
  return new Set(steps.filter(automationStudioFlowDraftStepAnsweredInterruption).map(automationStudioFlowDraftStepId));
}
