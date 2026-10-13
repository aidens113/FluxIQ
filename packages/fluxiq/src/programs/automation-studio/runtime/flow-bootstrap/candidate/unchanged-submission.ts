// What the model is told when it submits a Flow that has not changed (t464).
//
// Lane B round 8 (`run-mv5jnc62-01c3609a`) resubmitted one script unchanged
// seven times after its trial failed. Three of those were accepted as new
// revisions -- the script was the same word for word, but the digest follows
// the resolved plan, which moved as exploration went on -- and each new
// revision was "test next", so the build spent its 64 calls re-testing a Flow
// it had not changed. Lane C round 8 (`run-mv5jnc51-9eac63f2`, step 0076)
// resubmitted a Flow the judge had refuted, and was accepted as revision 11 and
// told to test it, a test the gate then refused as unchanged after a no.
//
// So a submission that changes nothing is not a new revision. The submission
// controller (`./submission.ts`) refuses it with this check, which says that
// nothing changed, names the revision it is the same as, and gives what failed
// last: the standing trial's verdict and feedback, or the judge's finding for a
// refuted Flow. Every word of that is Core's own or the trial's, which the
// model was already shown.
//
// The refusal is counted like any other (`./submission-refusal.ts`), under its
// own code, so the run of refusals is keyed as t442 keyed it: two unchanged
// resubmissions in a row are the same refusal.
//
// **A Flow reworded and nothing else is unchanged too (t485).** Lane D round 12
// build 2 (`run-mv636xyp-2e4fe54d`, N1) resubmitted its Flow three times with
// only its title and step labels reworded; the digest follows the whole plan,
// names included, so each became a new revision and was trialled. What a run
// does is the plan without its display words: the Flow's and each router
// rule's and block's `name`, each step's `label`, and a list step's
// record-output `label` (`automationStudioCandidateSameBehaviour`). Its
// record-output `datasetId` is not one of them (supervisor, t485): it decides
// where the run records its results, so a changed one is a changed Flow, even
// when it changed only because it is derived from a reworded step label
// (`../authoring/record-output.ts`). A submission the same
// as the standing revision by that measure is answered as unchanged, saying
// only names differ (`reworded`), rather than renamed in place: a trial's
// verdict is bound to the revision and digest that ran, and renaming a tried
// revision in place would either void that verdict or leave a digest that no
// longer names its plan. The standing revision keeps its own names. A renamed
// step key is not a name here: edges and bindings read it, so it is a change.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioCandidateTrialResult, AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "./contracts.ts";

/** The parameter a step keeps its rows by, and its one display-only word; its `datasetId` decides where rows go (header). */
const RECORD_OUTPUT = "recordOutput";
const RECORD_OUTPUT_NAMES: readonly string[] = ["label"];

/** Whether two plans do the same when run: equal once every name is set aside (header). */
export function automationStudioCandidateSameBehaviour(a: AutomationStudioFlowBuildPlan, b: AutomationStudioFlowBuildPlan): boolean {
  return canonical(behaviourOf(a)) === canonical(behaviourOf(b));
}

/** The plan with its names set aside: what a run of it does (header). */
function behaviourOf(buildPlan: AutomationStudioFlowBuildPlan): JsonValue {
  const plan = buildPlan.plan;
  return {
    router: { ...plan.router, name: "", rules: plan.router.rules.map((rule) => ({ ...rule, name: "" })) },
    subflows: plan.subflows.map((subflow) => ({
      ...subflow,
      name: "",
      nodes: subflow.nodes.map(({ label: _label, ...node }) => ({ ...node, ...(node.parameters ? { parameters: unnamedParameters(node.parameters) } : {}) }))
    })),
    ...(plan.metadata ? { metadata: plan.metadata } : {})
  } as unknown as JsonValue;
}

function unnamedParameters(parameters: JsonObject): JsonObject {
  const output = parameters[RECORD_OUTPUT];
  if (!output || typeof output !== "object" || Array.isArray(output)) return parameters;
  return { ...parameters, [RECORD_OUTPUT]: Object.fromEntries(Object.entries(output).filter(([key]) => !RECORD_OUTPUT_NAMES.includes(key))) };
}

/** JSON object key order never changes what a plan does. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}

const SUBMIT = "core.submit_candidate";
const TEST = "core.test_candidate";

/** The refusal check for a submission that changes nothing, with what failed last. */
export function automationStudioCandidateUnchangedRefusal(input: {
  /** The standing revision the submission is the same as, when it is one; absent for a Flow refuted under an earlier revision. */
  standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined;
  /** The standing revision's latest trial, when it was tried. */
  lastTrial: AutomationStudioCandidateTrialResult | undefined;
  /** The judge's finding, when this exact Flow was judged no. */
  refuted: JsonObject | undefined;
  /** Set when the submission differs from `standing` in its names alone (header). */
  reworded?: boolean | undefined;
}): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const { standing, lastTrial, refuted } = input;
  const reworded = input.reworded === true && standing !== undefined;
  const code = refuted ? "candidate.unchanged_after_no" : "candidate.unchanged_submission";
  const same = reworded
    ? `Nothing the Flow does changed: this is the Flow of revision ${standing.revision} with only names reworded (the Flow's, its steps' or its saved list's), which no run acts on, so it was not made a new revision and revision ${standing.revision} keeps its own names`
    : standing
      ? `Nothing changed: this is the Flow of revision ${standing.revision}, word for word or step for step, so it was not made a new revision`
      : "Nothing changed: this is the same Flow as one the judge already refuted, so it was not made a new revision";
  return {
    ok: false,
    issueCodes: [code],
    feedback: {
      ok: false,
      code,
      unchanged: true,
      ...(reworded ? { reworded: true } : {}),
      ...(standing ? { revision: standing.revision, digest: standing.digest } : {}),
      ...(lastTrial ? { lastTrial: { verdict: lastTrial.verdict, feedback: structuredClone(lastTrial.feedback) } } : {}),
      ...(refuted ? { judged: structuredClone(refuted) } : {}),
      instruction: `${same}. ${whatFailed(standing, lastTrial, refuted)}`
    }
  };
}

/** What failed last and the way out, in the words the trial gate uses for the same verdicts (`./trial-gate.ts`). */
function whatFailed(standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined, lastTrial: AutomationStudioCandidateTrialResult | undefined, refuted: JsonObject | undefined): string {
  if (refuted) {
    return "The judge found its trial did not do what the instruction asks (what it found is under judged), and submitting it again cannot change that: this exact Flow cannot be tested again or completed. "
      + `Change the Flow to fix what the judge found, submit the whole changed Flow with ${SUBMIT}, then test the new revision.`;
  }
  if (!lastTrial) {
    return `Revision ${standing?.revision} still stands and has not been tested: test it with ${TEST} using exactly that revision and digest, or change the Flow and submit the whole changed Flow.`;
  }
  if (lastTrial.verdict === "yes") {
    return `Its trial already answered yes: complete with exactly revision ${standing?.revision} and its digest.`;
  }
  return `Its last trial answered ${lastTrial.verdict}; what failed is under lastTrial (the step that stopped, and what it says happened). `
    + "Submitting the same Flow again cannot change that. Change the step that feedback names, or the steps that lead to it, and submit the whole changed Flow; "
    + `test the same revision again with ${TEST} only if that feedback says trying again may pass.`;
}
