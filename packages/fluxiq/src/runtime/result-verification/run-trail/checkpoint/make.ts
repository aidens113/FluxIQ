import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioJudgeEvidenceFinding, type AutomationStudioJudgeEvidenceFinding } from "../../judge-evidence/finding.ts";
import { automationStudioStoredJudgeFinding } from "../../judge-evidence/stored-finding.ts";
import { automationStudioProjectJudgeEvidence } from "../../judge-evidence/project.ts";
import type { AutomationStudioResultTrailSemanticOptions } from "../semantic/options.ts";
import type { AutomationStudioJudgeEvidenceCheckpoint } from "./types.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";
import { automationStudioResultEvidenceScreen } from "../../result-evidence/index.ts";
import { AutomationStudioJudgeEvidenceRetry } from "../../judge-evidence/retry.ts";
import { automationStudioJudgeEvidenceReplacement } from "../../judge-evidence/replacement.ts";
import { automationStudioReadJudgeWitnessAssociation, type AutomationStudioJudgeWitnessAssociation } from "../../judge-evidence/witness-association.ts";

/** Private checkpoint from actual ordered findings; safe existing cells are rescreened when a current policy is known. */
export function automationStudioMakeJudgeCheckpoint(steps: readonly AutomationStudioResultTrailStep[], witnesses: { before?: JsonObject; after?: JsonObject; association?: AutomationStudioJudgeWitnessAssociation }, options: AutomationStudioResultTrailSemanticOptions, prior?: AutomationStudioJudgeEvidenceCheckpoint): AutomationStudioJudgeEvidenceCheckpoint {
  const read = (value: unknown): AutomationStudioJudgeEvidenceFinding => {
    if (options.deniedEvidenceKeys === undefined) return automationStudioStoredJudgeFinding(value) ?? gap("judge_evidence.finding_invalid");
    const result = automationStudioJudgeEvidenceFinding(value, options.deniedEvidenceKeys);
    return result.ok ? result.finding : gap(result.code);
  };
  const trail = steps.map((step): AutomationStudioJudgeEvidenceCheckpoint["trail"][number] => {
    const original = Object.hasOwn(options, "judgeEvidenceVersion") && options.judgeEvidenceVersion !== 1 ? gap("judge_evidence.version_invalid") : Object.hasOwn(step, "judgeEvidence") ? read(step.judgeEvidence) : { version: 1 as const, ...automationStudioProjectJudgeEvidence({ source: "legacy", definitionId: step.did, evidence: { evidence: step.found ?? null, ...(step.callId === undefined ? {} : { source: { callId: step.callId } }) } }, options.projectJudgeEvidence, options.deniedEvidenceKeys) };
    const finding = automationStudioJudgeEvidenceReplacement(step, AutomationStudioJudgeEvidenceRetry.finding(step, original, options), options.resultEvidence, steps);
    const identity = { did: step.did, ...(step.callId === undefined ? {} : { callId: step.callId }), ...(step.on === undefined ? {} : { on: step.on }), ...(step.outcome === undefined ? {} : { outcome: step.outcome }), ...(step.where === undefined ? {} : { where: step.where }), ...(step.framework === undefined ? {} : { framework: automationStudioResultFrameworkOutcome(step.framework) }), ...(step.judgeSource === undefined ? {} : { judgeSource: step.judgeSource }), ...(step.judgeSources === undefined ? {} : { judgeSources: step.judgeSources }), ...(step.judgeAct === undefined ? {} : { judgeAct: step.judgeAct }) };
    // Unknown policy is not an empty declaration. Persist no new opaque
    // identities under it; existing semantic findings stay private until read.
    const screened = options.deniedEvidenceKeys === undefined ? { did: "(withheld)", ...(identity.framework === undefined ? {} : { framework: identity.framework }) } : automationStudioResultEvidenceScreen(identity, options.deniedEvidenceKeys).value;
    return { ...screened, did: typeof screened.did === "string" ? screened.did : "(withheld)", judgeEvidence: finding };
  });
  const kept: NonNullable<AutomationStudioJudgeEvidenceCheckpoint["witnesses"]> = {};
  for (const phase of ["before", "after"] as const) {
    // The logical before is immutable across segments. An after is historical
    // checkpoint evidence; only a fresh read supplies the resumed current end.
    const earlier = phase === "before" ? prior?.witnesses?.before : undefined;
    const raw = witnesses[phase];
    if (earlier !== undefined) kept[phase] = raw === undefined ? read(earlier) : AutomationStudioJudgeEvidenceRetry.finding(raw, read(earlier), options);
    else if (raw !== undefined) {
      const input = { source: "state" as const, phase, evidence: { evidence: raw } };
      const finding = Object.hasOwn(raw, "judgeEvidence") ? read(raw.judgeEvidence) : { version: 1 as const, ...automationStudioProjectJudgeEvidence(input, options.projectJudgeEvidence, options.deniedEvidenceKeys) };
      if (!Object.hasOwn(raw, "judgeEvidence") && finding.missing.length > 0) AutomationStudioJudgeEvidenceRetry.remember(raw, input);
      kept[phase] = finding;
    }
  }
  const association = automationStudioReadJudgeWitnessAssociation(witnesses.association);
  if (association !== undefined) kept.association = association;
  else if (prior?.witnesses?.association !== undefined) kept.association = { version: 1, before: structuredClone(prior.witnesses.association.before), after: [] };
  return { version: 1, revision: (prior?.revision ?? 0) + 1, trail, ...(Object.keys(kept).length ? { witnesses: kept } : {}) };
}

function gap(code: string): AutomationStudioJudgeEvidenceFinding {
  return { version: 1, missing: [code], withheld: true };
}
