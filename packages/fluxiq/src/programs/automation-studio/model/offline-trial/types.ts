// Shared types of the trial evidence result contract. Independent fields
// rather than one overloaded success flag: an offline result can say exactly
// what it covered and what it lacked, and can never pass for a live success.

import type { AutomationStudioValidationIssue } from "../validation/index.ts";
import type {
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_ASSERTION_OUTCOMES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_PROVENANCES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_VERDICTS
} from "./vocabulary.ts";

export type AutomationStudioTrialEvidenceVerdict = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_VERDICTS)[number];
export type AutomationStudioTrialEvidenceOrigin = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS)[number];
export type AutomationStudioTrialEvidenceScope = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES)[number];
export type AutomationStudioTrialEvidenceReasonCode = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES)[number];
export type AutomationStudioTrialEvidenceAssertionOutcome = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_ASSERTION_OUTCOMES)[number];
export type AutomationStudioTrialEvidenceProvenance = (typeof AUTOMATION_STUDIO_TRIAL_EVIDENCE_PROVENANCES)[number];

/** One task-goal assertion the trial checked, kept independent of candidate edits. */
export type AutomationStudioTrialEvidenceAssertion = {
  id: string;
  outcome: AutomationStudioTrialEvidenceAssertionOutcome;
};

/** One piece of evidence the trial needed and did not have. */
export type AutomationStudioTrialEvidenceGap = {
  reasonCode: AutomationStudioTrialEvidenceReasonCode;
  /** The scope the gap affects. */
  scope: AutomationStudioTrialEvidenceScope;
  /** The operation the gap affects, or `null` when it affects the scope as a whole. */
  operation: string | null;
  detail: string;
};

/** What the trial's evidence could support. */
export type AutomationStudioTrialEvidenceSupport = {
  observations: string[];
  operations: string[];
};

/**
 * The result of one trial of one candidate revision. The candidate is named by
 * `candidateRevision` and `candidateDigest`, the same pair the candidate trial
 * gate binds its verdicts to. Episode ids are live run ids.
 */
export type AutomationStudioTrialEvidenceResult = {
  verdict: AutomationStudioTrialEvidenceVerdict;
  /** Non-empty, deduplicated, in vocabulary order. */
  evidenceOrigins: AutomationStudioTrialEvidenceOrigin[];
  scope: AutomationStudioTrialEvidenceScope;
  candidateRevision: number;
  candidateDigest: string;
  goalContractVersion: string;
  /** The earlier live episodes (run ids) whose traces supplied recorded evidence. */
  sourceEpisodeIds: string[];
  /** The live episode (run id) this result itself observed, or `null` when nothing here was live. */
  liveEpisodeId: string | null;
  supported: AutomationStudioTrialEvidenceSupport;
  assertionsChecked: AutomationStudioTrialEvidenceAssertion[];
  reasonCodes: AutomationStudioTrialEvidenceReasonCode[];
  missingEvidence: AutomationStudioTrialEvidenceGap[];
  provenance: AutomationStudioTrialEvidenceProvenance;
};

/** The validator's answer: the normalized result, or every issue found. */
export type AutomationStudioTrialEvidenceValidation =
  | { ok: true; result: AutomationStudioTrialEvidenceResult }
  | { ok: false; issues: AutomationStudioValidationIssue[] };

/** The candidate and goal contract a whole-run gate is deciding for. */
export type AutomationStudioTrialEvidenceGateSubject = {
  candidateRevision: number;
  candidateDigest: string;
  goalContractVersion: string;
};

/** A result as it leaves Core: always marked derived. */
export type AutomationStudioTrialEvidenceExport = {
  kind: "fluxiq.trial-evidence-result";
  result: AutomationStudioTrialEvidenceResult;
};
