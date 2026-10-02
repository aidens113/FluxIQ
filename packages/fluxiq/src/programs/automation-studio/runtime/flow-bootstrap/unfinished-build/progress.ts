// Whether a round measurably got further than the judged round before it.
//
// **Repairs are bounded by money and progress, not by a count (t240).** A
// build used to stop after two repairs whatever they did
// (`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_REPAIR_ROUNDS`). Now another round opens
// only while the purse can fund it (`./phases.ts`) and the round before it
// measurably progressed; a round that did not ends the build with what stood
// still (`./not-doable.ts`).
//
// **Measured, never claimed.** Every measure is something the build's test or
// the judge already reports: the checklist's acts that have a step, those of
// them that worked when the Flow ran from its start, the test's own verdict and
// failed steps, and the judge's verdict and finding codes. A Flow that is merely
// different is not progress: three earbuds rounds (`run-muqiho7e-13be6c03`)
// each handed back a different Flow -- navigation steps added -- while the
// judge said the same thing every time, that no step reads or stores a record.
// The judge's free words (`expected`, `observed`) are not compared: two
// accounts of the same failure differ in wording.
import type { AutomationStudioFlowBootstrapJudgement, AutomationStudioFlowBootstrapProgressMeasure } from "./contracts.ts";

/** What `after` measurably did better than `before`; empty when nothing did. */
export function automationStudioFlowBootstrapJudgementProgress(before: AutomationStudioFlowBootstrapJudgement, after: AutomationStudioFlowBootstrapJudgement): AutomationStudioFlowBootstrapProgressMeasure[] {
  const moved: AutomationStudioFlowBootstrapProgressMeasure[] = [];
  if (after.done > before.done) moved.push("acts_done");
  if ((after.proven ?? 0) > (before.proven ?? 0)) moved.push("acts_proven");
  if (before.tested !== "replayed_clean" && after.tested === "replayed_clean") moved.push("test_passes");
  if (before.tested === "replay_failed" && after.tested === "replay_failed" && after.failedSteps.length < before.failedSteps.length) moved.push("fewer_failed_steps");
  // Without a judge the test is the only report of what the Flow does; with one, the judge's account is.
  if (!before.judge && !after.judge && workingSteps(after) > workingSteps(before)) moved.push("more_working_steps");
  if (!before.judge && after.judge) moved.push("finished_and_judged");
  if (before.judge && after.judge && before.judge.verdict !== "no" && after.judge.verdict === "no") moved.push("carried_steps_judged");
  if (before.judge?.verdict === "no" && after.judge?.verdict === "no") {
    const now = new Set(after.judge.findings);
    if (before.judge.findings.some((finding) => !now.has(finding))) moved.push("judge_findings_resolved");
  }
  return moved;
}

/** The steps that worked when the Flow was run from its start; none where it was not run. */
function workingSteps(judgement: AutomationStudioFlowBootstrapJudgement): number {
  return judgement.tested === "not_tested" ? 0 : judgement.stepsInFlow - judgement.failedSteps.length;
}
