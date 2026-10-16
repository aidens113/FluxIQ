// Back to the step that showed a control a later step found hidden (t661).
//
// A8 bigbox cart (`run-mvac0ddx-f52ba929`): step 4 opened a store picker, an
// optional step after it had nothing to do, and the picker was closed again
// before step 7 used it. Step 7's control was then on the page with no box,
// measured `shown: false` (`./target-not-shown.ts`). State routing compared the
// page with every step's recorded starting page, matched none -- the timed
// promotion and chat card made step 4's differ -- and answered `no_match`, so
// the run failed at a step one press away from working.
//
// So, before ranking (`./decision.ts`), a step that failed because its control
// was measured on the page but not shown goes back to the step that showed it,
// on Core's own record only:
//
// - the opener is the nearest earlier step of this run that acted (succeeded,
//   not skipped) and recorded an after-state; steps that record none -- a join,
//   a wait -- are passed over, as they have no page to show anything on;
// - its act does not last (`../defensive/lasting-act.ts`): a lasting-act opener
//   is never run again, and no way back is taken through it;
// - its recorded after-state matches the failing step's recorded starting page
//   (the host compares the two, `automationStudioCompareRouteSignatures`): the
//   page the opener left is the one the failing step's control was shown on.
//
// The return still goes through the decision's guards: a completed lasting act
// on the way back refuses it (`./repeated-act.ts`), the progress guard admits
// it, and only once per opener until the run makes progress
// (`AutomationStudioStateRouteGuard.reopen`): a second return with nothing done
// since stops the run, since the control went hidden again after the opener
// showed it. Core reads no page words here and refutes nothing; with no
// measurement, no opener or no match, the decision ranks as before.

import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioCompareRouteSignatures, automationStudioNodeRouteSignatures } from "../../route-state/passive/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeActLasts } from "../defensive/index.ts";
import { automationStudioTargetMeasuredNotShown } from "./target-not-shown.ts";

/**
 * The step a failing step whose control was measured on the page but not shown
 * goes back to, or nothing when it should not (header). `attempts` is every
 * attempt of the run so far, latest last.
 */
export function automationStudioStateReopenOpener(input: {
  flow: AutomationStudioFlowDocument;
  node: AutomationStudioFlowNode;
  attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure"> & { outputs?: AutomationStudioNodeAttemptTrace["outputs"] | undefined };
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  hostRuntime: AutomationStudioGraphExecutionOptions["hostRuntime"];
}): AutomationStudioFlowNode | undefined {
  if (!automationStudioTargetMeasuredNotShown(input.attempt)) return undefined;
  const shownOn = automationStudioNodeRouteSignatures(input.node).before;
  if (!shownOn) return undefined;
  const opener = nearestRecordedActor(input.flow, input.node.id, input.attempts);
  if (!opener || automationStudioNodeActLasts(opener)) return undefined;
  const left = automationStudioNodeRouteSignatures(opener).after!;
  return automationStudioCompareRouteSignatures(input.hostRuntime, left, shownOn).matches ? opener : undefined;
}

/** The nearest earlier node of the run, other than `failingId`, that acted and recorded an after-state. */
function nearestRecordedActor(flow: AutomationStudioFlowDocument, failingId: string, attempts: readonly AutomationStudioNodeAttemptTrace[]): AutomationStudioFlowNode | undefined {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.nodeId === failingId || attempt.status !== "succeeded" || attempt.skipped) continue;
    const node = nodes.get(attempt.nodeId);
    if (node && automationStudioNodeRouteSignatures(node).after) return node;
  }
  return undefined;
}
