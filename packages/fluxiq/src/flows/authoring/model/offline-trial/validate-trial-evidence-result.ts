// Validates unknown input against the trial evidence result contract and
// answers a normalized copy. The rules are what keeps an offline result from
// passing for a live one (trace-offline-trials-plan, Decisions 2 and 3):
//
// - a pass carries no missing evidence and no reasons, and every task-goal
//   assertion it checked is satisfied (an unverified outcome is never a pass,
//   even when a success notice was recorded -- source test T18);
// - an inconclusive result names its reasons and its missing evidence, and a
//   fail names its reasons; every gap's reason is among the result's reasons;
// - a live origin names the live episode it observed, and a named live
//   episode means a live origin;
// - a full live run is exactly live; a full recorded path is recorded;
//   recorded evidence names the live episodes it came from;
// - every verdict, origin, scope, reason and outcome is from the closed
//   vocabularies in `./vocabulary.ts`.

import type { AutomationStudioValidationIssue } from "../validation/index.ts";
import type {
  AutomationStudioTrialEvidenceAssertion,
  AutomationStudioTrialEvidenceGap,
  AutomationStudioTrialEvidenceOrigin,
  AutomationStudioTrialEvidenceReasonCode,
  AutomationStudioTrialEvidenceResult,
  AutomationStudioTrialEvidenceSupport,
  AutomationStudioTrialEvidenceValidation
} from "./types.ts";
import {
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_ASSERTION_OUTCOMES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_PROVENANCES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES,
  AUTOMATION_STUDIO_TRIAL_EVIDENCE_VERDICTS
} from "./vocabulary.ts";

type Issues = AutomationStudioValidationIssue[];
type Fields = Record<string, unknown>;

function fail(issues: Issues, code: string, message: string, path: string): void {
  issues.push({ severity: "error", code: `trial_evidence.${code}`, message, path });
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function member<T extends string>(vocabulary: readonly T[], value: unknown, issues: Issues, code: string, path: string): T | undefined {
  if (typeof value === "string" && (vocabulary as readonly string[]).includes(value)) return value as T;
  fail(issues, code, `${path} must be one of ${vocabulary.join(", ")}`, path);
  return undefined;
}

function text(value: unknown, issues: Issues, path: string): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  fail(issues, "text_invalid", `${path} must be a non-empty string`, path);
  return "";
}

function list(value: unknown, issues: Issues, path: string): unknown[] {
  if (Array.isArray(value)) return value;
  fail(issues, "list_invalid", `${path} must be an array`, path);
  return [];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function texts(value: unknown, issues: Issues, path: string): string[] {
  return unique(list(value, issues, path).map((entry, index) => text(entry, issues, `${path}[${index}]`)));
}

function reasons(value: unknown, issues: Issues, path: string): AutomationStudioTrialEvidenceReasonCode[] {
  const found = list(value, issues, path).map((entry, index) => member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES, entry, issues, "reason_unknown", `${path}[${index}]`));
  return unique(found.filter((entry) => entry !== undefined));
}

function origins(value: unknown, issues: Issues): AutomationStudioTrialEvidenceOrigin[] {
  const raw = list(value, issues, "evidenceOrigins");
  if (Array.isArray(value) && raw.length === 0) fail(issues, "origins_empty", "evidenceOrigins must name at least one origin", "evidenceOrigins");
  const found = new Set(raw.map((entry, index) => member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS, entry, issues, "origin_unknown", `evidenceOrigins[${index}]`)));
  return AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS.filter((origin) => found.has(origin));
}

function support(value: unknown, issues: Issues): AutomationStudioTrialEvidenceSupport {
  if (!isFields(value)) {
    fail(issues, "support_invalid", "supported must be an object of observations and operations", "supported");
    return { observations: [], operations: [] };
  }
  return { observations: texts(value.observations, issues, "supported.observations"), operations: texts(value.operations, issues, "supported.operations") };
}

function assertions(value: unknown, issues: Issues): AutomationStudioTrialEvidenceAssertion[] {
  return list(value, issues, "assertionsChecked").map((entry, index) => {
    const path = `assertionsChecked[${index}]`;
    const fields = isFields(entry) ? entry : {};
    const outcome = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_ASSERTION_OUTCOMES, fields.outcome, issues, "assertion_outcome_unknown", `${path}.outcome`);
    return { id: text(fields.id, issues, `${path}.id`), outcome: outcome ?? "unverified" };
  });
}

function gaps(value: unknown, issues: Issues): AutomationStudioTrialEvidenceGap[] {
  return list(value, issues, "missingEvidence").map((entry, index) => {
    const path = `missingEvidence[${index}]`;
    const fields = isFields(entry) ? entry : {};
    const reasonCode = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES, fields.reasonCode, issues, "reason_unknown", `${path}.reasonCode`);
    const scope = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES, fields.scope, issues, "scope_unknown", `${path}.scope`);
    const operation = fields.operation === null ? null : text(fields.operation, issues, `${path}.operation`);
    return { reasonCode: reasonCode ?? "incomplete_capture", scope: scope ?? "segment", operation, detail: text(fields.detail, issues, `${path}.detail`) };
  });
}

function revision(value: unknown, issues: Issues): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  fail(issues, "candidate_revision_invalid", "candidateRevision must be a non-negative integer", "candidateRevision");
  return 0;
}

function liveEpisode(value: unknown, issues: Issues): string | null {
  return value === null || value === undefined ? null : text(value, issues, "liveEpisodeId");
}

function checkVerdict(result: AutomationStudioTrialEvidenceResult, issues: Issues): void {
  if (result.verdict === "pass") {
    if (result.missingEvidence.length > 0) fail(issues, "pass_with_missing_evidence", "a pass must not carry missing evidence", "missingEvidence");
    if (result.reasonCodes.length > 0) fail(issues, "pass_with_reasons", "a pass must not carry reason codes", "reasonCodes");
    if (result.assertionsChecked.length === 0) fail(issues, "pass_without_assertions", "a pass must check at least one task-goal assertion", "assertionsChecked");
    if (result.assertionsChecked.some((assertion) => assertion.outcome !== "satisfied")) fail(issues, "pass_with_unsatisfied_assertion", "a pass needs every checked assertion satisfied", "assertionsChecked");
  }
  if (result.verdict === "inconclusive") {
    if (result.reasonCodes.length === 0) fail(issues, "inconclusive_without_reason", "an inconclusive result must name a reason", "reasonCodes");
    if (result.missingEvidence.length === 0) fail(issues, "inconclusive_without_missing_evidence", "an inconclusive result must name the evidence it lacked", "missingEvidence");
  }
  if (result.verdict === "fail" && result.reasonCodes.length === 0) fail(issues, "fail_without_reason", "a fail must name a reason", "reasonCodes");
  result.missingEvidence.forEach((gap, index) => {
    if (!result.reasonCodes.includes(gap.reasonCode)) fail(issues, "gap_reason_not_listed", `missingEvidence[${index}].reasonCode must also be listed in reasonCodes`, `missingEvidence[${index}].reasonCode`);
  });
}

function checkProvenance(result: AutomationStudioTrialEvidenceResult, issues: Issues): void {
  const live = result.evidenceOrigins.includes("live");
  if (live && result.liveEpisodeId === null) fail(issues, "live_without_episode", "a live origin must name the live episode it observed", "liveEpisodeId");
  if (!live && result.liveEpisodeId !== null) fail(issues, "episode_without_live", "a live episode needs the live origin", "liveEpisodeId");
  const liveOnly = result.evidenceOrigins.length === 1 && live;
  if (result.scope === "full_live_run" && !liveOnly) fail(issues, "full_live_run_not_live_only", "a full live run must have exactly the live origin", "evidenceOrigins");
  const recorded = result.evidenceOrigins.includes("recorded");
  if (result.scope === "full_recorded_path" && !recorded) fail(issues, "full_recorded_path_not_recorded", "a full recorded path must have the recorded origin", "evidenceOrigins");
  if (recorded && result.sourceEpisodeIds.length === 0) fail(issues, "recorded_without_source_episode", "recorded evidence must name the live episodes it came from", "sourceEpisodeIds");
}

/** Validate `input` against the trial evidence result contract; on success the answer is a normalized, unaliased copy. */
export function validateAutomationStudioTrialEvidenceResult(input: unknown): AutomationStudioTrialEvidenceValidation {
  const issues: Issues = [];
  if (!isFields(input)) {
    fail(issues, "not_object", "a trial evidence result must be an object", "");
    return { ok: false, issues };
  }
  const verdict = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_VERDICTS, input.verdict, issues, "verdict_unknown", "verdict");
  const scope = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES, input.scope, issues, "scope_unknown", "scope");
  const provenance = member(AUTOMATION_STUDIO_TRIAL_EVIDENCE_PROVENANCES, input.provenance, issues, "provenance_unknown", "provenance");
  const result: AutomationStudioTrialEvidenceResult = {
    verdict: verdict ?? "inconclusive",
    evidenceOrigins: origins(input.evidenceOrigins, issues),
    scope: scope ?? "segment",
    candidateRevision: revision(input.candidateRevision, issues),
    candidateDigest: text(input.candidateDigest, issues, "candidateDigest"),
    goalContractVersion: text(input.goalContractVersion, issues, "goalContractVersion"),
    sourceEpisodeIds: texts(input.sourceEpisodeIds, issues, "sourceEpisodeIds"),
    liveEpisodeId: liveEpisode(input.liveEpisodeId, issues),
    supported: support(input.supported, issues),
    assertionsChecked: assertions(input.assertionsChecked, issues),
    reasonCodes: reasons(input.reasonCodes, issues, "reasonCodes"),
    missingEvidence: gaps(input.missingEvidence, issues),
    provenance: provenance ?? "derived"
  };
  checkVerdict(result, issues);
  checkProvenance(result, issues);
  return issues.length === 0 ? { ok: true, result } : { ok: false, issues };
}
