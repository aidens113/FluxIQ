// Every step named for an act, tried in turn: the one loop the completion
// check (`./check.ts`) and the checklist (`./checklist.ts`) share, so the
// checklist never shows done what a completion then refuses, nor the reverse.
//
// **The defect this closes (live run 36, `run-muq3uozx-3153564b`, cause 1).**
// The model named act a1 on the list read that picks the requests and on the
// Confirm repeated over it. The check read the draft's claims in draft order
// and judged only the first step naming an act -- the read -- and dropped the
// model's own result claims for an act a step already named; the checklist
// tried every step naming it. So the checklist said `a1 done` while 24
// completions were refused `step_changed_nothing` on the read. Now both try,
// for each act, every step named for it and accept the first that does it.
//
// **The order steps are tried in.** Kept steps before the rest; among them the
// draft's own claims (`acts` on a step) before the model's result claims, each
// in draft order. A step is tried for one act only: the first act, in the
// instruction's order, that it does takes it. Where none does, the step judged
// is the first that changes something, else the first: a read named beside
// the press that does the act is never the one reported.
//
// Nothing here calls a provider or reads a page; it is the draft and the claims.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioInstructedChoiceSetBy } from "./choice-evidence.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedActMissingReason } from "./contracts.ts";
import { automationStudioInstructedActSpanStopsShort } from "./span.ts";
import { automationStudioInstructedActStepFault } from "./step-fault.ts";

type Step = AutomationStudioFlowDraftStep;
type Fault = Exclude<AutomationStudioInstructedActMissingReason, "no_step_named" | "no_such_step">;

/**
 * How one act or choice stands against the steps named for it: done by a
 * step, or the fault of the step judged, with `after` for `span_stops_short`
 * and `reads` -- the positions of every step named for it -- when each of them
 * only reads the page.
 */
export type AutomationStudioInstructedStanding =
  | { done: Step }
  | { fault: Fault; step: Step; after?: number; reads?: number[] };

/**
 * Each act, then each choice of an act's item, against every step named for
 * it. An id no step is named for is absent from the map. `claimedFor` adds the
 * steps the model's result claims name for an id, beside the draft's own.
 */
export function automationStudioInstructedActsStanding(input: {
  acts: readonly AutomationStudioInstructedAct[];
  steps: readonly Step[];
  onlyArrives: (step: Step) => boolean;
  claimedFor?: (id: string) => readonly Step[];
}): Map<string, AutomationStudioInstructedStanding> {
  const choices = input.acts.flatMap((act) => act.requires ?? []);
  const named = new Map([...input.acts, ...choices].map((item) => [item.id, namedFor(input.steps, item.id, input.claimedFor?.(item.id) ?? [])]));
  // Steps named for any act or choice: a lasting step after a repeat that one names is the next act, not this one's end.
  const kept = new Set([...named.values()].flat().filter((step) => step.disposition === "kept"));
  const claimed = (step: Step): boolean => kept.has(step);
  const used = new Set<Step>();
  const standing = new Map<string, AutomationStudioInstructedStanding>();
  const settle = (id: string, faultOf: (step: Step) => Fault | undefined): Step | undefined => {
    const candidates = named.get(id) ?? [];
    if (!candidates.length) return undefined;
    const tried = candidates.map((step) => ({ step, fault: faultOf(step) }));
    const answering = tried.find((each) => each.fault === undefined);
    if (answering) {
      used.add(answering.step);
      standing.set(id, { done: answering.step });
      return answering.step;
    }
    const judged = tried.find((each) => each.step.effect === "mutate") ?? tried[0]!;
    const after = judged.fault === "span_stops_short" ? automationStudioInstructedActSpanStopsShort(judged.step, input.steps, claimed)?.after.position : undefined;
    const reads = candidates.every((step) => step.effect !== "mutate") ? candidates.map((step) => step.position) : undefined;
    standing.set(id, { fault: judged.fault!, step: judged.step, ...(after !== undefined ? { after } : {}), ...(reads ? { reads } : {}) });
    return undefined;
  };
  // The step each act is done by, so a choice given the same one is told it is its act's press.
  const actSteps = new Map<string, Step>();
  for (const act of input.acts) {
    const done = settle(act.id, (step) => automationStudioInstructedActStepFault(act, step, input.steps, input.onlyArrives, claimed) ?? (used.has(step) ? "step_claimed_twice" : undefined));
    if (done) actSteps.set(act.id, done);
  }
  for (const choice of choices) {
    // A choice is a setting, held to what any act of setting is and never repeated.
    const asAct: AutomationStudioInstructedAct = { id: choice.id, kind: "set", verb: choice.choice, quote: choice.quote };
    settle(choice.id, (step) => automationStudioInstructedActStepFault(asAct, step, input.steps, input.onlyArrives, claimed)
      ?? (used.has(step) && !automationStudioInstructedChoiceSetBy(step, choice) ? (actSteps.get(choice.of) === step ? "choice_is_the_act_step" : "step_claimed_twice") : undefined));
  }
  return standing;
}

/** The steps named for one id, in the order they are tried (see the header). */
function namedFor(steps: readonly Step[], id: string, claimed: readonly Step[]): Step[] {
  const byDraft = (left: Step, right: Step): number => left.position - right.position;
  const own = steps.filter((step) => step.acts?.some((named) => named.trim().toLowerCase() === id)).sort(byDraft);
  const theirs = [...new Set(claimed)].filter((step) => !own.includes(step)).sort(byDraft);
  const all = [...own, ...theirs];
  return [...all.filter((step) => step.disposition === "kept"), ...all.filter((step) => step.disposition !== "kept")];
}
