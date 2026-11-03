// Synthetic catalogue data only; no browser, model provider or persisted run.
import {
  processAutomationStudioRecordRows,
  type AutomationStudioRecordProcessingAccount,
  type AutomationStudioRecordProcessing,
  type AutomationStudioRecordSchema
} from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { datasetSummary } from "../../tests/run-outcome-harness.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";

export const CATALOGUE_NOW = Date.UTC(2026, 9, 25);
export const CATALOGUE_REQUEST = "List the library catalogue books with shelf status Available today, with title and shelf.";
export const CATALOGUE_QUOTED_YES = 'Condition 1 implements the request\'s "with shelf status Available today" requirement.';
export const CATALOGUE_PROCESS: AutomationStudioRecordProcessing = { where: [{ field: "shelf", equals: "Available today" }] };
export const CATALOGUE_ROWS: JsonObject[] = [
  { title: "An Atlas of Rivers", shelf: "Available today" },
  { title: "The Clockmaker's Almanac", shelf: "On loan" },
  { title: "Songs of the Tides", shelf: "In transit" }
];
const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1", fields: ["title", "shelf"].map((id) => ({ id, label: id, valueType: "string" }))
};

/** Actual producer output, then the same screened summary used by runtime verification. */
export function processingCatalogue(input: {
  rows?: JsonObject[];
  process?: AutomationStudioRecordProcessing;
  deniedKeys?: readonly string[] | undefined;
  withoutDeclaration?: boolean;
  changeAccount?: (account: AutomationStudioRecordProcessingAccount) => void;
  authored?: AutomationStudioRecordProcessing;
  summaryNow?: number;
  withoutNodes?: boolean;
} = {}): AutomationStudioRunResultSummary {
  const process = input.process ?? CATALOGUE_PROCESS;
  const produced = processAutomationStudioRecordRows({
    rows: (input.rows ?? CATALOGUE_ROWS).map((values) => ({ values, nodeId: "catalogue.read", batchKey: "batch.1" })),
    schema: SCHEMA, process, now: CATALOGUE_NOW
  });
  input.changeAccount?.(produced.account);
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary({ datasetId: "catalogue", nodeIds: ["catalogue.read"], recordCount: produced.rows.length, processing: produced.account }), schema: SCHEMA, rows: produced.rows as JsonObject[] }],
    flowNodes: input.withoutNodes ? [] : [{ id: "catalogue.read", definitionId: "catalogue.collect", parameterValues: { recordOutput: { datasetId: "catalogue", process: input.authored ?? process } } }],
    deniedEvidenceKeys: input.withoutDeclaration ? undefined : input.deniedKeys ?? [],
    now: input.summaryNow ?? CATALOGUE_NOW
  });
}

export function processingVerdict(summary: AutomationStudioRunResultSummary, observed: string, answer: "yes" | "no" | "unknown" = "yes") {
  return automationStudioResultVerdict({ summary, diagnosis: { answersRequest: answer, observed }, basis: "model", wording: automationStudioRequestWording([{ title: "Goal", body: CATALOGUE_REQUEST }], summary) });
}
