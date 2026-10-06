// A press that undoes another on the same control leaves the Flow with it.
//
// **The failures this closes.** Live run `run-murwd8le-79e735a8` kept a press
// of Space Grey that un-chose the colour the page arrived with (draft step 7,
// the act `a1.colour`), and the press that chose it again (step 14) joined the
// Flow as an opener of Add to cart (`./opener.ts`). Live run
// `run-musp8nz1-dbd3905a` added both halves itself, each for `a1.colour`, and
// the act claim moved the act from the first to the second (`./act-claim.ts`).
// Both Flows worked only because the page arrived with the colour chosen; on a
// page that arrives without it, the first press chooses, the second un-chooses
// and the add is refused. Whole-page digests cannot see such a pair: other
// steps between the halves changed the page, so the state after the second is
// no state seen before. Only the host can name the control, so it does
// (`./step.ts`, `toggle`).
//
// **The rules.** Taken in draft order, for each step in the Flow that carries
// `toggle` and no `cancels`, the latest proposable step before it with the same
// `key` -- passing over a step Core already took out -- is its partner:
//
//   (a) a partner in the Flow that went the other way: the two are a pair that
//       changed nothing only if no other kept executable step lies between
//       them: that step may need the temporary state. Both leave the
//       Flow, and their act claims go with them -- an act named on a step out
//       of the Flow invites the model to keep half a pair, and the act belongs
//       on the step after which the page first showed the control as needed;
//   (b) a partner out of the Flow that went the other way: this step only put
//       back what a step outside the Flow did, so in the Flow it would flip the
//       control the wrong way. It leaves alone.
//
// A kept executable step between the halves prevents pairing: an act may use
// the temporary state, and a read may return it. Core has no dependency proof
// that would permit dropping the toggles around either one.
// A partner that went the same way means something the host did not see
// changed the control between them, and nothing is taken out. A step with
// routing says when it runs and is never paired.
//
// **The model has the last word.** A step taken out carries `cancels`, the id
// of the step it undid or was undone by, and the draft entry says why it is out
// (`./entry.ts`, `out`). A step that carries `cancels` is never taken out again,
// so a model that adds a half back -- because a step between them needed the
// control flipped -- keeps it.
//
// Run wherever a step joins the Flow, after the steps that opened its page
// joined with it: a step appended with `add` (`../llm/evidence-loop.ts`), a
// rerun that took a kept step's place, and an `add` or `keep` amendment
// (`./amendment/apply.ts`).

import { automationStudioFlowDraftStepId } from "./routing.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

/** Takes each press a later press of the same control undid out of the Flow, and returns the steps it took out. */
export function automationStudioFlowDraftDropReversals(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const out: AutomationStudioFlowDraftStep[] = [];
  for (const later of ordered) {
    const toggle = later.toggle;
    if (!toggle || later.disposition !== "kept" || later.cancels !== undefined || later.routing !== undefined) continue;
    if (!automationStudioFlowDraftStepIsProposable(later)) continue;
    const earlier = partnerOf(ordered, later, toggle.key);
    // The same way twice: something the host did not see changed the control between them.
    if (!earlier || earlier.toggle?.to === toggle.to) continue;
    if (ordered.slice(ordered.indexOf(earlier) + 1, ordered.indexOf(later))
      .some((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step))) continue;
    if (earlier.disposition === "kept") {
      // A half the model put back stays where it put it; so does one that says when it runs.
      if (earlier.cancels !== undefined || earlier.routing !== undefined) continue;
      takeOut(earlier, later);
      takeOut(later, earlier);
      out.push(earlier, later);
      continue;
    }
    takeOut(later, earlier);
    out.push(later);
  }
  return out;
}

/** The latest proposable step before `later` that pressed the same control, passing over steps Core took out. */
function partnerOf(ordered: readonly AutomationStudioFlowDraftStep[], later: AutomationStudioFlowDraftStep, key: string): AutomationStudioFlowDraftStep | undefined {
  for (let index = ordered.indexOf(later) - 1; index >= 0; index -= 1) {
    const candidate = ordered[index]!;
    if (candidate.toggle?.key !== key || !automationStudioFlowDraftStepIsProposable(candidate)) continue;
    // Taken out by Core and left out by the model: already accounted for.
    if (candidate.cancels !== undefined && candidate.disposition !== "kept") continue;
    return candidate;
  }
  return undefined;
}

function takeOut(step: AutomationStudioFlowDraftStep, partner: AutomationStudioFlowDraftStep): void {
  step.disposition = "dropped";
  step.cancels = automationStudioFlowDraftStepId(partner);
  delete step.acts;
}
