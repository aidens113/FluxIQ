import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioResultTrail, AutomationStudioResultTrailShownStep, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioJudgeEvidenceFinding } from "../../judge-evidence/finding.ts";
import { automationStudioShownJudgeFinding } from "../../judge-evidence/shown.ts";
import { automationStudioProjectJudgeEvidence, type AutomationStudioJudgeEvidenceProjection } from "../../judge-evidence/project.ts";
import { automationStudioResultEvidenceScreen } from "../../result-evidence/index.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";
import type { AutomationStudioResultTrailSemanticOptions } from "./options.ts";
import { AutomationStudioJudgeEvidenceRetry } from "../../judge-evidence/retry.ts";
import { automationStudioJudgeEvidenceReplacement } from "../../judge-evidence/replacement.ts";
import type { AutomationStudioJudgeEvidenceHistory } from "../../judge-evidence/index.ts";

const NOTE = "Core's ordered record of every call, read and act. found contains the domain's semantic finding, with raw captures deliberately omitted. framework contains actual execution status, failure and effect facts; a successful command alone does not prove its lasting effect. Data rows, source pages and processing/comparison/removal accounts are supplied separately in full. missing names unavailable semantic evidence; intentional omission of a capture is not a gap. Judge from these findings and the final data together, and name a concrete contradiction or the requested part for which evidence is missing.";

/** Final request copy: reopen/rescreen durable findings; never send private raw findings or re-project a durable value. */
export function automationStudioResultSemanticTrail(trail: AutomationStudioResultTrail | undefined, options: AutomationStudioResultTrailSemanticOptions): { trail?: AutomationStudioResultTrail; projection: NonNullable<AutomationStudioRunResultSummary["evidenceProjection"]>; withheld: boolean } {
  const deniedKeys = options.deniedEvidenceKeys;
  if (deniedKeys === undefined) {
    // An unknown current policy must not become "deny nothing" when resuming.
    // Private framework facts/findings remain untouched; no opaque identity,
    // row label or old semantic cell is disclosed under an unknown policy.
    const entries = (trail?.entries ?? []).map((step) => ({ n: step.n, did: "(withheld)" }));
    return { ...(entries.length ? { trail: { note: NOTE, entries } } : {}), projection: { version: 1, missing: [{ source: "trail", codes: ["judge_evidence.denied_keys_missing"] }] }, withheld: true };
  }
  const missing: Array<{ source: string; codes: string[] }> = [];
  let withheld = false;
  const entries = (trail?.entries ?? []).map((step): AutomationStudioResultTrailShownStep => {
    const identity = automationStudioResultEvidenceScreen({ n: step.n, did: step.did, ...(step.callId === undefined ? {} : { callId: step.callId }), ...(step.on === undefined ? {} : { on: step.on }), ...(step.outcome === undefined ? {} : { outcome: step.outcome }), ...(step.where === undefined ? {} : { where: step.where }) }, deniedKeys);
    withheld ||= identity.withheld;
    let finding: (AutomationStudioJudgeEvidenceProjection & { history?: AutomationStudioJudgeEvidenceHistory }) | undefined;
    if (options.invalidFormat) finding = { missing: ["judge_evidence.version_invalid"], withheld: true };
    else if (Object.hasOwn(step, "judgeEvidence")) {
      const reopened = automationStudioJudgeEvidenceFinding(step.judgeEvidence, deniedKeys);
      finding = reopened.ok ? automationStudioJudgeEvidenceReplacement(step, AutomationStudioJudgeEvidenceRetry.finding(step, reopened.finding, options), options.resultEvidence, trail?.entries ?? []) : { missing: [reopened.code], withheld: true };
    } else if (options.alreadyProjected) {
      const reopened = automationStudioShownJudgeFinding(step.found, deniedKeys);
      finding = reopened.ok ? automationStudioJudgeEvidenceReplacement(step, reopened.finding, options.resultEvidence, trail?.entries ?? []) : { missing: [reopened.code], withheld: true };
    } else if (step.found !== undefined) {
      const source = options.legacySource ?? "legacy";
      const raw = step.found !== null && typeof step.found === "object" && !Array.isArray(step.found) ? step.found : undefined;
      // These holders are Core's documented legacy Flow adapter, not domain
      // output keys. They say which actual output/view the old trail carries.
      const evidence = source === "flow-attempt" ? { evidence: raw?.outputs ?? step.found, source: { entry: step.n }, ...(raw?.view === undefined ? {} : { after: raw.view }), ...(raw?.changed === undefined ? {} : { changed: raw.changed }) } : { evidence: step.found, source: step.callId === undefined ? { entry: step.n } : { callId: step.callId } };
      finding = automationStudioProjectJudgeEvidence({ source, definitionId: step.did, evidence, ...(step.asked === undefined ? {} : { asked: step.asked }), ...(step.on === undefined ? {} : { on: step.on }) }, options.projectJudgeEvidence, options.deniedEvidenceKeys);
    }
    if (finding?.missing.length) missing.push({ source: step.callId ?? `n:${step.n}`, codes: [...finding.missing] });
    withheld ||= finding?.withheld === true;
    const facts = step.framework === undefined ? undefined : automationStudioResultEvidenceScreen(automationStudioResultFrameworkOutcome(step.framework), deniedKeys);
    withheld ||= facts?.withheld === true;
    const found: JsonObject = {};
    if (finding?.role !== undefined) found.role = finding.role;
    if (finding?.evidence !== undefined) found.evidence = finding.evidence;
    if (finding?.missing.length) found.missing = [...finding.missing];
    if (finding?.history !== undefined) found.history = finding.history.map((entry) => ({ codes: [...entry.codes], by: entry.by }));
    return { ...(identity.value as JsonObject), n: step.n, did: typeof (identity.value as JsonObject)?.did === "string" ? (identity.value as JsonObject).did as string : "(withheld)", ...(Object.keys(found).length ? { found } : {}), ...(facts === undefined || Object.keys(facts.value).length === 0 ? {} : { framework: facts.value }), ...(step.judgeSources === undefined ? {} : { judgeSources: structuredClone(step.judgeSources) }), ...(step.judgeAct === undefined ? {} : { judgeAct: { ...step.judgeAct } }) } as AutomationStudioResultTrailShownStep;
  });
  return { ...(entries.length ? { trail: { note: NOTE, entries } } : {}), projection: { version: 1, missing }, withheld };
}
