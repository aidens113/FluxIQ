// The subflow trial gate's own checks of a trial's result (`./subflow-trial-gate.ts`,
// header): what a port answered, read as the gate keeps it. A result that is not
// a partial subflow trial, or that is about another brief, plan, subflow,
// revision or digest, is no verdict about this one and is kept as an
// execution failure; a trial the port did not run is said as the port says it
// (t679); and Core's record of a no (t633), the kept conditions another gate
// found (t689) and the reads Core flagged (t692) are carried beside it, unread.
// The gate reads the port's answer through it, and a failure the recording
// demonstrates (trace plan P6, `./subflow-trial-offline-first.ts`) too, so both
// meet the same checks.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS } from "../candidate/index.ts";
import type { AutomationStudioResultKeptCondition, AutomationStudioResultKeptConditionsCarrier } from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScopeIdentity, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import type { AutomationStudioSubflowTrialKeptEveryRowRead, AutomationStudioSubflowTrialNotRun } from "./subflow-trial-gate.ts";

/** `raw`, a port's answer to a trial of `latest` in the brief `identity` names, as the gate keeps it, with what it carries beside it. */
export function automationStudioSubflowTrialResultRead(raw: unknown, identity: AutomationStudioSubflowScopeIdentity, latest: Pick<AutomationStudioSubflowProposal, "revision" | "digest">): {
  answer: AutomationStudioSubflowTrialResult;
  standingNo?: unknown;
  keptConditions?: AutomationStudioResultKeptCondition[];
  keptEveryRow?: AutomationStudioSubflowTrialKeptEveryRowRead[];
  notRun?: AutomationStudioSubflowTrialNotRun["notRun"];
} {
  const failed = (code: string): { answer: AutomationStudioSubflowTrialResult } => ({ answer: { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: "execution_failed", feedback: { code }, entryPrepared: false } });
  // A trial the port did not run, said as the port says it (header, t679).
  const notRun = notRunOf(raw);
  if (notRun) return { answer: failed("subflow.trial_not_run").answer, notRun };
  const result = raw as Partial<AutomationStudioSubflowTrialResult> | null;
  if (!result || typeof result !== "object" || result.partial !== true || result.scope !== "subflow" || typeof result.entryPrepared !== "boolean"
    || !(AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(result.verdict) || !isJsonObject(result.feedback)
    || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return failed("subflow.trial_result_invalid");
  // A verdict about another brief, plan, subflow, revision or digest is no verdict about this one.
  const said = result.identity;
  if (!said || said.buildId !== identity.buildId || said.briefId !== identity.briefId || said.planDigest !== identity.planDigest || said.subflowKey !== identity.subflowKey
    || result.revision !== latest.revision || result.digest !== latest.digest) return failed("subflow.trial_result_mismatch");
  const kept: AutomationStudioSubflowTrialResult = { partial: true, scope: "subflow", identity: { ...identity }, revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback), entryPrepared: result.entryPrepared };
  if (result.trialRunId) kept.trialRunId = result.trialRunId;
  if (Array.isArray(result.acts) && result.acts.length) kept.acts = structuredClone(result.acts);
  // A port's answer from the recording, nothing done on the site (trace plan P6, D48).
  if (result.checkedAgainst === "recorded_run") kept.checkedAgainst = "recorded_run";
  const standingNo = (result as { standingNo?: unknown }).standingNo;
  // Kept conditions another gate found, where the port carries them (header, t689).
  const carried = carriedKept((result as AutomationStudioResultKeptConditionsCarrier).keptConditions);
  // The reads Core flagged, where the port carries them (header, t692).
  const flagged = flaggedReads((result as { keptEveryRow?: unknown }).keptEveryRow);
  return { answer: kept, ...(standingNo !== undefined ? { standingNo } : {}), ...(carried ? { keptConditions: carried } : {}), ...(flagged.length ? { keptEveryRow: flagged } : {}) };
}

/** The flagged reads a port's result carries (header, t692): copies of the entries of their shape. */
function flaggedReads(value: unknown): AutomationStudioSubflowTrialKeptEveryRowRead[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AutomationStudioSubflowTrialKeptEveryRowRead[] => {
    if (!isJsonObject(entry) || typeof entry.nodeId !== "string" || !Number.isSafeInteger(entry.kept) || (entry.kept as number) < 1) return [];
    const flag = entry.keptEveryRow;
    return isJsonObject(flag) && typeof flag.said === "string" && flag.said ? [structuredClone(entry) as unknown as AutomationStudioSubflowTrialKeptEveryRowRead] : [];
  });
}

/** The kept conditions a port's result carries (header, t689): copies of the entries of their shape; undefined where it carries no list. */
function carriedKept(value: unknown): AutomationStudioResultKeptCondition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry): AutomationStudioResultKeptCondition[] => {
    if (!isJsonObject(entry)) return [];
    const { name, revision, written, keptOut } = entry;
    return typeof name === "string" && Number.isSafeInteger(revision) && typeof written === "string" && Array.isArray(keptOut) && keptOut.length ? [structuredClone(entry) as unknown as AutomationStudioResultKeptCondition] : [];
  });
}

/** The port's own account of a trial it did not run (header, t679), when it gave a well-formed one; undefined otherwise. */
function notRunOf(raw: unknown): AutomationStudioSubflowTrialNotRun["notRun"] | undefined {
  const said = raw && typeof raw === "object" ? (raw as { notRun?: unknown }).notRun : undefined;
  if (!said || typeof said !== "object" || Array.isArray(said)) return undefined;
  const { code, instruction, detail, retry } = said as Record<string, unknown>;
  if (typeof code !== "string" || !code || typeof instruction !== "string" || !instruction) return undefined;
  return { code, instruction, ...(isJsonObject(detail) ? { detail: structuredClone(detail) } : {}), ...(retry === true ? { retry: true } : {}) };
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
