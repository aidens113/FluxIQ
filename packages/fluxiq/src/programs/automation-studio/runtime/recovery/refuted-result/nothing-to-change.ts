// A re-author that finds the Flow already does what was asked, and ends saying so.
//
// **The finding (W17, live run `run-muw5zv4m-52d83027`, Stage 6 cause 2).** The
// post-run check refuted a cart the Flow had built exactly as asked. The
// re-author was routed and spent 46 decisions ($0.0725) trying to point step 9
// at a search link that does not exist, looping on rerun, `changes_nothing` and
// `target_not_found` over four rounds until its budget ran out. It never
// completed and never could have ended honestly: the brief said "change the
// Flow", and a completion of the Flow unchanged would have been tested from its
// start, judged, proposed as an empty edit, held, and run again from the start
// under a second post-run check.
//
// **The ending reuses a decision the model already has.** A re-author that
// completes with its draft exactly as it was seeded -- the same Flow signature
// (`../../flow-draft/flow-signature.ts`), the rule the unchanged-completion
// refusal already uses -- and says so, `nothingToChange: true` in its
// completion's result, ends saying the Flow needs no change; its completion
// summary is its reason. No new tool. The word is required, not inferred: a
// completion of the unchanged seed is also what a loop's wrap-up forces when
// it offers no more calls, and what a model that only reran carried steps
// sends, and neither is a judgement that the check was wrong (the service's
// `repair-purse-chain` test's provider is the first).
//
// **What Core does with it.** The build's completion check asks this watch
// before anything else is checked or tested (`runtime/service.ts`, the build's
// `checkCompletion`). When the watch recognises the ending it keeps the reason
// and hands back an error, which the check throws: the loop propagates a
// thrown check as a decision error, so the build stops there -- no test, no
// judge, no further decision. The re-author then reads the watch instead of the
// failure (`../../service/runtime-adaptation/reauthor-build.ts`), approves and
// applies nothing, and records `nothing_to_change` with the reason on the run
// (`./reauthor.ts`). Nothing being held, nothing is re-run.
//
// **Only for the wrong-answer route.** The watch is made by that route alone
// (`../../service/runtime-adaptation/refuted-result-port.ts`). A step that
// failed is not a Flow that needs no change, so the step-failure re-author has
// no watch and completes as before.
//
// **The reason is screened like the brief's other text**: a credential-shaped
// summary is withheld whole, and a locator-shaped run inside it is rewritten,
// both named in `reasonWithheld` (the rule `result-verification/repair-directive.ts`
// applies to the check's own reading).

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** The outcome a re-author that found nothing to change is recorded under (`resultReauthor.outcome`). */
export const AUTOMATION_STUDIO_REAUTHOR_NOTHING_TO_CHANGE = "nothing_to_change";

/** The member of a completion's result by which a re-author says the Flow needs no change. */
export const AUTOMATION_STUDIO_REAUTHOR_NOTHING_TO_CHANGE_FIELD = "nothingToChange";

/** What the re-author said: its reason, screened, and whether anything of it was withheld. */
export type AutomationStudioReauthorNothingToChange = { reason?: string; reasonWithheld?: true };

/** One re-author build's watch for the ending. */
export type AutomationStudioReauthorEndingWatch = {
  /**
   * Asked by the build's completion check, before it checks or tests anything.
   * Answers the error the check throws to end the build, when the completion
   * says `nothingToChange: true` and its draft is the seed unchanged; nothing
   * otherwise.
   */
  completed(input: {
    /** The Flow the re-author started from: its draft as seeded. */
    seed: readonly AutomationStudioFlowDraftStep[] | undefined;
    /** The draft the model completed. */
    steps: readonly AutomationStudioFlowDraftStep[];
    /** The completion's own result, whose `summary` is the reason. */
    result: JsonObject;
  }): Error | undefined;
  /** What the re-author said, once it ended so; nothing before. */
  said(): AutomationStudioReauthorNothingToChange | undefined;
};

/** A fresh watch, for one build. */
export function automationStudioReauthorEndingWatch(): AutomationStudioReauthorEndingWatch {
  let said: AutomationStudioReauthorNothingToChange | undefined;
  return {
    completed({ seed, steps, result }) {
      if (result[AUTOMATION_STUDIO_REAUTHOR_NOTHING_TO_CHANGE_FIELD] !== true) return undefined;
      if (!seed?.length || !steps.some(automationStudioFlowDraftStepIsProposed)) return undefined;
      if (automationStudioFlowDraftFlowSignature(steps) !== automationStudioFlowDraftFlowSignature(seed)) return undefined;
      said = screenedReason(result.summary);
      return new AutomationStudioReauthorNothingToChangeEnding();
    },
    said: () => (said ? { ...said } : undefined)
  };
}

/**
 * What the completion check throws. Named by its class, which is all a build's
 * catch records of a throw it does not recognise; the watch, not this, is what
 * the re-author reads.
 */
class AutomationStudioReauthorNothingToChangeEnding extends Error {
  constructor() {
    super("The re-author completed the Flow unchanged: nothing to change.");
    this.name = "AutomationStudioReauthorNothingToChangeEnding";
  }
}

function screenedReason(value: unknown): AutomationStudioReauthorNothingToChange {
  if (typeof value !== "string" || !value.trim()) return {};
  const trimmed = value.trim();
  if (screenAutomationStudioLlmEvidence(trimmed, []).secretShaped) return { reasonWithheld: true };
  if (!automationStudioLocatorShapedText(trimmed)) return { reason: trimmed };
  return { reason: automationStudioWithoutLocators(trimmed), reasonWithheld: true };
}
