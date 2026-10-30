// A library catalogue's result, the shape every computed-fact test starts
// from: one read of the catalogue list, one record set of books it stored, and
// the request that asked for them. Shaped unlike any Lab scenario on purpose.

import type { JsonObject } from "../../../../../../core/index.ts";
import type {
  AutomationStudioResultComputedFactsInput,
  AutomationStudioResultReadAccount,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioResultRequestedOutput,
  AutomationStudioRunResultSummary
} from "../../contracts/index.ts";

export const READ_NODE = "read_catalogue";
export const READ_DEFINITION = "web.output.dom-extract_list";
export const REQUEST = "List the 3 newest paperbacks under $15 in the catalogue, with columns title, author and price.";

export function libraryInput(summary: AutomationStudioRunResultSummary, requestText: string = REQUEST, requestedOutput?: AutomationStudioResultRequestedOutput): AutomationStudioResultComputedFactsInput {
  return { summary, instructions: [{ title: "Catalogue", body: requestText }], requestText: `Catalogue\n${requestText}`, ...(requestedOutput ? { requestedOutput } : {}) };
}

export function librarySummary(change: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary {
  const sets = change.recordSets ?? [bookSet()];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: sets.reduce((total, set) => total + set.recordCount, 0),
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: sets.length,
    recordSets: sets,
    reads: [catalogueRead()],
    flowShape: [catalogueStep()],
    withheld: false,
    ...change
  };
}

export const BOOKS: JsonObject[] = [
  { title: "The Quiet Orchard", author: "Mira Lund", price: "$12.50", format: "Paperback" },
  { title: "Salt and Lantern", author: "Odile Varga", price: "$9.99", format: "Paperback" },
  { title: "A Map of Small Rivers", author: "Teo Brandt", price: "$14.00", format: "Paperback" }
];

/** The set the catalogue read stored: its rows, collected by that read in one pass. */
export function bookSet(rows: JsonObject[] = BOOKS, change: Partial<AutomationStudioResultRecordSetSummary> = {}): AutomationStudioResultRecordSetSummary {
  return {
    datasetId: "books",
    recordCount: rows.length,
    refusedCount: 0,
    truncated: false,
    columns: ["title", "author", "price", "format"],
    columnsWithheld: false,
    rowsChecked: rows.length,
    rowsMissingRequired: 0,
    missingRequiredColumns: [],
    sampleRows: rows,
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node: READ_NODE, pass: 1, rows: rows.length, newRows: rows.length }] },
    ...change
  };
}

export function catalogueRead(change: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount {
  return { nodeId: READ_NODE, definitionId: READ_DEFINITION, pagesRead: 1, stop: "no_following_page", truncated: false, itemsSeen: 10, kept: 3, paginates: true, ...change };
}

/** The catalogue read as authored: its columns, and its conditions in order. */
export function catalogueStep(where: JsonObject[] = []): AutomationStudioRunResultSummary["flowShape"][number] {
  return {
    nodeId: READ_NODE,
    definitionId: READ_DEFINITION,
    parameters: {
      extractList: {
        fields: { title: { kind: "text" }, author: { kind: "text" }, price: { kind: "text" }, format: { kind: "text" } },
        ...(where.length ? { where } : {}),
        output: { datasetId: "books" }
      }
    }
  };
}

/** A checklist of one part asking for records, with its words and its declared answer. */
export function checklistOf(answer: NonNullable<NonNullable<AutomationStudioRunResultSummary["taskChecklist"]>["asked"][number]["answer"]>, words = "List the 3 newest paperbacks under $15 in the catalogue"): NonNullable<AutomationStudioRunResultSummary["taskChecklist"]> {
  return { supplementary: "", notAsked: [], asked: [{ part: "p1", words, goalFacts: [], lastingActs: [], answer }] };
}
