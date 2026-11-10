// A step whose state never arose this run, because the step that brings it about did
// not act (live checks r3, `run-mw9x529c-557f5402` step 8, `run-mwa0iiha-f3c93e83` step 17).
//
// **The failure.** A later attempt runs the saved Flow and does not repeat an act an
// earlier one landed: the act's step reads success with nothing sent (the attempt's run
// gate, `service/answer-first/run-acts/run-gate.ts`; the run's own completed-act ledger,
// `../step-loop/already-done.ts`). The run then went on in build order, to a step written
// on the page that act produced: the "View cart" of the drawer an Add opens, the "Saved"
// link of the page a dialog's Done goes to. That page never came, the step's control was
// not there, and the run stopped there, with nothing wrong but that the Flow's order
// assumed an act this run rightly did not make.
//
// **The rule.** A step that cannot run because its target is not on the page, whose way in
// was a lasting act that did not act this run, answered a state this run never reached: it
// is not needed, and the run goes on past it along its own `success` way, as past a
// sometimes-present step that is not shown. "Did not act" is read off the attempt, never
// the build order: an attempt the run's ledger skipped as already done (only lasting acts
// are on it), one a host answered with the closed word `skipped: "already_done"` among its
// outputs (a lasting act already done, nothing sent), or a step this rule itself passed
// over -- what that step would have brought about did not come either, so a chain of
// follow-on steps is passed one by one, each on the same proof.
//
// **Why an act done, and not any step skipped.** A lasting act brings about a page of its
// own (a confirmation, a dialog closing onto the next page) that the steps after it were
// written on, and so may a press an earlier attempt's answer said changed something that
// stays (an undeclared Add whose cart count rose, and whose drawer the next step was written
// on), which the attempt's record holds on repeat. A
// plain press that only moved the view -- a banner's "No thanks" -- brings about nothing but the
// cover's absence, which a page without the cover already shows; it is never held, so it runs
// again, and a step after it whose control is missing is missing for another reason and keeps
// its recovery. So a host says the word only for an act its record held done
// (`service/answer-first/run-acts/run-gate.ts`).
//
// **What it never passes over.** A step that does a lasting act (`decision.ts` asks the
// same question as for a sometimes-present step) keeps its recovery: an act is never
// silently dropped. A read keeps it too: rows are the result, and a read with nothing to
// read says so. A step after one that ran, or after a sometimes-present step that was
// not shown, is not this case, because the page it was written on could still have come;
// those keep state routing's other cases and the ladder, as before.

import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../index.ts";

/** The closed code the attempt of a step passed over by this rule carries (`skipped.code`). */
export const AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE = "executor.state.not_arisen";

/** The closed word a host puts among a step's outputs when it sent nothing because the act was already done. */
export const AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT = "already_done";

/** A join the build puts where paths meet: it neither acts nor is a way in of its own. */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The way on past `node` when the state it answers never arose this run, or nothing
 * (header). `attempts` is every attempt of the run so far; the failing node's own are
 * passed over in finding its way in.
 */
export function automationStudioStateNotArisenWayOn(input: {
  flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">;
  node: AutomationStudioFlowNode;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
}): AutomationStudioFlowEdge | undefined {
  const { flow, node } = input;
  if (readsRows(node)) return undefined;
  const wayIn = wayInOf(input.attempts, node.id);
  if (!wayIn || !didNotAct(wayIn)) return undefined;
  return chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId) ?? undefined;
}

/** The latest attempt of the run before `nodeId`'s own, joins passed through. */
function wayInOf(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): AutomationStudioNodeAttemptTrace | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.nodeId === nodeId || attempt.definitionId === MERGE_DEFINITION_ID) continue;
    return attempt;
  }
  return undefined;
}

/** Whether the attempt succeeded without acting this run (header). */
function didNotAct(attempt: AutomationStudioNodeAttemptTrace): boolean {
  if (attempt.status !== "succeeded") return false;
  const skipped = attempt.skipped;
  if (skipped?.reason === "already_done") return true;
  if (skipped?.reason === "target_absent" && skipped.code === AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE) return true;
  return !skipped && attempt.effects.length === 0 && attempt.outputs.skipped === AUTOMATION_STUDIO_ALREADY_DONE_OUTPUT;
}

/** Whether the node carries rows out: a read, whose rows are the result (header). */
function readsRows(node: AutomationStudioFlowNode): boolean {
  return [node.parameterValues?.recordOutput, node.metadata?.recordOutput, node.metadata?.recordsPath].some((declared) => declared !== undefined && declared !== null);
}
