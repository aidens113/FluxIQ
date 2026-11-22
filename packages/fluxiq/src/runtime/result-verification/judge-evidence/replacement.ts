import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../contracts/index.ts";
import { readAutomationStudioResultEvidenceSourceRef, readAutomationStudioResultEvidenceSourceReplacements, type AutomationStudioResultEvidenceSourceRef } from "../result-evidence/index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "./finding.ts";

/** A source receipt resolves only data projection for its exact origin, never an act or missing current state. */
export function automationStudioJudgeEvidenceReplacement(step: AutomationStudioResultTrailStep, finding: AutomationStudioJudgeEvidenceFinding, evidence: JsonObject | undefined): AutomationStudioJudgeEvidenceFinding {
  if (finding.missing.length === 0 || (finding.role !== undefined && finding.role !== "data") || step.judgeAct !== undefined || consequential(step.framework)) return finding;
  if (finding.missing.some((code) => code === "judge_evidence.denied_keys_missing" || code === "judge_evidence.version_invalid")) return finding;
  const origins = step.judgeSources?.map(readAutomationStudioResultEvidenceSourceRef);
  if (!origins?.length || origins.some((ref) => ref === undefined)) return finding;
  const metadata = readAutomationStudioResultEvidenceSourceReplacements(evidence?.sourceReplacements);
  if (metadata === undefined || !Array.isArray(evidence?.pages)) return finding;
  const current = evidence.pages.flatMap((page) => {
    if (!object(page) || page.invalidCount !== 0) return [];
    const ref = readAutomationStudioResultEvidenceSourceRef({ source: page.source, step: page.step, version: page.version, ...(page.datasetId === undefined ? {} : { datasetId: page.datasetId }) });
    return ref === undefined ? [] : [ref];
  });
  let replaced = false;
  const resolve = (origin: AutomationStudioResultEvidenceSourceRef, active: Set<string>): boolean => {
    const identity = key(origin);
    if (active.has(identity)) return false;
    const receipts = metadata.receipts.filter((receipt) => receipt.from.some((ref) => key(ref) === identity));
    if (receipts.length === 0) return current.some((ref) => key(ref) === identity);
    // Multiple different replacement authorities for one occurrence are ambiguous.
    if (receipts.some((receipt) => JSON.stringify(receipt.to.map(key)) !== JSON.stringify(receipts[0]!.to.map(key)))) return false;
    const next = new Set(active).add(identity);
    if (!receipts[0]!.to.every((ref) => resolve(ref, next))) return false;
    replaced = true;
    return true;
  };
  if (!(origins as AutomationStudioResultEvidenceSourceRef[]).every((origin) => resolve(origin, new Set())) || !replaced) return finding;
  return { ...finding, missing: [], history: [...(finding.history ?? []), { codes: [...finding.missing], by: "source-replacement" }] };
}

function consequential(facts: JsonObject | undefined): boolean {
  return facts?.effectApplied === true || object(facts?.failure)?.effect === "ambiguous" || (Array.isArray(facts?.consequences) && facts.consequences.length > 0);
}

function key(ref: AutomationStudioResultEvidenceSourceRef): string {
  return JSON.stringify([ref.source, ref.step, ref.version, ref.datasetId ?? null]);
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}
