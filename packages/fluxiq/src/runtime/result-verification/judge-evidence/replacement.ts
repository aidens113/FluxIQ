import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../contracts/index.ts";
import { readAutomationStudioResultEvidenceSourceRef, readAutomationStudioResultEvidenceSourceReplacements, type AutomationStudioResultEvidenceSourceRef } from "../result-evidence/index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "./finding.ts";

/** A source receipt resolves only data projection for its exact origin, never an act or missing current state. */
export function automationStudioJudgeEvidenceReplacement(step: AutomationStudioResultTrailStep, finding: AutomationStudioJudgeEvidenceFinding, evidence: Readonly<Record<string, unknown>> | undefined, trail: readonly AutomationStudioResultTrailStep[]): AutomationStudioJudgeEvidenceFinding {
  const latest = new Map<string, "original-source" | "source-replacement">();
  for (const event of finding.history ?? []) for (const code of event.codes) latest.set(code, event.by);
  const recheck = [...latest].flatMap(([code, by]) => by === "source-replacement" ? [code] : []);
  const dataCodes = finding.role === undefined || finding.role === "data" ? finding.missing.filter((code) => code !== "judge_evidence.denied_keys_missing" && code !== "judge_evidence.version_invalid") : [];
  if (dataCodes.length === 0 && recheck.length === 0) return finding;
  const unresolved = (): AutomationStudioJudgeEvidenceFinding => recheck.length === 0 ? finding : { ...finding, missing: [...new Set([...finding.missing, ...recheck])] };
  if (step.judgeAct !== undefined || consequential(step.framework)) return unresolved();
  if (!Array.isArray(step.judgeSources)) return unresolved();
  const origins = step.judgeSources.map(readAutomationStudioResultEvidenceSourceRef);
  if (!origins?.length || origins.some((ref) => ref === undefined)) return unresolved();
  const occurrences = new Map<string, number>();
  for (const entry of trail) {
    if (entry.judgeSources === undefined) continue;
    if (!Array.isArray(entry.judgeSources)) return unresolved();
    const refs = entry.judgeSources.map(readAutomationStudioResultEvidenceSourceRef);
    if (refs.some((ref) => ref === undefined)) return unresolved();
    const identities = new Set((refs as AutomationStudioResultEvidenceSourceRef[]).map(key));
    for (const identity of identities) occurrences.set(identity, (occurrences.get(identity) ?? 0) + 1);
  }
  if ((origins as AutomationStudioResultEvidenceSourceRef[]).some((origin) => occurrences.get(key(origin)) !== 1)) return unresolved();
  const metadata = readAutomationStudioResultEvidenceSourceReplacements(evidence?.sourceReplacements);
  if (metadata === undefined || !Array.isArray(evidence?.pages)) return unresolved();
  const current: Array<{ ref: AutomationStudioResultEvidenceSourceRef; valid: boolean }> = [];
  for (const page of evidence.pages) {
    if (!object(page)) return unresolved();
    const ref = readAutomationStudioResultEvidenceSourceRef({ source: page.source, step: page.step, version: page.version, ...(page.datasetId === undefined ? {} : { datasetId: page.datasetId }) });
    if (ref === undefined) return unresolved();
    current.push({ ref, valid: page.invalidCount === 0 });
  }
  const reused = (ref: AutomationStudioResultEvidenceSourceRef) => (occurrences.get(key(ref)) ?? 0) > 1;
  let replaced = false;
  const resolve = (origin: AutomationStudioResultEvidenceSourceRef, active: Set<string>): boolean => {
    const identity = key(origin);
    if (active.has(identity) || reused(origin)) return false;
    const receipts = metadata.receipts.filter((receipt) => receipt.from.some((ref) => key(ref) === identity));
    if (receipts.length === 0) {
      const terminal = current.filter((page) => key(page.ref) === identity);
      return terminal.length === 1 && terminal[0]!.valid;
    }
    // Multiple different replacement authorities for one occurrence are ambiguous.
    if (receipts.some((receipt) => JSON.stringify(receipt.to.map(key)) !== JSON.stringify(receipts[0]!.to.map(key)))) return false;
    const next = new Set(active).add(identity);
    if (!receipts[0]!.to.every((ref) => resolve(ref, next))) return false;
    replaced = true;
    return true;
  };
  if (!(origins as AutomationStudioResultEvidenceSourceRef[]).every((origin) => resolve(origin, new Set())) || !replaced) return unresolved();
  const clearable = new Set([...dataCodes, ...recheck]);
  const cleared = finding.missing.filter((code) => clearable.has(code));
  if (cleared.length === 0) return finding;
  const historyCodes = cleared.filter((code) => latest.get(code) !== "source-replacement");
  return { ...finding, role: finding.role ?? "observation", evidence: finding.evidence ?? { sourceEvidence: "replaced", note: "Core validated replacement of this exact source evidence. The original projection role and response remain unknown; current rows and accounts are supplied separately. This is no action or task-success claim." }, missing: finding.missing.filter((code) => !clearable.has(code)), ...(historyCodes.length === 0 ? {} : { history: [...(finding.history ?? []), { codes: historyCodes, by: "source-replacement" }] }) };
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
