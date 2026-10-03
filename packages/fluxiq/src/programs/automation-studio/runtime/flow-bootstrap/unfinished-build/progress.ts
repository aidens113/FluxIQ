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
// accounts of the same failure differ in wording. What the judged test stored
// is (t240): rows stored where none were, or fewer refused or incomplete rows
// while no fewer are stored -- a Flow that stopped reading has fewer refusals
// and is no further.
//
// **A Flow not judged, then judged, progressed (user, 2026-10-02).** A
// finished round whose Flow was not judged to do what was asked -- the judge
// unsure or not run, or its yes about a test of another version of the Flow or
// of none -- is repaired like one judged wrong (`./phases.ts`). A repair whose
// Flow the judge then did judge got further, whatever the Flow before it was:
// `judged_after_unjudged`. Its verdict can only be `no` here; a yes about the
// Flow as it stands finishes the build.
//
// **A round that could not be measured (t194-w70).** A Flow holding steps
// carried from an earlier Flow that never ran in this build is not run from its
// start (`./judgement.ts`, `notRunInThisBuild`), so none of the measures above
// has anything to read. For such a round, progress is what the round could
// change: fewer steps that have not run (`fewer_steps_not_run`, which also
// counts for the first measured round after it), or a Flow different from the
// one before (`flow_changed_unmeasured`). It is what the repair's announcement
// says; "not doable" is never concluded from such a round (`./phases.ts`).
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
  if (before.judge && after.judge && before.judge.verdict !== "no" && after.judge.verdict === "no") moved.push("judged_after_unjudged");
  if (before.judge?.verdict === "no" && after.judge?.verdict === "no") {
    const now = new Set(after.judge.findings);
    if (before.judge.findings.some((finding) => !now.has(finding))) moved.push("judge_findings_resolved");
    const [was, is] = [before.judge.records, after.judge.records];
    if (was && is) {
      if (was.stored === 0 && is.stored > 0) moved.push("records_stored");
      if (is.stored >= was.stored && is.refused < was.refused) moved.push("fewer_records_refused");
      if (is.stored >= was.stored && is.missingRequired < was.missingRequired) moved.push("fewer_records_missing_required");
    }
  }
  const [notRunBefore, notRunAfter] = [notRun(before), notRun(after)];
  if (notRunAfter < notRunBefore) moved.push("fewer_steps_not_run");
  if (notRunAfter > 0 && after.flowSignature !== before.flowSignature) moved.push("flow_changed_unmeasured");
  return moved;
}

/** Whether a round could not be measured: steps carried into its Flow never ran in this build, so it was not run from its start. */
export function automationStudioFlowBootstrapJudgementUnmeasured(judgement: AutomationStudioFlowBootstrapJudgement): boolean {
  return notRun(judgement) > 0;
}

/** How many steps carried into the Flow never ran in this build: as its judgement names them, or a judge's account does. */
function notRun(judgement: AutomationStudioFlowBootstrapJudgement): number {
  return Math.max(judgement.notRunInThisBuild?.length ?? 0, judgement.judge?.untestedCarried?.length ?? 0);
}

/** The steps that worked when the Flow was run from its start; none where it was not run. */
function workingSteps(judgement: AutomationStudioFlowBootstrapJudgement): number {
  return judgement.tested === "not_tested" ? 0 : judgement.stepsInFlow - judgement.failedSteps.length;
}
