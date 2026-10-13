// A lasting step whose act answered success is done only if what it did
// appeared (t476).
//
// A step's `done when:` already judges it: its facts are read after the act
// and a `false` left at the end fails the attempt (`../transition-comparison.ts`,
// t413). A step written without one was judged by its act's own answer alone,
// and an answer can be wrong: in `run-mv5tusj4-b7ee0630` bigbox's Add to cart
// answered "Element clicked." for a press the page only woke on, and the trial,
// the playback and the build's reset ledger all took a cart line that was never
// added as made, so the judges and the repair blamed other steps.
//
// The build already keeps what each step did to the page when it ran: the
// host's record of its effect (`routeSignatures.effect`,
// `../../route-state/signatures/`). So after a lasting step without a declared
// expected state answers success, the page is observed and the host asked
// whether that effect appeared (`routeEffectSeen`). Only its `not_seen` -- the
// host's strong evidence that nothing the recorded act brought is there --
// judges anything, read again until the node's wait ceiling passes so a page a
// moment late is not judged; `seen` and `unknown`, no host, no effect, or an
// observation that failed leave the attempt as its act answered.
//
// The attempt then fails as an output not observed, found after acting (stage
// `verification`), as a step whose facts stayed false does, so the act is not
// made again (`../defensive/assess.ts`): the page's absence of a lasting act's
// answer is no proof that it did not happen. A failed step is not landed, so a
// trial does not report it among the acts it left (`service/candidate-trial/landed-acts.ts`)
// and a playback does not go on as if it were done.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioNodeRouteSignatures, automationStudioRouteEffectSeen, observeAutomationStudioRouteState } from "../../route-state/passive/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeActLasts } from "../defensive/index.ts";
import { automationStudioRunWait } from "../pacing/index.ts";
import { automationStudioReadinessCeilingMs, automationStudioRecordedState } from "../recorded-state.ts";
import { compareAutomationStudioTransition } from "../transition-comparison.ts";

/**
 * The failure of an attempt whose lasting act answered success while nothing
 * its recorded effect brought appeared: found after acting, so stage
 * `verification`, and not retryable, since a lasting act is never made again
 * on a page's silence.
 */
export const AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE: Readonly<AutomationStudioFailureRecord> = Object.freeze({
  category: "output_not_observed",
  code: "core.step.effect_not_seen",
  retryable: false,
  stage: "verification"
});

/** What an attempt rejected so says. It names no page content. */
const EFFECT_UNSEEN_MESSAGE = "The step's act answered success, but nothing it brought when the Flow was built appeared on the page, so it is not counted as done.";

/** How often the page is observed again while the run waits for the effect. */
const EFFECT_POLL_MS = 500;

/**
 * The attempt as its act answered it, or failed when it is a lasting step
 * whose recorded effect the host says did not appear by the end of the node's
 * wait ceiling.
 */
export async function automationStudioAttemptWithRecordedEffect(
  flow: Pick<AutomationStudioFlowDocument, "flowId" | "ownerId" | "metadata">,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions
): Promise<AutomationStudioNodeAttemptTrace> {
  if (attempt.status !== "succeeded" || attempt.skipped || attempt.stateHeld) return attempt;
  // A step with its own expected state -- a `done when:` -- was judged by it already.
  const expectedState = attempt.transitionComparison?.expected.expectedState;
  if (expectedState && Object.keys(expectedState).length > 0) return attempt;
  if (!automationStudioNodeActLasts(node)) return attempt;
  const effect = automationStudioNodeRouteSignatures(node).effect;
  const hostRuntime = options.hostRuntime;
  if (!effect || !hostRuntime?.routeEffectSeen || !hostRuntime.observeRouteState) return attempt;
  const projectId = typeof flow.metadata?.projectId === "string" && flow.metadata.projectId ? flow.metadata.projectId : flow.ownerId;
  const windowMs = automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs);
  let waitedMs = 0;
  for (;;) {
    const observation = await observeAutomationStudioRouteState({ hostRuntime, projectId, flowId: flow.flowId, ...(options.signal ? { signal: options.signal } : {}) });
    if (!observation.ok || automationStudioRouteEffectSeen(hostRuntime, effect, observation.state) !== "not_seen") return attempt;
    if (waitedMs >= windowMs || options.signal?.aborted === true) break;
    const waitMs = Math.min(EFFECT_POLL_MS, windowMs - waitedMs);
    await automationStudioRunWait(options, waitMs);
    waitedMs += waitMs;
  }
  const failure: AutomationStudioFailureRecord = { ...AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE };
  return {
    ...attempt,
    status: "failed",
    route: "failed",
    message: EFFECT_UNSEEN_MESSAGE,
    failure,
    transitionComparison: compareAutomationStudioTransition(node, attempt, { passed: false, checkedConditionCount: 1, message: EFFECT_UNSEEN_MESSAGE, failure })
  };
}
