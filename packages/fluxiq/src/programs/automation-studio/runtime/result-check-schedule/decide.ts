// Whether the run that has just finished is put to the question.
//
// Pure: the state is handed in, so every shape is provable with no database, no
// provider and no money. Nothing here changes the check itself -- not the
// prompt, not the verdict, not the agreement rule, not the summary. It decides
// *which runs are checked*, and that is the whole of the new idea.
//
// Two rules sit outside the ordinal sequence, and both exist because a schedule
// that only counts would let a real finding go unexamined:
//
//   * After a refutation, the next run is checked whatever the sequence says.
//     A refutation opens the repair entry, and the repair's own product has to
//     be judged -- otherwise a repair can land, re-run, produce a still-wrong
//     answer, and nothing says so.
//   * A scheduled check that settled nothing (`unverified` -- no model was
//     available, or two calls did not agree) is asked once more at the next
//     run. Once, and only after a scheduled check, so a Flow whose model is
//     unavailable does not quietly turn into `every_run`.
//
// The epoch is not this function's concern. `state.ordinal` counts runs since
// the Flow's graph last changed, so a landed repair restarts the initial window
// for free, with nothing here to reset and nothing to bookkeep.

import { AUTOMATION_STUDIO_RESULT_CHECK_CODES, type AutomationStudioResultCheckDecision, type AutomationStudioResultCheckState } from "./contracts.ts";
import { automationStudioNextResultCheckOrdinal, automationStudioResultCheckOrdinals } from "./ordinals.ts";
import type { AutomationStudioResultCheckSettings } from "./settings.ts";

export function decideAutomationStudioResultCheck(input: {
  state: AutomationStudioResultCheckState;
  settings: AutomationStudioResultCheckSettings;
}): AutomationStudioResultCheckDecision {
  const settings = input.settings;
  const state = input.state;
  const ordinal = Math.max(0, Math.trunc(state.ordinal));
  if (!settings.enabled) {
    return { check: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.disabled, reason: "Result checking is turned off for this Flow, so this run's result was not judged.", nextCheckAtOrdinal: null };
  }
  if (settings.shape === "never") {
    return { check: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.never, reason: "This Flow's schedule checks no runs, so this run's result was not judged.", nextCheckAtOrdinal: null };
  }
  const nextAfterThis = automationStudioNextResultCheckOrdinal(settings, ordinal);
  if (state.lastStatus === "refuted" && state.lastCheckedOrdinal !== null && state.lastCheckedOrdinal < ordinal) {
    return { check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRefutation, reason: `The check on run ${state.lastCheckedOrdinal} found the result did not answer the request, so this run's result was judged too.`, nextCheckAtOrdinal: nextAfterThis };
  }
  const scheduled = automationStudioResultCheckOrdinals(settings, ordinal);
  if (scheduled.includes(ordinal)) {
    const initial = Math.max(0, Math.trunc(settings.initialRunCount));
    return ordinal <= initial
      ? { check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.initialWindow, reason: `This is run ${ordinal} of the first ${initial} since the Flow last changed, and those are all checked.`, nextCheckAtOrdinal: nextAfterThis }
      : { check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalReached, reason: `Run ${ordinal} is the next one this Flow's schedule checks.`, nextCheckAtOrdinal: nextAfterThis };
  }
  if (state.lastStatus === "unverified" && state.lastCheckedOrdinal !== null && scheduled.includes(state.lastCheckedOrdinal)) {
    return { check: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.reaskUnsettled, reason: `The check on run ${state.lastCheckedOrdinal} settled nothing, so the same question was asked of this run.`, nextCheckAtOrdinal: nextAfterThis };
  }
  return {
    check: false,
    code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.intervalNotReached,
    reason: nextAfterThis === null
      ? `Run ${ordinal} is not one this Flow's schedule checks.`
      : `Run ${ordinal} is not one this Flow's schedule checks; the next check is at run ${nextAfterThis}.`,
    nextCheckAtOrdinal: nextAfterThis
  };
}
