import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioSiteResetTrialActPlace } from "../site-reset/index.ts";
import type { AutomationStudioSiteResetWitnessStamp } from "../reset-admission/index.ts";
import type { AutomationStudioFlowBootstrapCompletionVerdict, AutomationStudioFlowBootstrapPlanHandleView } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../environment/index.ts";
import type { AutomationStudioTrialOfflineFirst } from "../offline-first/index.ts";
import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeOutcome } from "../trial-change/index.ts";

/** Historical owner-enumerated bytes, never pinned-read or execution authority. */
export type AutomationStudioCandidateOriginalSources = {
  schemaVersion: "candidate.original_sources.v1";
  projectId: string;
  flowId: string;
  inventoryInstructionIds: readonly string[];
  instructions: readonly AutomationStudioFlowInstruction[];
  effectiveInstructionIds: readonly string[];
  excludedInstructionIds: readonly string[];
};
export type AutomationStudioCandidateOriginalSourceBinding = {
  originalSources: AutomationStudioCandidateOriginalSources;
  originalInstructionsDigest: string;
};

/** Static submission receipt. It grants neither execution nor promotion. */
export type AutomationStudioFlowCandidate = {
  revision: number;
  digest: string;
  baseDependencyDigest: string;
  status: "draft";
  summary: string;
  buildPlan: AutomationStudioFlowBuildPlan;
  changedPaths: string[];
  fingerprintVersion?: "candidate.plan+original_sources.v2";
  originalInstructionsDigest?: string;
};

export type AutomationStudioFlowCandidateSubmission =
  /**
   * `handleViews`: which of exploration's views each target handle the
   * candidate named was resolved from (t358, `./submission.ts`) -- its node, the
   * handle, the domain's number for that view and the location it reported. A
   * record of where the targets were learned, beside the candidate rather than
   * in it: it is outside the digest and the stored draft, and grants nothing.
   */
  | { ok: true; candidate: AutomationStudioFlowCandidate; handleViews: AutomationStudioFlowBootstrapPlanHandleView[]; advice?: string[] }
  | { ok: false; revision: number; check: Extract<AutomationStudioFlowBootstrapCompletionVerdict, { ok: false }>["check"] };

/**
 * What a submission is compared with before it becomes a new revision (t464):
 * the trial verdict standing for the current revision, and whether the judge
 * refuted a Flow by its digest. Both are the trial gate's (`./trial-gate.ts`),
 * handed to `submit` by the loop that owns both, so the controller never
 * holds a second copy of a verdict.
 */
export type AutomationStudioFlowCandidateSubmissionHistory = {
  trialOf?: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => AutomationStudioCandidateTrialResult | undefined;
  refuted?: (digest: string) => JsonObject | undefined;
};

/**
 * One trial of a submitted candidate: Core runs that exact candidate once from
 * its declared start and judges only what the trial did. The port is injected
 * by the service that owns execution and judging; the authoring loop only asks
 * and records the answer. `candidate` is the exact submission `revision` and
 * `digest` name, so the port runs the bytes the verdict is bound to.
 */
export type AutomationStudioCandidateTrialRequest = {
  candidateId: string;
  revision: number;
  digest: string;
  signal: AbortSignal;
  candidate: Readonly<AutomationStudioFlowCandidate>;
  /**
   * What of this build was already on the site when the trial began, one
   * entry per act or difference in Core's or the domain's words
   * (`../site-reset/trial-policy.ts`, `startedWith`; t471). The judge is told,
   * so a row the build had already done is read as done, not as the Flow's
   * work or its failure. Absent when the site was as the build found it.
   */
  startedWith?: readonly string[];
  /**
   * Each earlier judged trial of this build's advice, oldest first, at most
   * three, with Core's finding of whether this revision changed what it named
   * (t752, `./earlier-advice-memory.ts`): the judge is told it, last in its
   * summary. Absent where no trial of another revision gave advice.
   */
  earlierAdvice?: readonly import("../../result-verification/contracts/index.ts").AutomationStudioResultEarlierAdvice[];
  /**
   * What the live trial changed on the site (t775): Core read each place a lasting step's change shows just before the
   * trial; the port calls this after its end view and before its judge, with the trial's acts (landed, and passed over as
   * already in the asked state), and hands the packet and Core's findings to the judge's summary as `siteChange`. Absent
   * for an offline trial, which changes nothing, and where nothing of the change could be read.
   */
  siteChange?: (acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal) => Promise<AutomationStudioTrialChangeOutcome>;
};

export const AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS = Object.freeze(["yes", "no", "unsure", "not_judged", "execution_failed"] as const);
export type AutomationStudioCandidateTrialVerdict = (typeof AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS)[number];

/**
 * One lasting act a trial's run made that landed (t462): a step whose node
 * declared a lasting consequence and that succeeded, so the site keeps its
 * effect after the trial. Read off the trial's own trace
 * (`../../service/candidate-trial/`); the build undoes it before its next
 * trial (`../site-reset/`).
 */
export type AutomationStudioCandidateTrialAct = {
  /** The step's number, as the trial's `feedback.steps` numbers it. */
  step: number;
  definitionId: string;
  label?: string;
  /** The words of the control the step acted on, as the feedback gives them. */
  control?: string;
  consequences: AutomationStudioActionConsequence[];
  /**
   * Its step declared no lasting consequence (`consequences` empty) but changed
   * its own page in place, so it is possibly lasting (t593): a project build's
   * ledgers record it and never ask for it (`../site-reset/ledger.ts`); a
   * gate that keeps only declared acts drops it.
   */
  possible?: true;
  /**
   * What its step's reversible lasting act is witnessed by (t751, R3 door 2):
   * the stamp Core's admission gave the step at submission, read off the Flow
   * node's metadata (`./reset-witness-key.ts`) and valid as a stamp. Absent
   * where the step carried none.
   */
  witness?: AutomationStudioSiteResetWitnessStamp;
};

/** What the trial port answers. Only `yes` for the exact latest revision and digest lets the model complete. */
export type AutomationStudioCandidateTrialResult = {
  revision: number;
  digest: string;
  verdict: AutomationStudioCandidateTrialVerdict;
  /** Bounded JSON for the model: what the trial did and why the verdict, never exploration evidence. */
  feedback: JsonObject;
  trialRunId?: string;
  /** The trial's lasting acts that landed, whatever its verdict (t462), each with where its step sat and what it made (L1). Absent when it made none or ran nothing. */
  acts?: Array<AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace>;
  /**
   * Every act of the build a deployment's start hook took back before this
   * trial or an earlier one (t504): its id, what it did, and the exploration
   * call that made it. Set by the trial gate on the result it keeps, never
   * read from a port; absent when no hook took back anything of the build.
   */
  absorbedByStartReset?: Array<{ act: string; did: string; call?: string }>;
};

/**
 * How a trial's start was prepared ahead of the reset's check (t475): `reset`
 * when the deployment's start hook has just put the site back, `failed` when
 * the hook failed (the trial then answers that without running), and `none`
 * when no hook ran -- there is none, or the trial is a re-judgement that runs
 * nothing.
 */
export type AutomationStudioCandidateTrialPrepared = "reset" | "failed" | "none";

/**
 * Runs one trial. `prepareStart`, when the port has a start hook, runs that
 * hook first, before the trial gate's reset check (t475): the site is put
 * back, and the reset asks the model for nothing (t479). The
 * trial of the same revision and digest that follows uses that start and does
 * not run the hook again.
 *
 * `environmentKind` is the kind of environment the port's trials run in
 * (traces and offline trials, U7). Set and not `live`, a trial is offline: the
 * trial gate runs no start hook and no site reset for it (Decision 6), and its
 * yes is evidence only, never the judged pass that lets the build complete
 * (Decision 3). Absent, the trials are live.
 *
 * `offlineFirst`, when present (trace plan P6, t769), is asked by the trial
 * gate once per revision and digest, before any site action: a failure the
 * recording of the build's last live test demonstrates is kept in place of a
 * site trial, and anything else runs live (`../offline-first/contracts.ts`).
 */
export type AutomationStudioCandidateTrialPort = ((request: AutomationStudioCandidateTrialRequest) => Promise<AutomationStudioCandidateTrialResult>) & {
  prepareStart?: ((input: { revision: number; digest: string; signal: AbortSignal }) => Promise<AutomationStudioCandidateTrialPrepared>) | undefined;
  readonly environmentKind?: AutomationStudioRunEnvironmentKind | undefined;
  offlineFirst?: AutomationStudioTrialOfflineFirst<AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult> | undefined;
};
