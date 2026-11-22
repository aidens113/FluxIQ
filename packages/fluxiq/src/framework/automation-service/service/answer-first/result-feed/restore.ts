import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordSchema, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsAction, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstResultIntermediate, automationStudioAnswerFirstResultVersionOf } from "./read-of.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "./feed.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "./read-evidence.ts";

/** Restore exact contributing pages; preview rows, positions and newly inferred schemas cannot stand in for source provenance. */
export function automationStudioAnswerFirstRestoreResult(input: {
  evidence: AutomationStudioResultEvidenceBundle | undefined;
  steps: readonly AutomationStudioFlowDraftStep[];
  batches: readonly { datasetId: string; batchKey: string }[];
  source(datasetId: string): { schema?: AutomationStudioRecordSchema; rows: readonly JsonObject[] } | undefined;
}): { ok: true; entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0] } | { ok: false; reason: string; entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0] } {
  const evidence = readAutomationStudioAnswerFirstResultEvidence(input.evidence);
  if (!evidence?.pages.length) return { ok: false, entries: [], reason: "Exact contributing page provenance is missing or invalid. Re-read the named source fields; a prior answer preview is not raw evidence." };
  const entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0][number][] = [];
  const issues = evidence.missingEvidence?.length ? ["Some contributing batch references have no recorded page provenance."] : [];
  for (const page of evidence.pages) {
    const candidates = input.steps.filter((step) => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step) && !automationStudioAnswerFirstResultIntermediate(step.input) && [step.id, step.callId, step.standsFor].includes(page.step));
    if (candidates.length !== 1) { issues.push(`Contributing page ${page.source} no longer names exactly one kept read step ${page.step}. Repair that source association.`); continue; }
    const step = candidates[0]!;
    const version = automationStudioAnswerFirstResultVersionOf(step.input, page.listKey);
    if (stableJson(version) !== stableJson({ conditions: page.conditions, fields: page.fields, ...(page.listKey === undefined ? {} : { listKey: page.listKey }) })) { issues.push(`Contributing page ${page.source} has different conditions or fields from kept step ${page.step}. Re-read its current version.`); continue; }
    const matching = input.batches.filter((entry) => entry.batchKey === page.source || entry.batchKey === `read/${encodeURIComponent(page.source)}`);
    const ids = [...new Set(matching.map((entry) => entry.datasetId))];
    if (ids.length > 1) { issues.push(`Contributing source ${page.source} has ambiguous stored dataset identity.`); continue; }
    const datasetId = ids[0] ?? automationStudioAnswerFirstStoredDatasetId("read", page.source);
    const source = input.source(datasetId);
    if (!source?.schema || !parseAutomationStudioRecordSchema(source.schema).ok) { issues.push(`The full retained schema for contributing source ${page.source} (${datasetId}) is unavailable or invalid.`); continue; }
    const checked = validateAutomationStudioRecords(page.rows, source.schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    const actual = new Set(source.rows.map(stableJson));
    if (checked.invalidCount || checked.truncated || stableJson(checked.rows) !== stableJson(page.rows) || page.rows.some((row) => !actual.has(stableJson(row)))) { issues.push(`Contributing page ${page.source} disagrees with its copied full original records or schema. Restore the actual source evidence instead of a projection.`); continue; }
    entries.push({ step, version: page.version, schema: source.schema, datasetId, ...(page.leftOut === undefined ? {} : { leftOut: page.leftOut }), read: { source: page.source, version, kept: page.rows, carried: true, ...(page.place === undefined ? {} : { place: page.place }), ...(page.where === undefined ? {} : { where: page.where }) } });
  }
  return issues.length ? { ok: false, entries, reason: issues.join(" ") } : { ok: true, entries };
}
