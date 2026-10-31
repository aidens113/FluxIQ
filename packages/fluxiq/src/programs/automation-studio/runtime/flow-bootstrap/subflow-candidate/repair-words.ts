// What a subflow builder is told of repairing a failed test from its failing step
// (t804, `./pending-repair.ts`): the test tool's description, a failed test's
// next step, the refusal of a whole test while a repair stands, a from-step
// run's answer, and the submit answer's `next`. Said only where the gate's port
// can run from a step; elsewhere every word is as it was. Generic words: never a
// scenario's site, product or task.
import type { AutomationStudioSubflowRepairChecked, AutomationStudioSubflowRepairStep } from "./pending-repair.ts";

const TEST = "core.test_subflow";
const SUBMIT = "core.submit_subflow";

/** A step as the words name it: its key, and its label where it has one. */
function named(step: AutomationStudioSubflowRepairStep): string {
  return step.label ? `step "${step.key}" ("${step.label}")` : `step "${step.key}"`;
}

/** The call that runs `receipt` from `key`, exactly. */
function call(receipt: { revision: number; digest: string }, key: string): string {
  return `{"revision": ${receipt.revision}, "digest": "${receipt.digest}", "from": "${key}"}`;
}

/** How a whole test is asked for while a repair stands, where a run from the step cannot check it. */
const IMPOSSIBLE = "Only where a run from that step cannot check it -- the step needs state only the part's start makes -- test the whole part with fromStepImpossible: a sentence saying why.";

/** Not the part's test: what every from-step answer says of itself. */
const NOT_THE_TEST = "This run is not the part's test: nothing was judged, and it never counts for completing the brief.";

export const AUTOMATION_STUDIO_SUBFLOW_REPAIR_WORDS = Object.freeze({
  /** Appended to the test tool's description where the port can run from a step. */
  description: `After a test fails, repair it live: work on the failing step from the page the test left, ${SUBMIT} the change, then check it by calling this tool with that revision and digest and from: the step's key, which runs the part from that step on the page as it stands, with no judge. That run is not the part's test. Test the whole part (no from) only when you believe the whole part works.`,

  /** Appended to a failed whole test's instruction while its repair stands: where to repair and how to check it. */
  afterFailed(step: AutomationStudioSubflowRepairStep | undefined, verdict: "no" | "execution_failed"): string {
    const where = step ? named(step) : verdict === "no" ? "the first step you change" : "the step that failed";
    return `Repair live, from the page this test left: work on ${where} there, then ${SUBMIT} the change. `
      + `Check the fix with ${TEST} and from: that step's key, which runs the part from that step on the page as it stands, never every step before it. `
      + "Test the whole part again only when you believe the whole part works; until a run from that step passes it, a whole test is refused.";
  },

  /** The refusal of a whole test while a repair stands (`subflow.trial_from_step_first`). */
  refused(step: AutomationStudioSubflowRepairStep | undefined, latest: { revision: number; digest: string }): string {
    const run = step
      ? `run it from ${named(step)}, or a step before it, on the page as it stands: call ${TEST} with exactly ${call(latest, step.key)}, and repair that step from the page the run leaves until a run passes it.`
      : `run it from the step you repaired, on the page as it stands: call ${TEST} with that revision and digest and from: that step's key, until a run from it reaches the part's end.`;
    return `A test of this part failed and its repair is not checked yet, so the whole part is not tested again: ${run} Then test the whole part, once you believe it works. ${IMPOSSIBLE}`;
  },

  /** A from-step run's instruction, by what it did and what it did to the repair standing. */
  answered(input: { status: "ended" | "stopped"; from: string; stoppedAt?: string | undefined; checked: AutomationStudioSubflowRepairChecked; latest: { revision: number; digest: string } }): string {
    const { checked } = input;
    const ran = input.status === "ended" ? `The run from step "${input.from}" reached the part's end.` : `The run from step "${input.from}" stopped at step "${input.stoppedAt ?? input.from}" (steps says why).`;
    const repairFurther = input.status === "stopped" ? ` Repair step "${input.stoppedAt ?? input.from}" live from the page this run left, ${SUBMIT} the change, and run from it again with ${TEST} and from.` : "";
    if (checked.standing && checked.cleared) {
      return `${ran} ${NOT_THE_TEST} It passed the step the failed test is repaired on, so the whole part may be tested again.${repairFurther} Test the whole part (no from) only when you believe the whole part works.`;
    }
    if (checked.standing && checked.why === "unchanged") {
      return `${ran} ${NOT_THE_TEST} This is the revision the judge answered no for, so it checks no repair: change what the feedback names, ${SUBMIT} it, then run from the first step you changed.`;
    }
    if (checked.standing && checked.why === "started_after" && checked.step) {
      return `${ran} ${NOT_THE_TEST} It started after ${named(checked.step)}, the step the failed test is repaired on, so it does not check that repair: run from that step or one before it, with exactly ${call(input.latest, checked.step.key)}.`;
    }
    if (checked.standing) {
      const what = checked.step ? `did not pass ${named(checked.step)}, the step the failed test is repaired on` : "did not reach the part's end";
      return `${ran} ${NOT_THE_TEST} It ${what}, so the repair is not checked yet and the whole part is not tested again.${repairFurther || ` Repair it live from the page this run left, ${SUBMIT} the change, and run from it again with ${TEST} and from.`}`;
    }
    return `${ran} ${NOT_THE_TEST}${repairFurther} Test the whole part (no from) only when you believe the whole part works.`;
  },

  /** The submit answer's `next` while a repair stands: run from its step first. */
  next(step: AutomationStudioSubflowRepairStep | undefined, latest: { revision: number; digest: string }): string {
    const how = step ? `with exactly ${call(latest, step.key)}` : "with that revision and digest and from: the key of the step you repaired";
    return `A test of this part failed: check this repair next by running it from the failing step, on the page as it stands: call ${TEST} ${how}. That run is not the part's test. Test the whole part only when you believe the whole part works; until a run from that step passes it, a whole test is refused.`;
  },

  /** Appended to the submit answer's `next` while no repair stands. */
  wholeWhenReady: "Test the whole part when you believe the whole part works; after a test fails, repair the failing step live and check it by running from it, with from.",

  unavailable: "Core cannot run this part from a step here, so from is not taken. Test the whole part with the revision and digest alone.",
  reasonEmpty: "fromStepImpossible must say, in a sentence, why a run from the failing step cannot check its repair; it was empty. Run from that step with from instead, or give the reason.",
  notRun: (code: string): string => `Core did not run the part from that step (${code}): nothing ran. ${NOT_THE_TEST} Read notRun, then run from a step the latest proposal has, or test the whole part.`,
  unknownStep: (from: string, labelled = false): string => `The latest proposal has no step "${from}", so nothing ran. Give from as one of the keys under steps, exactly as written there${labelled ? ", or as the label of one step listed under labelled" : ""}.`,
  ambiguousLabel: (label: string, keys: readonly string[]): string => `The label "${label}" names more than one step (${keys.map((key) => `"${key}"`).join(", ")}), so nothing ran. Give from as the key of the one you mean.`
});
