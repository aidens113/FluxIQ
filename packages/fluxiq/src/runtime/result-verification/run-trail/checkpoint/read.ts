import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioJudgeEvidenceJsonValue, automationStudioStoredJudgeFinding } from "../../judge-evidence/index.ts";
import type { AutomationStudioJudgeEvidenceCheckpoint } from "./types.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";
import { automationStudioResultEvidenceScreen } from "../../result-evidence/index.ts";
import { readAutomationStudioResultEvidenceSourceRef } from "../../result-evidence/index.ts";
import { automationStudioReadJudgeActionRef } from "../../judge-evidence/index.ts";
import { automationStudioReadJudgeWitnessAssociation } from "../../judge-evidence/index.ts";

const TOP = new Set(["version", "revision", "trail", "witnesses"]);
const STEP = new Set(["callId", "did", "on", "outcome", "where", "framework", "judgeEvidence", "judgeSource", "judgeSources", "judgeAct"]);

/** Validate private stored shape only. Current capability/privacy checks still govern every model-bound read. */
export function automationStudioReadJudgeCheckpoint(value: unknown): AutomationStudioJudgeEvidenceCheckpoint | undefined {
  if (!object(value) || value.version !== 1 || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.trail) || Object.keys(value).some((key) => !TOP.has(key))) return undefined;
  const trail: AutomationStudioJudgeEvidenceCheckpoint["trail"] = [];
  for (const raw of value.trail) {
    if (!object(raw) || typeof raw.did !== "string" || Object.keys(raw).some((key) => !STEP.has(key))) return undefined;
    const step: AutomationStudioJudgeEvidenceCheckpoint["trail"][number] = { did: raw.did };
    for (const key of ["callId", "on", "outcome", "where"] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== "string") return undefined;
      if (typeof raw[key] === "string") step[key] = raw[key];
    }
    if (Object.hasOwn(raw, "judgeSource")) {
      const source = raw.judgeSource;
      if (!object(source) || Object.keys(source).some((key) => key !== "source" && key !== "datasetId") || typeof source.source !== "string" || !source.source.trim() || (Object.hasOwn(source, "datasetId") && typeof source.datasetId !== "string")) return undefined;
      step.judgeSource = { source: source.source, ...(typeof source.datasetId === "string" ? { datasetId: source.datasetId } : {}) };
    }
    if (Object.hasOwn(raw, "judgeSources")) {
      if (!Array.isArray(raw.judgeSources) || raw.judgeSources.length === 0) return undefined;
      const sources = raw.judgeSources.map(readAutomationStudioResultEvidenceSourceRef);
      if (sources.some((source) => source === undefined)) return undefined;
      step.judgeSources = sources as NonNullable<typeof step.judgeSources>;
    }
    if (Object.hasOwn(raw, "judgeAct")) {
      const act = automationStudioReadJudgeActionRef(raw.judgeAct);
      if (act === undefined || (step.callId !== undefined && step.callId !== act.callId)) return undefined;
      step.judgeAct = act;
    }
    if (raw.framework !== undefined) {
      if (!object(raw.framework) || !automationStudioJudgeEvidenceJsonValue(raw.framework)) return undefined;
      const framework = automationStudioResultFrameworkOutcome(raw.framework);
      if (!same(framework, raw.framework)) return undefined;
      step.framework = structuredClone(framework);
    }
    if (!Object.hasOwn(raw, "judgeEvidence")) return undefined;
    const finding = automationStudioStoredJudgeFinding(raw.judgeEvidence);
    if (finding === undefined) return undefined;
    // Structural credential enforcement only, not current domain disclosure
    // policy. Opaque identities/framework facts cannot carry a credential.
    if (automationStudioResultEvidenceScreen(step as unknown as JsonObject, []).withheld) return undefined;
    step.judgeEvidence = finding;
    trail.push(step);
  }
  const result: AutomationStudioJudgeEvidenceCheckpoint = { version: 1, revision: value.revision, trail };
  if (value.witnesses !== undefined) {
    if (!object(value.witnesses) || Object.keys(value.witnesses).some((key) => key !== "before" && key !== "after" && key !== "association")) return undefined;
    const witnesses: NonNullable<AutomationStudioJudgeEvidenceCheckpoint["witnesses"]> = {};
    for (const phase of ["before", "after"] as const) {
      if (value.witnesses[phase] === undefined) continue;
      const finding = automationStudioStoredJudgeFinding(value.witnesses[phase]);
      if (finding === undefined) return undefined;
      witnesses[phase] = finding;
    }
    if (Object.hasOwn(value.witnesses, "association")) {
      const association = automationStudioReadJudgeWitnessAssociation(value.witnesses.association);
      if (association === undefined) return undefined;
      const actual = trail.flatMap((step) => step.judgeAct === undefined ? [] : [step.judgeAct]);
      if ([...association.before, ...association.after].some((ref) => actual.filter((act) => act.callId === ref.callId && act.actId === ref.actId).length !== 1)) return undefined;
      witnesses.association = association;
    }
    result.witnesses = witnesses;
  }
  return result;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, at) => same(value, right[at]));
  if (!object(left) || !object(right) || Object.keys(left).length !== Object.keys(right).length) return false;
  return Object.keys(left).every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}
