// An act a loop already does is not kept as a step after that loop (t975, F4).
//
// **The failure this closes.** The company-website apprentices task read a
// list that grows a page at a time: the build read it, pressed Next page four
// times by hand, and kept three of those presses (draft steps 9, 10, 11) before
// it said `repeat` on the read `while` step 9. The span became the loop read ->
// Next page, closed by Next page's `ended`. Steps 10 and 11 stayed kept after
// it, so the saved Flow ran the loop to its end and then pressed Next page
// again, on a list with no page left: Next page answered `ended`, which nothing
// after the loop routes, and every replay stopped there with
// `executor.graph.unmatched_route` (`run-mwouhs7i-b22d9399`; the same task in
// `run-mwcncux8-d888f3a0`). A repair read the saved Flow back as a draft
// (`../../../llm/node-tools/draft-from-flow.ts`), which carried the stray
// presses as ordinary steps after the loop, and assembled them again.
//
// **The rule.** A span that repeats while its last step succeeds, with no
// `most`, runs until that step answers that there is nothing more. Its last step
// done again right after the loop -- the next step of the Flow, the same action
// through the same tool with the same node parameters -- can only answer the
// same, so it is a pass the loop already made, not a step of its own. A span
// with `most` stops at a count the person gave and may stop before the list
// ends, so a press after it may still move on: it covers nothing. A step that
// says when it runs is never covered. What happens to a covered step is
// `./settle.ts`'s; a covered step joining the Flow is refused as a second copy
// of the loop's last step (`../second-copy.ts`, rule (d)).
import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftRoutingReferences, automationStudioFlowDraftStepById, automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";

type Step = AutomationStudioFlowDraftStep;

/**
 * The last step of the loop `step` would directly follow in the Flow, when
 * `step` does that step's act again (header), or nothing. Whether `step` itself
 * is in the Flow is not asked: a step taken out is asked whether it would be
 * covered back in. A step not yet in the draft stands after its last step,
 * where the loop appends it.
 */
export function automationStudioFlowDraftLoopCoveringStep(steps: readonly Step[], step: Step): Step | undefined {
  if (step.routing !== undefined || !automationStudioFlowDraftStepIsProposable(step)) return undefined;
  // A later repeat may use this result as its source. Covering the step
  // would orphan that reference even though its own act matches the loop's.
  const id = automationStudioFlowDraftStepId(step);
  if (steps.some((other) => other !== step && automationStudioFlowDraftStepIsProposed(other)
    && other.routing !== undefined && automationStudioFlowDraftRoutingReferences(other.routing).includes(id))) return undefined;
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const at = ordered.indexOf(step);
  const last = (at < 0 ? ordered : ordered.slice(0, at)).filter(automationStudioFlowDraftStepIsProposed).at(-1);
  if (!last || !closesUnboundedLoop(ordered, last)) return undefined;
  return sameAct(last, step) ? last : undefined;
}

/** Whether `last` is the last step of a span in the Flow that repeats while it succeeds, with no `most`. */
function closesUnboundedLoop(ordered: readonly Step[], last: Step): boolean {
  const id = automationStudioFlowDraftStepId(last);
  return ordered.some((head) => automationStudioFlowDraftStepIsProposed(head)
    && automationStudioFlowDraftRepeatIsWhile(head.routing)
    && head.routing.through === id
    && head.routing.most === undefined
    && head.position <= last.position
    && automationStudioFlowDraftStepById(ordered, id) === last);
}

/** The same action, through the same tool, with the same node parameters (the whole argument where it names none). */
function sameAct(a: Step, b: Step): boolean {
  return a.actionId === b.actionId && a.toolId === b.toolId && canonical(argumentOf(a)) === canonical(argumentOf(b));
}

function argumentOf(step: Step): JsonValue {
  return step.input.parameters ?? step.input;
}

/** A JSON value written with its keys in order, so two equal values give one text. */
function canonical(value: JsonValue | undefined): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
