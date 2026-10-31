import { AutomationStudioFlowCandidateSubmissionController, type AutomationStudioCandidateOriginalSourceBinding, type AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { authoringScopePartOf } from "../../flow-bootstrap/record-defaults/index.ts";
import { automationStudioProjectDispatchScope } from "../dispatch/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildRecord } from "../record/index.ts";
import { automationStudioProjectSingleSubflowAssemble } from "./proposal-assembly.ts";
import { automationStudioProjectSingleSubflowPlan } from "./single-subflow-plan.ts";

// A single-subflow plan's candidate rebuilt from a script its builder submitted
// (traces and offline trials, P5): what a trial of a recorded build ran, made
// again by Core's own authoring path and nothing else, so an offline trial
// runs exactly the Flow the live trial ran, and its digests can be checked
// against the recorded ones.
//
// The path is the build's, piece for piece:
//
// - the brief's scope under the record's latest plan, as the dispatcher maps
//   it (`../dispatch/scope.ts`);
// - the scoped submission controller reads the script and makes the proposal
//   and its digest, as a builder's `core.submit_subflow` does
//   (`flow-bootstrap/subflow-candidate/scoped-submission.ts`);
// - the single-subflow assembly joins it behind the arrival step and submits
//   it through a whole candidate's controller (`./proposal-assembly.ts`), the
//   very function a builder's single-subflow test calls
//   (`./single-subflow-trial.ts`).
//
// Each controller is fresh, so revisions are numbered from 1; a digest binds
// no revision number. No gate stands a verdict and no earlier plan kept a
// proposal, so nothing is answered as an earlier revision. Only a plan of one
// subflow the router runs gets a single-subflow test, so a brief of any other
// plan is refused at the `plan` stage under the code that test refuses it
// with; a brief the record does not hold, or a stale one, throws the
// record's refusal.

/** The surroundings both controllers check the Flow against: the scoped submission's, as the build hands them to its builders. */
export type AutomationStudioProjectSingleSubflowRebuildSubmission = Omit<ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0], "instructionText" | "originalSource">;

/** What a rebuild is made from: the build's stored record, the brief, the script as Core accepted it, and the build's submission surroundings. */
export type AutomationStudioProjectSingleSubflowRebuildInput = {
  record: AutomationStudioProjectBuildRecord;
  briefId: string;
  /** The script under `flow`, exactly as the builder submitted it. */
  script: string;
  submission: AutomationStudioProjectSingleSubflowRebuildSubmission;
  /** The whole candidate's instruction text, as the build's supervisor submits with it. */
  instructionText: string;
  /** The build's original sources, when its candidate binds them; absent for a build that bound none. */
  originalSource?: AutomationStudioCandidateOriginalSourceBinding | undefined;
};

/** The proposal and whole candidate a rebuild made, or the stage that refused it and its codes (with the proposal, once one was made). */
export type AutomationStudioProjectSingleSubflowRebuilt =
  | { ok: true; proposal: { revision: number; digest: string }; candidate: AutomationStudioFlowCandidate }
  | { ok: false; stage: "plan" | "subflow" | "assembly" | "composed"; codes: string[]; proposal?: { revision: number; digest: string } };

/** The code a single-subflow test refuses a brief of another plan with (`./single-subflow-trial.ts`). */
const NOT_THIS_PLAN = "project.whole_trial_not_this_plan";

/**
 * Rebuilds the whole single-subflow candidate `script` makes for `briefId`,
 * through the scope, the scoped submission and the single-subflow assembly a
 * builder's test runs (header). Throws `AutomationStudioProjectRecordRefusal`
 * for a brief the record does not hold or one written against an older plan.
 */
export async function automationStudioProjectSingleSubflowRebuild(input: AutomationStudioProjectSingleSubflowRebuildInput): Promise<AutomationStudioProjectSingleSubflowRebuilt> {
  const { record } = input;
  const brief = record.briefs.find((entry) => entry.brief.briefId === input.briefId)?.brief;
  if (!brief) throw new AutomationStudioProjectRecordRefusal("project.brief_unknown", "briefId");
  const { scope, siblings } = automationStudioProjectDispatchScope(record, brief);
  const structure = record.plans.at(-1)?.plan;
  if (!structure || automationStudioProjectSingleSubflowPlan(structure) !== scope.subflowKey) return { ok: false, stage: "plan", codes: [NOT_THIS_PLAN] };
  const submitted = await new AutomationStudioSubflowScopedSubmissionController({ scope, siblings, submission: input.submission }).submit({ flow: input.script });
  if (!submitted.ok) return { ok: false, stage: "subflow", codes: [...submitted.check.issueCodes] };
  const { proposal } = submitted;
  const made = { revision: proposal.revision, digest: proposal.digest };
  // A binding is passed only when there is one: the controller reads an `originalSource` key that is present as a binding.
  // The whole Flow's record outputs are defaulted from the one scope part that owes records, as the scoped submission's are (K5); a caller's own resolver wins.
  const partOf = input.submission.partOf ?? authoringScopePartOf(scope.parts.map((part) => ({ id: part.partId, words: part.text, columns: part.answer?.columns })));
  const whole = { ...input.submission, ...(partOf ? { partOf } : {}), instructionText: input.instructionText, ...(input.originalSource ? { originalSource: input.originalSource } : {}) };
  const assembled = await automationStudioProjectSingleSubflowAssemble({
    structure, scope, proposal, kept: new Map(),
    controller: new AutomationStudioFlowCandidateSubmissionController(whole),
    ports: { proposals: async () => undefined, submission: whole },
    gate: { standing: () => undefined, refuted: () => undefined }
  });
  if (!assembled.ok) return { ok: false, stage: assembled.kind, codes: assembled.kind === "assembly" ? assembled.issues.map((issue) => issue.code) : [assembled.code, ...assembled.issueCodes], proposal: made };
  return { ok: true, proposal: made, candidate: assembled.candidate };
}
