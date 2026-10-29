// A made-up library catalog search for the defects of framework plan P5 (debug
// `run-mvtdoyf3-47ffaac1`, fixes F3 and F4), its shape and none of its words:
// a search for garden gloves whose every result the request asks for, less
// the reference copies; a read that kept three titles, one of them a hook for
// garden gloves, and left out a reference copy by a presence condition the
// request states, and two titles by an `isbn is present` condition it never
// states, each said `label — isbn: (no value)`. No task, site, item or answer
// of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** A request for every result its search shows, less the one exclusion it states. */
export const EVERY_RESULT_REQUEST = "Search the catalog for garden gloves and list every result the search shows, leaving out reference copies, with its title and format.";

/** A request for a kind of thing (t628): the named thing is what the rows must be. */
export const KIND_REQUEST = "Find garden gloves and list them, with their title and format.";

/** The search clause of `EVERY_RESULT_REQUEST`, which says where to look. */
export const SEARCH_WORDS = "Search the catalog for garden gloves";

/** The kept row whose label names the searched words after another thing. */
export const GLOVE_HOOK = "Glove Hook for Garden Gloves";

/** The titles the presence condition no request states left out. */
export const NO_ISBN = ["Garden Gloves Care Pamphlet", "Garden Gloves Seed Swap Flyer"];

export function catalogInstruction(body: string = EVERY_RESULT_REQUEST): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Catalog search", body,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The request text as `../../verify.ts` builds it from the instruction. */
export function catalogRequestText(body: string = EVERY_RESULT_REQUEST): string {
  const instruction = catalogInstruction(body);
  return `${instruction.title}\n${instruction.body}`;
}

/** The run: three stored titles, one reference copy left out by `reference is absent`, and the two `NO_ISBN` titles by `isbn is present`, Core-settled. */
export function catalogRunSummary(): AutomationStudioRunResultSummary {
  const stored = [
    { title: "Garden Gloves Handbook", format: "Paperback" },
    { title: "Garden Gloves Through the Seasons", format: "Hardback" },
    { title: GLOVE_HOOK, format: "Other" }
  ];
  const noIsbn = NO_ISBN.map((title) => `${title} — isbn: (no value)`);
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: stored.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "catalog", recordCount: stored.length, refusedCount: 0, truncated: false, columns: ["title", "format"], columnsWithheld: false,
      rowsChecked: stored.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: stored
    }],
    reads: [{
      nodeId: "read-results", definitionId: "example.read-list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 6, kept: stored.length,
      conditions: [
        {
          number: 1, condition: "reference is absent", rejected: 1, alone: 1,
          leftOutOnlyByThis: ["Garden Gloves Reference Copy — reference: Reference"], leftOutCells: [{ title: "Garden Gloves Reference Copy", format: "Hardback" }]
        },
        {
          number: 2, condition: "isbn is present", rejected: 2, alone: 2,
          leftOutOnlyByThis: noIsbn, leftOutCells: NO_ISBN.map((title) => ({ title, format: "Paperback" })),
          presence: "A row is kept only when this condition's read finds a value on it: the read found one on every row it kept, and found none on each row it alone left out, each said with (no value).",
          leftOutSettled: noIsbn, settledKind: "presence",
          settled: "On each row in leftOutSettled the read found no isbn, so each fails condition 2 (isbn is present) as written."
        }
      ]
    }],
    flowShape: [
      { nodeId: "search", definitionId: "example.search", label: "Search the catalog" },
      { nodeId: "read-results", definitionId: "example.read-list", label: "Read the results" }
    ],
    withheld: false
  };
}
