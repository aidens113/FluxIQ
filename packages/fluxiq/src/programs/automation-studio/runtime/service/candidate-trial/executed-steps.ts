// A trial's attempts folded into the steps it ran (t365), shared by what the
// model is told (`./feedback.ts`) and the lasting acts the trial left on the
// site (`./landed-acts.ts`, t462), so both number a step the same way.
//
// Since t355 a node may make up to four attempts, recorded one after another;
// lane A round 5 (`run-muz0f12h-eae63685`) listed a busy refusal and its
// successful retry as a failed step and a new one. An attempt of the same node
// right after a failed attempt of it is that step tried again, so it replaces
// the step's outcome and adds to its count; a node reached again after it
// succeeded (a loop, a route back) is a new step. The attempts folded away are
// kept (t378): what the step absorbed is what the model needs to slow a loop
// down.

import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import type { AutomationStudioTrialExecutedStep } from "./contracts.ts";
import { automationStudioCandidateFrameEvidence } from "./frame-evidence.ts";

/** The nodes whose `body` passes a step can run in, as the executor keys them. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat"]);

/** The trace's attempts folded into steps, in the order they ran; step N is index N - 1. */
export function automationStudioTrialExecutedSteps(attempts: readonly AutomationStudioNodeAttemptTrace[]): AutomationStudioTrialExecutedStep[] {
  const folded: AutomationStudioTrialExecutedStep[] = [];
  let pass: AutomationStudioTrialExecutedStep["pass"];
  for (const attempt of automationStudioCandidateFrameEvidence(attempts).attempts) {
    const last = folded.at(-1);
    if (last && last.attempt.nodeId === attempt.nodeId && JSON.stringify(last.attempt.framePath) === JSON.stringify(attempt.framePath) && automationStudioAttemptSettled(last.attempt).status === "failed") {
      folded[folded.length - 1] = { ...last, attempt, attempts: last.attempts + 1, absorbed: [...last.absorbed, { failed: last.attempt, retry: attempt }] };
      continue;
    }
    folded.push({ attempt, attempts: 1, absorbed: [], ...(pass ? { pass } : {}) });
    if (LOOP_DEFINITION_IDS.has(attempt.definitionId)) pass = attempt.route === "body" ? attempt.outputs : undefined;
  }
  return folded;
}
