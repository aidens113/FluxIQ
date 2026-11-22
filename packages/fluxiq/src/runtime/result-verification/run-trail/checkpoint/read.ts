import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioStoredJudgeFinding } from "../../judge-evidence/stored-finding.ts";
import type { AutomationStudioJudgeEvidenceCheckpoint } from "./types.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";

const TOP = new Set(["version", "trail", "witnesses"]);
const STEP = new Set(["callId", "did", "on", "outcome", "where", "framework", "judgeEvidence"]);

/** Validate private stored shape only. Current capability/privacy checks still govern every model-bound read. */
export function automationStudioReadJudgeCheckpoint(value: unknown): AutomationStudioJudgeEvidenceCheckpoint | undefined {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.trail) || Object.keys(value).some((key) => !TOP.has(key))) return undefined;
  const trail: AutomationStudioJudgeEvidenceCheckpoint["trail"] = [];
  for (const raw of value.trail) {
    if (!object(raw) || typeof raw.did !== "string" || Object.keys(raw).some((key) => !STEP.has(key))) return undefined;
    const step: AutomationStudioJudgeEvidenceCheckpoint["trail"][number] = { did: raw.did };
    for (const key of ["callId", "on", "outcome", "where"] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== "string") return undefined;
      if (typeof raw[key] === "string") step[key] = raw[key];
    }
    if (raw.framework !== undefined) {
      if (!object(raw.framework)) return undefined;
      const framework = automationStudioResultFrameworkOutcome(raw.framework);
      try {
        JSON.stringify(raw.framework);
        if (!same(framework, raw.framework)) return undefined;
        step.framework = structuredClone(framework) as JsonObject;
      } catch { return undefined; }
    }
    if (!Object.hasOwn(raw, "judgeEvidence")) return undefined;
    const finding = automationStudioStoredJudgeFinding(raw.judgeEvidence);
    if (finding === undefined) return undefined;
    step.judgeEvidence = finding;
    trail.push(step);
  }
  const result: AutomationStudioJudgeEvidenceCheckpoint = { version: 1, trail };
  if (value.witnesses !== undefined) {
    if (!object(value.witnesses) || Object.keys(value.witnesses).some((key) => key !== "before" && key !== "after")) return undefined;
    const witnesses: NonNullable<AutomationStudioJudgeEvidenceCheckpoint["witnesses"]> = {};
    for (const phase of ["before", "after"] as const) {
      if (value.witnesses[phase] === undefined) continue;
      const finding = automationStudioStoredJudgeFinding(value.witnesses[phase]);
      if (finding === undefined) return undefined;
      witnesses[phase] = finding;
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
