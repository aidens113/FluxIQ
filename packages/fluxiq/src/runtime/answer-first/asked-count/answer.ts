// What the loop's `askedRepeats` and the act record both answer, so the two agree (loop-detection
// report, item 2): how many landings of one act the request asks for, or nothing, which is one.
//
// **What a model may do and may not.** It says which act of the request a press is, as it does on
// the acts checklist (`act: "a1"`), because only it knows which control that is. It never says how
// many: the number is the request's (`./read.ts`), and a claim of an act with no count, or of one
// the request does not hold, answers nothing. So a model that names the wrong act can press a
// control as many times as that act asks and no more. That is the disclosed limit: Core cannot
// tell which control an act's words mean until the judge reads what landed.
//
// **A press that names no act** gets the count only where nothing else could be meant: the request
// asks one count, and for no other act that lasts. With two things asked, it stays at one.

import { automationStudioInstructedActs } from "../../flow-authoring/bootstrap/instructed-acts/index.ts";
import { automationStudioAnswerFirstAskedCounts } from "./read.ts";

/** How many times the request asks for the act a call claims, or for a call that claims none. */
export type AutomationStudioAnswerFirstAskedRepeats = (claim: string | undefined) => number | undefined;

/** Reads the request once, and answers for each call by what it claims (header). */
export function automationStudioAnswerFirstAskedRepeats(request: string): AutomationStudioAnswerFirstAskedRepeats {
  const counts = automationStudioAnswerFirstAskedCounts(request);
  if (counts.length === 0) return () => undefined;
  const only = counts.length === 1 ? counts[0] : undefined;
  const unclaimed = only && !automationStudioInstructedActs(request).some((act) => act.id !== only.act && act.kind !== "open") ? only.count : undefined;
  return (claim) => {
    if (claim === undefined) return unclaimed;
    const own = counts.filter((each) => each.act !== undefined && each.act === claim.split(".")[0]);
    return own.length ? Math.min(...own.map((each) => each.count)) : undefined;
  };
}
