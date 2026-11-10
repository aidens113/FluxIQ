// What a step that met a check only a person can clear comes to, once the
// person cleared it and pressed Continue (`person-needed.ts`).
//
// **Continue is not the step's success.** It says the check is gone, not that
// the step did what it was for. Until 2026-11-10 the run took the step's own
// `success` route on Continue, whatever its act had come to, so a step whose
// act never happened was walked past. In `run-mwapfy0i-d64b26db` a saved
// Flow's search landed on the site's traffic screen, the next step's filter
// press found nothing to press on that screen and was answered with the check,
// the person cleared it, the page reloaded the unfiltered results, and the run
// went on to the price, the sort and a list read over rows the filter would
// have removed: a filter silently dropped, and a read that either fails or
// reads the wrong rows.
//
// **So the step is judged first, on the page the person left:**
//
//  - **Its act was not made, or making it cannot act twice** -- the record says
//    the act did not happen (`effect: "unacted"`, or the fault was found while
//    resolving the target), or the node is one whose repeat cannot act (a read,
//    a look, a wait). The step runs again, from its own arrival, so it waits
//    for its target and reads the page fresh. Nothing it would do has been done.
//  - **Its act may have been made** -- the press reached the page and the check
//    was its answer. Where the step says what it leaves (an expected state, a
//    `done when:`), or its act lasts, the effect check asks the page
//    (`defensive/effect-check.ts`): `landed` goes on without making it again;
//    `not_landed` runs it again, since an act that did not happen is not made
//    twice by being made now; `unknown` holds a lasting act as Outcome uncertain
//    rather than repeat it or walk past it, and lets a plain press go on.
//  - **A plain press that says nothing of what it leaves** goes on: it was made,
//    the check was its answer, and the address the check reloads is the one the
//    press asked for. Pressing it again could undo it -- a filter is a toggle.
//
// **Which acts last, here.** A domain's floor calls every press `commit`, and
// the engine reads that as lasting so that a press whose answer was lost is not
// pressed again (`defensive/lasting-act.ts`). That is not this question: a
// press that declares no consequence and claims no act is sent each time its
// Flow says (`framework/.../answer-first/run-acts/settling.ts`, "A plain
// press"). So an act lasts here when the node says so, or the floor names a
// consequence -- the same line the run's act record draws.
//
// **Bounded by the check, as every ask is.** A step run again that meets the
// check again asks again, and `AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN`
// asks in a row with nothing succeeding between ends the run
// (`person-needed.ts`).

import type { AutomationStudioFlowNode } from "../../flows/executable/graph/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../components/automation/index.ts";
import { emitAutomationStudioActivityThought } from "../../runtime/activity/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { automationStudioAssessAttemptFault, automationStudioNodeActLasts, automationStudioNodeRepeatCannotAct, automationStudioRunEffectCheck, automationStudioStopMessage } from "./defensive/index.ts";
import { automationStudioHostEffectCheck, expectedTransitionForNode } from "./transitions/index.ts";
import { automationStudioOutcomeUncertainTrace, automationStudioRecordDefendedFault, automationStudioStepStampFailureClass, type AutomationStudioStepLoopContext } from "./step-loop/index.ts";

/** Where the run goes from a step whose check a person cleared (header). */
export type AutomationStudioPersonClearedOutcome =
  /** The step's act was made and nothing shows its effect missing: on down its success route. */
  | { kind: "go_on" }
  /** The step runs again, from its own arrival. */
  | { kind: "rerun" }
  /** A lasting act that may have landed, which nothing settled: the run stops as Outcome uncertain. */
  | { kind: "return"; trace: AutomationStudioGraphExecutionTrace };

/**
 * Judges the attempt at `attemptIndex` when it is the node's person-needed ask
 * answered with Continue; nothing for any other attempt, which keeps the route
 * its ask or its answer chose.
 */
export async function automationStudioStepAfterPersonCleared(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  attemptIndex: number
): Promise<AutomationStudioPersonClearedOutcome | undefined> {
  const attempt = ctx.attempts[attemptIndex];
  if (!attempt || !clearedByPerson(attempt)) return undefined;
  const actionEffect = ctx.runState.actionEffects.get(node.id) ?? floorAfterResume(ctx, node);
  const fault = automationStudioAssessAttemptFault(attempt, node, ctx.now(), actionEffect);
  const rerun = (text: string): AutomationStudioPersonClearedOutcome => {
    emitAutomationStudioActivityThought({ phase: "repairing", title: "Doing the step again", text, ref: node.id });
    automationStudioRecordDefendedFault(ctx.runState, node.id, ctx.attempts[attemptIndex]!, ctx.arrival.attempts, fault, "retried", 0);
    return { kind: "rerun" };
  };
  if (fault?.effect === "unacted" || automationStudioNodeRepeatCannotAct(node, actionEffect)) {
    return rerun("The check came up before the step had done anything, so now that it is cleared the step runs again on the page as it is.");
  }
  const lasting = actLasts(node, actionEffect);
  if (!lasting && !declaresExpectedState(node, attempt)) return { kind: "go_on" };
  // A plain press is asked of the page as an act that does not last, so a step's facts still false read `not_landed` (header).
  // The attempt's own comparison read the page the check covered, before it was cleared, so the page is read afresh.
  const asCleared: AutomationStudioNodeAttemptTrace = { ...attempt };
  delete asCleared.transitionComparison;
  const result = await automationStudioRunEffectCheck(automationStudioHostEffectCheck(node, ctx.options, lasting ? actionEffect : undefined), asCleared, ctx.arrival.attempts);
  ctx.attempts[attemptIndex] = { ...ctx.attempts[attemptIndex]!, effectCheck: { result, checkedAt: ctx.now() } };
  if (result === "landed") return { kind: "go_on" };
  if (result === "not_landed") return rerun("The check was cleared, but the page does not show what the step was to do, so the step runs again.");
  if (!lasting || !fault) return { kind: "go_on" };
  const settled = { ...fault, actUncertain: true as const, reason: `${node.id} makes a lasting act that a check only a person can clear answered, and once the check was cleared the page could not show whether it took effect, so it is not made again.` };
  emitAutomationStudioActivityThought({ phase: "repairing", title: "Outcome uncertain", text: "The step may already have taken effect before the check came up, and nothing on the page shows whether it did, so it is not done again and the run stops here.", ref: node.id });
  automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: true, onFail: [] });
  automationStudioRecordDefendedFault(ctx.runState, node.id, ctx.attempts[attemptIndex]!, ctx.arrival.attempts, settled, "stopped", 0);
  return { kind: "return", trace: automationStudioOutcomeUncertainTrace(ctx, node.id, automationStudioStopMessage(settled, attempt.message) ?? `Outcome uncertain: ${settled.reason}`) };
}

/** A failed attempt whose person-needed ask was answered Continue: the ask's own record, as the run and a resume both keep it. */
function clearedByPerson(attempt: AutomationStudioNodeAttemptTrace): boolean {
  const ask = attempt.ask;
  return attempt.status === "failed" && ask?.personNeeded === true && ask.status === "answered" && ask.route === "success";
}

/**
 * The node's floor when the run holds none for it: a durably parked run resumes
 * with a fresh run state, and without its floor a press would read as a step
 * whose repeat cannot act. Resolved from the node's authored parameters, as an
 * attempt resolves it when a binding is missing. A resolver that throws is not
 * read as no floor, which would let a press be made twice: it fails the run.
 */
function floorAfterResume(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode): AutomationStudioResolvedActionEffect | undefined {
  return ctx.options.resolveActionEffect?.(node, node.parameterValues);
}

/** Whether the act lasts, as the node or the floor's named consequences say -- not the floor's bare `commit` (header). */
function actLasts(node: AutomationStudioFlowNode, actionEffect: AutomationStudioResolvedActionEffect | undefined): boolean {
  return (actionEffect?.permissionConsequences.length ?? 0) > 0 || automationStudioNodeActLasts(node);
}

/** Whether the step says what the page shows once it worked, which is what the effect check reads. */
function declaresExpectedState(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): boolean {
  const expectedState = attempt.transitionComparison?.expected.expectedState ?? expectedTransitionForNode(node, attempt).expectedState;
  return expectedState !== undefined && Object.keys(expectedState).length > 0;
}
