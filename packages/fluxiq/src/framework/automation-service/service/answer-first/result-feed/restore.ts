import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordSchema, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsAction, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_COPIED_ROW_NODE_ID, automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstResultIntermediate, automationStudioAnswerFirstResultVersionOf } from "./read-of.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "./feed.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "./read-evidence.ts";

/** Restore exact contributing pages; preview rows, positions and newly inferred schemas cannot stand in for source provenance. */
export function automationStudioAnswerFirstRestoreResult(input: {
  evidence: AutomationStudioResultEvidenceBundle | undefined;
  steps: readonly AutomationStudioFlowDraftStep[];
  batches: readonly { datasetId: string; batchKey: string; nodeId?: string; invalidCount?: number }[];
  source(datasetId: string): { schema?: AutomationStudioRecordSchema; rows: readonly JsonObject[] } | undefined;
}): { ok: true; entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0] } | { ok: false; reason: string; entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0]; evidence?: AutomationStudioResultEvidenceBundle } {
  const evidence = readAutomationStudioAnswerFirstResultEvidence(input.evidence);
  if (!evidence?.pages.length) return { ok: false, entries: [], reason: "Exact contributing page provenance is missing or invalid. Re-read the named source fields; a prior answer preview is not raw evidence." };
  const entries: Parameters<AutomationStudioAnswerFirstResultFeed["restored"]>[0][number][] = [];
  const issues = evidence.missingEvidence?.length ? ["Some contributing batch references have no recorded page provenance."] : [];
  const refs = new Map((evidence.missingEvidence ?? []).map((ref) => [stableJson(ref), ref]));
  const datasetOf = new Map<number, string>();
  const knownCounts = new Map<number, number>();
  const requireDataset = (datasetId: string, reason: string) => {
    refs.set(stableJson({ datasetId }), { datasetId });
    issues.push(reason);
  };
  for (const [pageIndex, page] of evidence.pages.entries()) {
    const candidates = input.steps.filter((step) => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step) && !automationStudioAnswerFirstResultIntermediate(step.input) && [step.id, step.callId, step.standsFor].includes(page.step));
    if (candidates.length !== 1) { issues.push(`Contributing page ${page.source} no longer names exactly one kept read step ${page.step}. Repair that source association.`); continue; }
    const step = candidates[0]!;
    const version = automationStudioAnswerFirstResultVersionOf(step.input, page.listKey);
    if (stableJson(version) !== stableJson({ conditions: page.conditions, fields: page.fields, ...(page.listKey === undefined ? {} : { listKey: page.listKey }) })) { issues.push(`Contributing page ${page.source} has different conditions or fields from kept step ${page.step}. Re-read its current version.`); continue; }
    const matching = input.batches.filter((entry) => entry.batchKey === page.source || entry.batchKey === `read/${encodeURIComponent(page.source)}`);
    const originals = matching.filter((entry) => typeof entry.nodeId === "string" && entry.nodeId.trim().length > 0 && entry.nodeId !== AUTOMATION_STUDIO_ANSWER_FIRST_COPIED_ROW_NODE_ID);
    const ids = [...new Set((page.datasetId === undefined ? matching : originals).map((entry) => entry.datasetId))];
    if (ids.length > 1 || page.datasetId !== undefined && ids.some((id) => id !== page.datasetId)) {
      for (const id of new Set([...ids, ...(page.datasetId === undefined ? [] : [page.datasetId])])) requireDataset(id, `Contributing source ${page.source} has conflicting stored dataset identity.`);
      continue;
    }
    const datasetId = page.datasetId ?? ids[0] ?? automationStudioAnswerFirstStoredDatasetId("read", page.source);
    datasetOf.set(pageIndex, datasetId);
    let invalidCount = page.invalidCount;
    const original = originals.length === 1 && validCount(originals[0]!.invalidCount) ? originals[0] : undefined;
    if (original) {
      if (invalidCount !== undefined && invalidCount !== original.invalidCount) {
        requireDataset(datasetId, `Contributing source ${page.source} validation count contradicts its exact original batch. The reported page metadata cannot be accepted.`);
        continue;
      }
      invalidCount = original.invalidCount;
    }
    if (invalidCount === undefined) requireDataset(datasetId, `Original per-source validation is unavailable for ${page.source}; copied storage chunks and missing producer identity cannot supply it. Replace the whole source collection.`);
    else knownCounts.set(pageIndex, invalidCount);
    const source = input.source(datasetId);
    if (!source?.schema || !parseAutomationStudioRecordSchema(source.schema).ok) { issues.push(`The full retained schema for contributing source ${page.source} (${datasetId}) is unavailable or invalid.`); continue; }
    const checked = validateAutomationStudioRecords(page.rows, source.schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    const actual = new Set(source.rows.map(stableJson));
    if (checked.invalidCount || checked.truncated || stableJson(checked.rows) !== stableJson(page.rows) || page.rows.some((row) => !actual.has(stableJson(row)))) { issues.push(`Contributing page ${page.source} disagrees with its copied full original records or schema. Restore the actual source evidence instead of a projection.`); continue; }
    entries.push({ step, version: page.version, schema: source.schema, datasetId, ...(page.leftOut === undefined ? {} : { leftOut: page.leftOut }), read: { source: page.source, version, kept: page.rows, carried: true, ...(invalidCount === undefined ? {} : { invalidCount }), ...(page.place === undefined ? {} : { place: page.place }), ...(page.where === undefined ? {} : { where: page.where }) } });
  }
  for (const datasetId of new Set(datasetOf.values())) {
    const batches = input.batches.filter((entry) => entry.datasetId === datasetId);
    if (!batches.length) continue; // A validated private checkpoint still carries its own original page facts.
    if (batches.some((entry) => !validCount(entry.invalidCount))) {
      requireDataset(datasetId, `Dataset ${datasetId} has unknown aggregate source-validation provenance. Individual page rereads cannot settle the whole dataset.`);
      continue;
    }
    const aggregate = batches.reduce((total, entry) => total + entry.invalidCount!, 0);
    const represented = new Map<string, number>();
    for (const [index, heldDataset] of datasetOf) if (heldDataset === datasetId && knownCounts.has(index)) represented.set(evidence.pages[index]!.source, knownCounts.get(index)!);
    const accounted = [...represented.values()].reduce((total, value) => total + value, 0);
    if (!Number.isSafeInteger(aggregate) || aggregate !== accounted) requireDataset(datasetId, `Dataset ${datasetId} has rejected originals not reconciled with all represented original sources (${aggregate} aggregate, ${accounted} accounted). A complete fresh collection must replace that dataset.`);
  }
  const unresolved: AutomationStudioResultEvidenceBundle = { ...evidence, pages: evidence.pages.map((page, index) => ({ ...page, ...(datasetOf.has(index) ? { datasetId: datasetOf.get(index)! } : {}), ...(page.invalidCount === undefined && knownCounts.has(index) ? { invalidCount: knownCounts.get(index)! } : {}) })), ...(refs.size ? { missingEvidence: [...refs.values()] } : {}) };
  return issues.length ? { ok: false, entries, reason: issues.join(" "), evidence: unresolved } : { ok: true, entries };
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
