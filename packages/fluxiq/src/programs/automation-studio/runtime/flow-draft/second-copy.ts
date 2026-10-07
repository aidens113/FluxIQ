// A step joining the Flow that copies a step already in it is not added.
//
// **The failures this closes.** Live run `run-murwdp4f-35f976d2` (C9, rows
// 0038-0046): the call `click t1212, add` repeated step 18's press of the
// 3-Pack link from the same results page and became step 21, a second copy in
// the Flow -- the draft rule "never add a second copy of a step already added"
// was told to the model and enforced nowhere. Live run `run-muq4oaof-464f5bce`
// (cause 3) kept two reads of one list.
//
// **The rule.** Candidates are the other steps in the Flow (`kept`) that are
// proposable and share the step's action and tool. The step copies one when:
//
//   (a) both change something, with the same argument (`input`, compared with
//       its keys in order), the same resolved form (`ranWith`; both absent is
//       the same), and both started from one known page state (`stateBefore`).
//       "+" pressed twice starts from two different states, so it is no copy;
//   (b) both only read and propose, both name the same list (`reads`, the
//       host's code, `./step.ts`), and no step of the Flow that changes
//       something lies between them in draft order. A read after a kept press
//       -- a filter, a sort, the next page -- reads other rows, so it is no copy.
//
// Applied wherever a step joins the Flow by the model's word: a call with `add`
// (`../llm/decision-handlers/second-copy.ts`), and an `add` or `keep` amendment
// (`./amendment/apply.ts`, `second_copy`). Re-adding the attempt a rerun
// replaced is refused on its own (`./amendment/replaced-attempt.ts`).
import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step.ts";

type Step = AutomationStudioFlowDraftStep;

/** The kept step that `step`, joining the Flow, would copy, or nothing. */
export function automationStudioFlowDraftSecondCopy(steps: readonly Step[], step: Step): Step | undefined {
  if (!automationStudioFlowDraftStepIsProposable(step)) return undefined;
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  return ordered.find((kept) => kept !== step && kept.disposition === "kept" && automationStudioFlowDraftStepIsProposable(kept)
    && kept.actionId === step.actionId && kept.toolId === step.toolId
    && (sameAct(kept, step) || sameRead(ordered, kept, step)));
}

/** Rule (a): the same press, with the same argument, from the same known page state. */
function sameAct(kept: Step, step: Step): boolean {
  return kept.effect === "mutate" && step.effect === "mutate"
    && canonical(kept.input) === canonical(step.input)
    && (kept.ranWith === undefined ? step.ranWith === undefined : step.ranWith !== undefined && canonical(kept.ranWith) === canonical(step.ranWith))
    && step.stateBefore !== undefined && kept.stateBefore === step.stateBefore;
}

/** Rule (b): a read of the same list, with no kept step changing anything between the two. */
function sameRead(ordered: readonly Step[], kept: Step, step: Step): boolean {
  if (kept.effect !== "observe" || step.effect !== "observe" || step.reads === undefined || kept.reads !== step.reads) return false;
  // A step not yet in the list stands after its last step, where the loop appends it.
  const at = ordered.indexOf(step);
  const [from, to] = [ordered.indexOf(kept), at < 0 ? ordered.length : at].sort((a, b) => a - b) as [number, number];
  return !ordered.slice(from + 1, to).some((between) => between.disposition === "kept" && between.effect === "mutate");
}

/** A JSON value written with its keys in order, so two equal values give one text. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
