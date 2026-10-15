// The shape of A8 everything-store `run-mv8id5vg-ed7b89fe`'s exact answers
// (t599), on a generic catalogue of another kind of site: a read whose rows a
// presence test (`member is present`, each left-out row witnessed `absent`)
// and an absence test (`promoted is absent`, each witnessed `present`) alone
// left out, and one row a text condition alone left out, every label sharing
// its first nine words with the others, as the live run's did. The summary is
// Core's own (`../../result-summary.ts`), from the read's account and its
// witnesses. The text condition's witness could not read the name, so Core
// settles nothing there and the row is still named one by one: since t624 a
// text test's row is settled where its witness found a value that fails it.
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";

export const PRESENCE_CATALOGUE_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Collect the catalogue",
  body: "Search the catalogue for garden hoses and list every hose with a member price, leaving out promoted items and spare parts.",
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const hose = (rest: string) => `Hollis Garden Hose Expandable Lightweight Kink Free with Spray Nozzle and Brass Fittings, ${rest}`;
export const PRESENCE_CATALOGUE_KEPT = [hose("Orange"), hose("Teal"), hose("White")];
/** Left out by `member is present` alone, each witnessed `absent`. */
export const PRESENCE_CATALOGUE_NO_MEMBER = [hose("Green"), hose("Blue"), hose("Grey"), hose("Red")];
/** Left out by `promoted is absent` alone, each witnessed `present`. */
export const PRESENCE_CATALOGUE_PROMOTED = [hose("Black"), hose("Silver")];
/** Left out by the name exclusion alone: a text condition, so still named row by row. */
export const PRESENCE_CATALOGUE_SPARE = "Hollis Garden Hose Expandable Lightweight Kink Free Spare Spray Nozzle Pack, Black";

const READ = "node.part.hoses.read";
const readNode: AutomationStudioFlowNode = {
  id: READ,
  definitionId: "unit.list",
  parameterValues: {
    list: {
      fields: { name: { kind: "text" }, member: { kind: "text" }, url: { kind: "link" } },
      where: [{ field: "member", is: "present" }, { field: "promoted", is: "absent" }, { field: "name", matches: "spare|refill", not: true }]
    }
  }
};

/** What the domain's witness read of the member value on each row `member is present` left out. */
export type PresenceCatalogueWitness = { state: "absent" } | { state: "unavailable" };

function readAttempt(memberWitness: PresenceCatalogueWitness): AutomationStudioFlowRunActionAttemptRecord {
  const witness = (conditionIndex: number, item: number, seen: JsonObject) => ({ conditionIndex, source: "field", page: 1, item, ...seen });
  const noMember = PRESENCE_CATALOGUE_NO_MEMBER, promoted = PRESENCE_CATALOGUE_PROMOTED;
  return {
    attemptId: "a.read", nodeId: READ, definitionId: "unit.list", order: 1, status: "succeeded", startedAt: 1,
    metadata: { extraction: {
      recordCount: PRESENCE_CATALOGUE_KEPT.length, pagesRead: 1, truncated: false, itemsSeen: 10,
      conditions: {
        applied: 10, kept: PRESENCE_CATALOGUE_KEPT.length, unfiltered: false,
        rejected: [noMember.length, promoted.length, 1], alone: [noMember.length, promoted.length, 1], seen: ["Member price", null, null],
        aloneRows: [noMember.map((name) => ({ name })), promoted.map((name) => ({ name })), [{ name: PRESENCE_CATALOGUE_SPARE }]],
        aloneObservations: [
          noMember.map((_, at) => witness(0, at + 4, memberWitness)),
          promoted.map((_, at) => witness(1, at + 8, { state: "present", value: "Promoted" })),
          [witness(2, 10, { state: "unavailable" })]
        ]
      }
    } }
  };
}

const datasetSummary: AutomationStudioRunDatasetSummary = { runId: "trial.1", datasetId: "hoses", nodeIds: [READ], schemaDigest: "digest", recordCount: 3, truncated: false, invalidCount: 0, updatedAt: 1 };
const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["name", "member", "url"].map((id) => ({ id, label: id, valueType: "string" })) };
const stored: JsonObject[] = PRESENCE_CATALOGUE_KEPT.map((name, index) => ({ name, member: "Member price", url: `/item/${index}` }));

/** The run's summary as Core makes it; the member witnesses `absent` unless said otherwise. */
export function presenceCatalogueSummary(memberWitness: PresenceCatalogueWitness = { state: "absent" }): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary, schema, rows: stored }],
    flowNodes: [readNode],
    actionAttempts: [readAttempt(memberWitness)],
    deniedEvidenceKeys: [],
    now: 0
  });
}
