// A presence exclusion whose read no column makes (t758): a catalogue of
// trails where a badge, read by its css and stored in no column, marks the
// promoted ones. The condition is `badge text is absent`; Core words it by what
// the read found ("the item's text "Promoted" is absent (a row is kept only
// when it has no "Promoted")", `../../read-account/condition.ts`), a wording
// that does not end in `is absent)`. Each left-out row is witnessed `present`.
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";

export const BADGE_CATALOGUE_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Collect the trails",
  body: "List every trail on the first page of the trail directory, leaving out promoted items.",
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const trail = (rest: string) => `Ridgeway Summit Loop Scenic Trail Guided Route Overview, ${rest}`;
export const BADGE_CATALOGUE_KEPT = [trail("North"), trail("South")];
export const BADGE_CATALOGUE_PROMOTED = [trail("East"), trail("West")];

const READ = "node.part.trails.read";
const readNode: AutomationStudioFlowNode = {
  id: READ,
  definitionId: "unit.list",
  parameterValues: { list: { fields: { name: { kind: "text" }, url: { kind: "link" } }, where: [{ read: { kind: "text", css: ".badge" }, is: "absent" }] } }
};

const attempt: AutomationStudioFlowRunActionAttemptRecord = {
  attemptId: "a.read", nodeId: READ, definitionId: "unit.list", order: 1, status: "succeeded", startedAt: 1,
  metadata: { extraction: {
    recordCount: BADGE_CATALOGUE_KEPT.length, pagesRead: 1, truncated: false, itemsSeen: 4,
    conditions: {
      applied: 4, kept: BADGE_CATALOGUE_KEPT.length, unfiltered: false,
      rejected: [BADGE_CATALOGUE_PROMOTED.length], alone: [BADGE_CATALOGUE_PROMOTED.length], seen: ["Promoted"],
      aloneRows: [BADGE_CATALOGUE_PROMOTED.map((name) => ({ name }))],
      aloneObservations: [BADGE_CATALOGUE_PROMOTED.map((_, at) => ({ conditionIndex: 0, source: "read", page: 1, item: at + 3, state: "present", value: "Promoted" }))]
    }
  } }
};

const datasetSummary: AutomationStudioRunDatasetSummary = { runId: "trial.1", datasetId: "trails", nodeIds: [READ], schemaDigest: "digest", recordCount: 2, truncated: false, invalidCount: 0, updatedAt: 1 };
const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["name", "url"].map((id) => ({ id, label: id, valueType: "string" })) };
const stored: JsonObject[] = BADGE_CATALOGUE_KEPT.map((name, index) => ({ name, url: `/trail/${index}` }));

/** The run's summary as Core makes it. */
export function badgeCatalogueSummary(): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({ recordSets: [{ summary: datasetSummary, schema, rows: stored }], flowNodes: [readNode], actionAttempts: [attempt], deniedEvidenceKeys: [], now: 0 });
}
