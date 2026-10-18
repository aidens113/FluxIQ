// A finished read in the shape of live-lane-1 fix 4's run
// `run-mvd8ypsv-32cde667` (steps 0056 and 0057), on another kind of site: a
// plant nursery's catalogue read over two pages that stored exactly the rows
// asked for. A presence test (`promoted is absent`) alone left out five rows,
// each settled on the value Core read on it ("Promoted") against the request's
// own words "leave out promoted listings": four are second copies of stored
// items, and one is a promoted-only placement. Both nos named that one as
// wrongly dropped, beside a sentence granting that the other four came back.
// No task, site, product or answer of any realistic scenario.
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmDiagnosisFields } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording } from "../request-wording.ts";

/** The request. */
export const PLANTS_REQUEST = "List every houseplant the nursery's catalogue shows in stock, across every page; leave out promoted listings and list each plant once, with columns name and price.";
export const PLANTS_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: PLANTS_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
/** The request's text as the verification joins it. */
export const PLANTS_REQUEST_TEXT = `Goal\n${PLANTS_REQUEST}`;

export const PLANTS_READ = "node.catalogue.read";

/** The stored rows: exactly those the request asks for. */
export const PLANTS_STORED: JsonObject[] = [
  { name: "Kentia Palm Classic, 14 in Pot", price: "$48.00" },
  { name: "Boston Fern Compacta, 6 in Hanging Basket", price: "$18.50" },
  { name: "Peace Lily Domino, 8 in Pot", price: "$22.00" },
  { name: "Snake Plant Laurentii, 10 in Pot", price: "$29.00" },
  { name: "Rubber Plant Burgundy, 8 in Pot", price: "$26.00" },
  { name: "Pothos Marble Queen, 6 in Pot", price: "$14.00" },
  { name: "ZZ Plant Raven, 10 in Pot", price: "$34.00" },
  { name: "Parlor Palm Bella, 6 in Pot", price: "$12.00" }
];
/** Second copies, marked promoted, of four stored items. */
export const PLANTS_PROMOTED_COPIES = ["Kentia Palm Classic, 14 in Pot", "Peace Lily Domino, 8 in Pot", "Snake Plant Laurentii, 10 in Pot", "Parlor Palm Bella, 6 in Pot"];
/** The promoted-only placement: no copy of it was kept. */
export const PLANTS_PROMOTED_ONLY = "Calathea Orbifolia Prime, 8 in Pot";
/** Every row condition 1 alone left out, in the read's order. */
export const PLANTS_LEFT_OUT = [PLANTS_PROMOTED_COPIES[0]!, PLANTS_PROMOTED_COPIES[1]!, PLANTS_PROMOTED_ONLY, PLANTS_PROMOTED_COPIES[2]!, PLANTS_PROMOTED_COPIES[3]!];

/** The run's summary, as the judges were sent it before Core's judge-copy marks; `settled`, the left-out rows Core settled (every one by default). */
export function plantsRunSummary(settled: readonly string[] = PLANTS_LEFT_OUT): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: PLANTS_STORED.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "plants", recordCount: PLANTS_STORED.length, refusedCount: 0, truncated: false, columns: ["name", "price"], columnsWithheld: false,
      rowsChecked: PLANTS_STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: PLANTS_STORED.map((row) => ({ ...row })),
      processing: { collected: PLANTS_STORED.length, duplicates: 0, filteredOut: 0, cut: 0, kept: PLANTS_STORED.length, passes: [{ node: PLANTS_READ, pass: 1, rows: 5, newRows: 5 }, { node: PLANTS_READ, pass: 2, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: PLANTS_READ, definitionId: "web.output.dom-extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 13, kept: PLANTS_STORED.length, paginates: true, dedupes: false,
      conditions: [{
        number: 1, condition: "promoted is absent", rejected: 5, alone: 5,
        leftOutOnlyByThis: [...PLANTS_LEFT_OUT],
        leftOutObservations: PLANTS_LEFT_OUT.map((_label, at) => ({ source: "read" as const, page: at < 2 ? 1 : 2, item: at + 1, readKind: "text" as const, state: "present" as const, value: "Promoted" })),
        leftOutSettled: PLANTS_LEFT_OUT.filter((label) => settled.includes(label))
      }]
    }],
    flowShape: [{ nodeId: "node.catalogue.search", definitionId: "web.dom.type_text" }, { nodeId: PLANTS_READ, definitionId: "web.output.dom-extract_list" }],
    withheld: false
  };
}

/** The request as the judges read it. */
export const plantsWording = (summary: AutomationStudioRunResultSummary = plantsRunSummary()) => automationStudioRequestWording([PLANTS_INSTRUCTION], summary);

/** The first no, as step 0056 worded it: it grants that four rows came back, and calls the fifth wrongly dropped. */
export const PLANTS_FIRST_NO: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  expected: "Every houseplant in stock, from every page, no promoted listings, each plant once; table of name and price.",
  observed: "8 rows kept across 2 pages, all in stock, each plant once. "
    + "Condition 1 (promoted is absent) left out 5 rows, but 4 of them (Kentia Palm Classic 14 in Pot, Peace Lily 8 in Pot, Snake Plant Laurentii, 10 in Pot, Parlor Palm Bella, 6 in Pot) are also in the result via another copy, so not missing. "
    + `${PLANTS_PROMOTED_ONLY} is left out only by condition 1 and is absent from the stored rows.`,
  changed: `Condition 1 (promoted is absent) on ${PLANTS_READ} wrongly drops ${PLANTS_PROMOTED_ONLY}; the request says "leave out promoted listings" only, and this row's own label is a houseplant. Remove or relax condition 1 so this row is kept.`,
  stillAchievable: "yes"
};

/** The second no, as step 0057 worded it. */
export const PLANTS_SECOND_NO: AutomationStudioLlmDiagnosisFields = {
  answersRequest: "no",
  expected: "Every houseplant in stock across all pages, excluding promoted listings, each plant once, with name and price.",
  observed: "8 rows kept, all in stock, 2 pages read. "
    + "Condition 1 (promoted is absent) left out 5 rows, but 4 of them (Kentia Palm Classic 14 in Pot, Peace Lily 8 in Pot, Snake Plant Laurentii, 10 in Pot, Parlor Palm Bella, 6 in Pot) are also in the result, so not missing. "
    + `${PLANTS_PROMOTED_ONLY} is left out only by condition 1 and is absent from the result.`,
  changed: `Condition 1 (promoted is absent) on ${PLANTS_READ} wrongly drops ${PLANTS_PROMOTED_ONLY}; the promoted flag should be read per listing. Fix the promoted field selector so it only marks listings actually labeled Promoted.`,
  stillAchievable: "yes"
};
