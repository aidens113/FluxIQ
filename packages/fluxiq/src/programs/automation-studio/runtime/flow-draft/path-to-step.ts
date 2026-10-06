// The taken steps that got the target to where a step ran, since the last step
// in the Flow.
//
// **Why it is a walk and not a count (t174 F41, run `run-muqk4u32-0b36e58f`).**
// The model ran the arrival (kept), the welcome popup's ×, the search, the
// listing (which opened a new tab), the consent, Space Grey, and then added
// 7-in-1 as it ran it. The rule then in force kept the two newest steps that
// changed the target -- Space Grey and the consent -- and stopped. The ×, the
// search and the listing stayed taken, so the first two dry runs ran the
// consent step on the home page and every step after it came back
// unreproducible; the model spent decisions 0038-0055 finding the gap. Nothing
// in the digests was wrong: the submit and the new tab each recorded a change,
// as they should. The count was the fault.
//
// **The rule.** Walk back from the step, newest first, until a step in the
// Flow: that step left the target somewhere the Flow reaches, so everything
// between it and this step is the way from there to here. On the way:
//
//   - a step that is not of the kind a Flow is made of, or did not work -- a
//     look, a refused press -- moved nothing by itself and is passed over, even
//     where its digests differ because the target went on loading under it;
//   - a step that changed nothing, or whose states were not seen, is passed
//     over: nothing says it moved the target;
//   - a read -- a step of the Flow's kind whose effect is `observe`, such as a
//     list read -- is passed over too, though its digests differ: what it
//     changed is rows scrolled in or pages turned while it read, which no
//     later step stands on, and as a step of the Flow it would store its rows
//     as well. Live run `run-muw60j7c-bb7c9a62` (lane C) ran an unfiltered
//     page-1 read to look, then added the filtered read over every page; this
//     walk brought the first along because it had scrolled page 1, and the
//     Flow stored its 20 unfiltered rows before the 10 it was built for. A read
//     the model added is still where the walk stops;
//   - a step the model withdrew (`dropped`, `exploratory`) ends the walk: the
//     model said that step is not part of the result, and what came before it
//     is not this step's way either;
//   - every other step that changed the target is on the way.
//
// **A detour is left out.** A stretch of the way that came back to a state
// already seen on it -- a listing opened and left again, a drawer opened and
// closed -- got the target nowhere, so it is dropped and the steps either side
// of it stand. The states are compared exactly. The state a step left and the
// state the next one found are one moment and both are compared, because a
// target can go on changing between two calls (run 40's product page grew
// between the press and the size). A detour the digests do not show as one is
// kept, which costs the Flow a step and never the way.
//
// This is what `./opener.ts` keeps with a step that joins the Flow, and what a
// dry-run refusal names when a step was run on a page the test never reached
// (`./dry-run.ts`).

import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

/** The steps that got the target to where `step` ran from the last step in the Flow, oldest first, detours left out. */
export function automationStudioFlowDraftPathToStep(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  if (step.stateBefore === undefined) return [];
  const earlier = steps.filter((candidate) => candidate !== step && candidate.iteration < step.iteration).sort((a, b) => b.iteration - a.iteration);
  const way: AutomationStudioFlowDraftStep[] = [];
  let from: AutomationStudioFlowDraftStep | undefined;
  for (const candidate of earlier) {
    if (!automationStudioFlowDraftStepIsProposable(candidate)) continue;
    if (candidate.disposition === "kept") { from = candidate; break; }
    if (candidate.effect === "observe") continue;
    if (candidate.stateBefore === undefined || candidate.stateAfter === undefined || candidate.stateBefore === candidate.stateAfter) continue;
    if (candidate.disposition !== "taken") break;
    way.unshift(candidate);
  }
  return withoutDetours(way, from, step);
}

/** Drops each stretch of `way` that came back to a moment already on it. */
function withoutDetours(way: readonly AutomationStudioFlowDraftStep[], from: AutomationStudioFlowDraftStep | undefined, step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
  // Each moment is the states seen at it: what one step left and what the next found.
  const moment = (...states: Array<string | undefined>): Set<string> => new Set(states.filter((state): state is string => state !== undefined));
  const moments: Set<string>[] = [moment(from?.stateAfter, way[0]?.stateBefore ?? step.stateBefore)];
  const kept: AutomationStudioFlowDraftStep[] = [];
  way.forEach((current, index) => {
    const reached = moment(current.stateAfter, (way[index + 1] ?? step).stateBefore);
    const seen = moments.findIndex((earlier) => [...reached].some((state) => earlier.has(state)));
    if (seen === -1) {
      kept.push(current);
      moments.push(reached);
      return;
    }
    // Back at moment `seen`: the steps that left it went nowhere.
    kept.length = seen;
    moments.length = seen + 1;
  });
  return kept;
}
