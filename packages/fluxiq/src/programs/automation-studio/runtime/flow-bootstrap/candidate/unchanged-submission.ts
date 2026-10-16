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
//
// **Against a refuted Flow, a renamed `datasetId` is no change (t493,
// supervisor policy).** Live run `run-mv6bg8d8-1a461436` (D2): the judge
// refuted revision 2; the same Flow sent again was refused as
// `unchanged_after_no`, and then sent once more with only its `datasetId`
// renamed, which made it revision 5, re-tried and judged yes on the same
// evidence. Where a run saves its rows cannot change which rows it keeps, so a
// rename cannot answer a judge's no. Compared with a refuted Flow the
// `datasetId` is set aside (`{ datasetId: "set_aside" }`); compared with a
// revision that was not refuted it is still a change, as t485 decided.
//
// **It names the tools of the loop it is sent in (t632).** A8 wave 8
// `run-mv9gbsm5-2957581c` (0055, 0124): a subflow builder was told to "submit
// the whole changed Flow with core.submit_candidate", a tool its brief does not
// offer; there it is `core.submit_subflow` and `core.test_subflow`. The
// submission controller is given the loop's own tools and what it calls its
// submission (`tools`), and the refusal names those; without them it names the
// candidate loop's, as before.
//
// **And the revision still standing, where its trial was not a no (t632).** The
// same run's builder rebuilt, after an unsure trial, a Flow already judged no,
// following the unsure's no-reading, while the unsure revision could still be
// tested again. A refusal of a refuted Flow now names the revision that still
// stands when its last trial was unsure, not judged or failed to run, and says
// that testing it again is allowed and when that is the better move.
//
// **And the better move only on Core's findings (t641).** That offer called a
// re-test the better move where "one judge call said yes", as the trial gate's
// unsure words did; A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1` spent
// its last trial re-testing a wrong revision on one judge's yes. The offer now
// says a re-test is the better move only where Core's record contradicts what
// kept that trial from a yes -- the no's reading wholly, or the unsure call's
// doubt (`automationStudioCandidateRetestAdvised`, `./trial-gate.ts`), or a no
// the build's own record did not take (`contradictedByBuild`) -- and says so
// as a field (`standingRevision.retestAdvised`). Otherwise testing again stays
// allowed, only where the trial shows no defect.
//
// **And never that nothing contradicts a no Core refutes in part (t652).**
// Where that trial's no reading carries `recordContradicts: "part"`, the offer
// says Core's record contradicts part of it, as its label says, and to change
// the Flow only for what the rest names (`automationStudioCandidateRecordContradictsPart`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioCandidateTrialResult, AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission } from "./contracts.ts";
import { automationStudioCandidateRecordContradictsPart, automationStudioCandidateRetestAdvised } from "./trial-gate.ts";

/** The parameter a step keeps its rows by, and its one display-only word; its `datasetId` decides where rows go (header). */
const RECORD_OUTPUT = "recordOutput";
const RECORD_OUTPUT_NAMES: readonly string[] = ["label"];
/** Where a record output saves its rows: set aside only against a refuted Flow (header). */
const RECORD_OUTPUT_DATASET = "datasetId";

/** Whether two plans do the same when run: equal once every name is set aside, and the `datasetId` too where asked, as against a refuted Flow (header). */
export function automationStudioCandidateSameBehaviour(a: AutomationStudioFlowBuildPlan, b: AutomationStudioFlowBuildPlan, options: { datasetId?: "compared" | "set_aside" } = {}): boolean {
  const names = options.datasetId === "set_aside" ? [...RECORD_OUTPUT_NAMES, RECORD_OUTPUT_DATASET] : RECORD_OUTPUT_NAMES;
  return canonical(behaviourOf(a, names)) === canonical(behaviourOf(b, names));
}

/** The plan with its names set aside: what a run of it does (header). */
function behaviourOf(buildPlan: AutomationStudioFlowBuildPlan, names: readonly string[]): JsonValue {
  const plan = buildPlan.plan;
  return {
    router: { ...plan.router, name: "", rules: plan.router.rules.map((rule) => ({ ...rule, name: "" })) },
    subflows: plan.subflows.map((subflow) => ({
      ...subflow,
      name: "",
      nodes: subflow.nodes.map(({ label: _label, ...node }) => ({ ...node, ...(node.parameters ? { parameters: unnamedParameters(node.parameters, names) } : {}) }))
    })),
    ...(plan.metadata ? { metadata: plan.metadata } : {})
  } as unknown as JsonValue;
}

function unnamedParameters(parameters: JsonObject, names: readonly string[]): JsonObject {
  const output = parameters[RECORD_OUTPUT];
  if (!output || typeof output !== "object" || Array.isArray(output)) return parameters;
  return { ...parameters, [RECORD_OUTPUT]: Object.fromEntries(Object.entries(output).filter(([key]) => !names.includes(key))) };
}

/** JSON object key order never changes what a plan does. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** The submit and test tools of the loop a refusal is sent in, and what that loop calls what it submits ("Flow", "subflow"). */
type Tools = { submit: string; test: string; subject: string };

/** The candidate loop's own tools: what a refusal names unless the loop it is sent in names others (header). */
const CANDIDATE_TOOLS: Tools = Object.freeze({ submit: "core.submit_candidate", test: "core.test_candidate", subject: "Flow" });

/** Trial verdicts after which the same revision may be tested again, within the trial gate's bound. */
const RETESTABLE: ReadonlySet<string> = new Set(["unsure", "not_judged", "execution_failed"]);

/** The revision still standing beside a refuted Flow, with its last trial (header, t632). */
type Current = { revision: number; digest: string; lastTrial: AutomationStudioCandidateTrialResult | undefined };

/** The refusal check for a submission that changes nothing, with what failed last. */
export function automationStudioCandidateUnchangedRefusal(input: {
  /** The standing revision the submission is the same as, when it is one; absent for a Flow refuted under an earlier revision. */
  standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined;
  /** The standing revision's latest trial, when it was tried. */
  lastTrial: AutomationStudioCandidateTrialResult | undefined;
  /** The judge's finding, when this exact Flow was judged no. */
  refuted: JsonObject | undefined;
  /** Set when the submission differs from the refuted Flow only in its record output's `datasetId` (header, t493). */
  datasetRenamed?: boolean | undefined;
  /** Set when the submission differs from `standing` in its names alone (header). */
  reworded?: boolean | undefined;
  /** The tools of the loop the refusal is sent in (header, t632); the candidate loop's when absent. */
  tools?: Tools | undefined;
  /** Where the Flow was refuted: the revision that still stands, with its last trial, when it is another (header, t632). */
  current?: Current | undefined;
}): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const { standing, lastTrial, refuted } = input;
  const tools = input.tools ?? CANDIDATE_TOOLS;
  const retest = refuted ? retestable(input.current) : undefined;
  const reworded = input.reworded === true && standing !== undefined;
  const code = refuted ? "candidate.unchanged_after_no" : "candidate.unchanged_submission";
  const same = reworded
    ? `Nothing the Flow does changed: this is the Flow of revision ${standing.revision} with only names reworded (the Flow's, its steps' or its saved list's), which no run acts on, so it was not made a new revision and revision ${standing.revision} keeps its own names`
    : standing
      ? `Nothing changed: this is the Flow of revision ${standing.revision}, word for word or step for step, so it was not made a new revision`
      : refuted && input.datasetRenamed === true
        ? "Nothing the Flow does changed: this is a Flow the judge already refuted with only where it saves its rows (its datasetId) renamed, which cannot change which rows it keeps, so it was not made a new revision"
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
      ...(retest ? { standingRevision: { revision: retest.revision, digest: retest.digest, verdict: retest.verdict, retestAdvised: retest.advised } } : {}),
      instruction: `${same}. ${whatFailed(standing, lastTrial, refuted, tools)}${retest ? retestWords(retest, tools) : ""}`
    }
  };
}

/** A standing revision that may be tested again, and whether Core's findings make that the better move (header, t632, t641). */
type Retest = { revision: number; digest: string; verdict: string; advised: boolean; part: boolean };

/** The revision still standing beside a refuted Flow, when its last trial allows testing it again (header, t632, t641). */
function retestable(current: Current | undefined): Retest | undefined {
  const trial = current?.lastTrial;
  if (!current || !trial || !RETESTABLE.has(trial.verdict)) return undefined;
  const advised = trial.verdict === "unsure" && (typeof trial.feedback.contradictedByBuild === "string" || automationStudioCandidateRetestAdvised(trial));
  const part = !advised && trial.verdict === "unsure" && automationStudioCandidateRecordContradictsPart(trial);
  return { revision: current.revision, digest: current.digest, verdict: trial.verdict, advised, part };
}

/** That testing the standing revision again is allowed, and the better move only on Core's findings (header, t632, t641). Generic words, naming no site or task. */
function retestWords(retest: Retest, tools: Tools): string {
  const allowed = ` Revision ${retest.revision} still stands and its last trial answered ${retest.verdict}, so testing it again with ${tools.test}, using exactly revision ${retest.revision} and digest ${retest.digest}, is allowed until its retests run out. `;
  if (retest.advised) return `${allowed}It is the better move here (retestAdvised is true): Core's record contradicts what kept that trial from a yes -- the no's reading, the doubt, or a no the build's own record did not take, as its feedback says -- so the change that contradicted reading asks for is not.`;
  // Core's record contradicts part of the no's reading: never said to contradict nothing (header, t652).
  return retest.part
    ? `${allowed}Core's record contradicts part of the no's reading that kept that trial from a yes, as its label in unconfirmedReading says (retestAdvised is false): make no change for that part, and change the ${tools.subject} only for what the rest of it names where the trial's own reads, steps and stored rows show it.`
    : `${allowed}Nothing in Core's record contradicts what kept that trial from a yes (retestAdvised is false), so test it again only where its feedback, by the trial's own reads, steps and stored rows, shows no defect in the ${tools.subject} itself.`;
}

/** What failed last and the way out, in the words the trial gate uses for the same verdicts (`./trial-gate.ts`). */
function whatFailed(standing: Pick<AutomationStudioFlowCandidate, "revision" | "digest"> | undefined, lastTrial: AutomationStudioCandidateTrialResult | undefined, refuted: JsonObject | undefined, tools: Tools): string {
  const subject = tools.subject;
  if (refuted) {
    return `The judge found its trial did not do what the instruction asks (what it found is under judged), and submitting it again cannot change that: this exact ${subject} cannot be tested again or completed. `
      + `Change the ${subject} to fix what the judge found, submit the whole changed ${subject} with ${tools.submit}, then test the new revision.`;
  }
  if (!lastTrial) {
    return `Revision ${standing?.revision} still stands and has not been tested: test it with ${tools.test} using exactly that revision and digest, or change the ${subject} and submit the whole changed ${subject} with ${tools.submit}.`;
  }
  if (lastTrial.verdict === "yes") {
    return `Its trial already answered yes: complete with exactly revision ${standing?.revision} and its digest.`;
  }
  return `Its last trial answered ${lastTrial.verdict}; what failed is under lastTrial (the step that stopped, and what it says happened). `
    + `Submitting the same ${subject} again cannot change that. Change the step that feedback names, or the steps that lead to it, and submit the whole changed ${subject} with ${tools.submit}; `
    + `test the same revision again with ${tools.test} only if that feedback says trying again may pass.`;
}
