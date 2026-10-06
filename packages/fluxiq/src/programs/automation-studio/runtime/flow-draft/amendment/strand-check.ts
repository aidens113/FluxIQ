// What one decision did to the way each step of the Flow has to its page.
//
// **The failure (live run `run-muwao5n4-44977b2a`, lane D, D2-1).** Decision
// 0025 added the friend-request listing at step 2, after `navigate ~/` and
// before both navigations that reach the requests page; decision 0030 dropped
// both navigations. Each was answered "applied" and nothing about reach, every
// later test ran the listing on the home feed, and the build spent its purse
// finding out why.
//
// **The rules, read once the decision's last amendment is done**
// (`./reach.ts` says how a page is known):
//
//   - a `drop` or `exploratory` of the step that moved the target to the page a
//     kept step acted on, when no other step of the Flow moves it there any
//     more, is refused and the step put back as it was: the refusal names the
//     step it would have stranded (`strands`). Read again after each one put
//     back, since the step put back may itself need the step before it -- the
//     navigation to the friends page that the navigation to the requests page
//     acted on;
//   - a step of the Flow the decision left after a step that does not leave the
//     page it acted on -- one it added there, moved there, or whose step before
//     it it moved or dropped -- is said beside the applied decision
//     (`unreached`), with the step before it now (`after`) and the steps that
//     moved the target to its page while exploring (`reachedBy`). Information,
//     not a refusal: a move cannot be taken back cleanly once the rest of the
//     decision is applied, and the model is the one to put the step right.
//
// **Newly only.** A step that already had no way to its page before the
// decision is not said again, so a draft that stood so never starts refusing.
//
// Two reasons of their own: `strands_a_step`, a refusal -- the drop was put
// back -- and `left_unreached`, information beside an amendment that was
// applied, never a refusal. Every reader that counts or words refusals has to
// tell the second apart, as it does `repeat_taken_off`
// (`../../llm/draft-amendment-feedback.ts`).
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftReach, type AutomationStudioFlowDraftReach } from "./reach.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

type Step = AutomationStudioFlowDraftStep;

/** A step one amendment of the decision took out of the Flow, with what it was before. */
export type AutomationStudioFlowDraftWithdrawal = {
  step: Step;
  /** The number the amendment named it by. */
  named: number;
  disposition: Step["disposition"];
  settings: JsonObject | undefined;
};

/**
 * Puts back each withdrawal that left a step of the Flow with no way to its
 * page and refuses it, then says each step the decision newly left after a step
 * that does not bring it to its page. `before` is the draft's reach as the
 * decision found it (`./reach.ts`). Answers the refusals and how many applied
 * amendments they took back.
 */
export function automationStudioFlowDraftStrandCheck(
  steps: readonly Step[],
  before: AutomationStudioFlowDraftReach,
  withdrawn: readonly AutomationStudioFlowDraftWithdrawal[],
  shown: AutomationStudioFlowDraftShownNumbering
): { refused: AutomationStudioFlowDraftAmendmentRefusal[]; takenBack: number } {
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  const wasInFlow = new Set(before.flow);
  let open = withdrawn.filter((entry) => entry.disposition === "kept" && wasInFlow.has(entry.step));
  let now = automationStudioFlowDraftReach(steps);
  for (let changed = true; changed;) {
    changed = false;
    for (const entry of open) {
      if (entry.step.disposition === "kept") continue;
      const stranded = strandedBy(entry.step, now, before);
      if (!stranded) continue;
      entry.step.disposition = entry.disposition;
      if (entry.settings === undefined) delete entry.step.settings;
      else entry.step.settings = entry.settings;
      refused.push({ step: entry.named, reason: "strands_a_step", strands: shown.number(stranded) });
      now = automationStudioFlowDraftReach(steps);
      changed = true;
    }
    open = open.filter((entry) => entry.step.disposition !== "kept");
  }
  for (const step of now.flow) {
    if (!now.unreached.has(step) || (wasInFlow.has(step) && before.unreached.has(step))) continue;
    const index = now.flow.indexOf(step);
    const at = now.page(step);
    const reachedBy = steps.filter((other) => other !== step && automationStudioFlowDraftStepIsProposable(other) && now.moves(other) && now.leaves(other) === at).map((other) => shown.number(other));
    refused.push({ step: shown.number(step), reason: "left_unreached", after: shown.number(now.flow[index - 1]!), reachedBy });
  }
  return { refused, takenBack: refused.filter((refusal) => refusal.strands !== undefined).length };
}

/** The first step of the Flow `withdrawn` was the last way to, that had one before the decision, or nothing. */
function strandedBy(withdrawn: Step, now: AutomationStudioFlowDraftReach, before: AutomationStudioFlowDraftReach): Step | undefined {
  if (!before.moves(withdrawn)) return undefined;
  const to = before.leaves(withdrawn);
  return now.flow.find((step) => now.noWay.has(step) && !before.noWay.has(step) && now.page(step) === to);
}
