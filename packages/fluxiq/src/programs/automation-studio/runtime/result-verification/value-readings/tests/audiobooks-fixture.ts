// A finished read with the shape of A8 bigbox `run-mv96rz6d-745e2940` step 0051
// (t624), on another kind of site: a library catalogue read over three pages
// that stored exactly the rows asked for, and left out rows by four
// conditions -- a presence test whose rows are second copies of stored items,
// a text test of a column the answer does not store, each of its rows
// witnessed with the value it failed on, a bound, and a negated text test the
// request implies but never states. The left-out labels share long prefixes.
// No task, site, product or answer of any realistic scenario.
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { summarizeAutomationStudioRunResult } from "../../result-summary.ts";
import { datasetSummary } from "../../tests/run-outcome-harness.ts";

/** The request. */
export const AUDIOBOOKS_REQUEST = "Find every audiobook in the library catalogue that my branch has on the shelf today and that is rated 4 or higher, going through every page. Leave out promoted entries, list each title once in the order the catalogue shows them, with columns title, author and rating.";

export const AUDIOBOOKS_INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: AUDIOBOOKS_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

export const AUDIOBOOKS_READ = "node.catalogue.read";

const SERIES = "The Quiet Harbour Mysteries, Book";
/** The stored rows: exactly those the request asks for. */
export const AUDIOBOOKS_STORED: JsonObject[] = [
  { title: `${SERIES} 1: Salt and Lantern (Unabridged Audiobook)`, author: "Mira Okafor", rating: "4.6" },
  { title: `${SERIES} 2: The Ferry Clock (Unabridged Audiobook)`, author: "Mira Okafor", rating: "4.5" },
  { title: "A Short History of Bridges, Unabridged Audiobook", author: "Tomas Reyne", rating: "4.2" }
];
/** Second copies, marked promoted, of two stored items: condition 1 alone left them out. */
export const AUDIOBOOKS_PROMOTED = [AUDIOBOOKS_STORED[0]!.title as string, AUDIOBOOKS_STORED[2]!.title as string];
/** Left out by condition 2, the shelf text test, alone, each with the value its witness found. */
export const AUDIOBOOKS_NOT_ON_SHELF: Array<[string, string]> = [
  [`${SERIES} 3: Night at the Pier (Unabridged Audiobook)`, "On shelf tomorrow"],
  [`${SERIES} 4: The Drowned Bell (Unabridged Audiobook)`, "On loan, due Nov 2"],
  [`${SERIES} 5: Winter Moorings (Unabridged Audiobook)`, "Request from another branch"]
];
/** Left out by condition 3, the bound, alone. */
export const AUDIOBOOKS_LOW_RATED = "Garden Birds of the Lowlands, Audio Edition";
/** Left out by condition 4, a negated text test of the title, alone. */
export const AUDIOBOOKS_SAMPLER = "The Quiet Harbour Mysteries, Sampler Edition (Unabridged Audiobook)";

const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: ["title", "author", "rating"].map((id) => ({ id, label: id, valueType: "string" as const })) };

/** The read as authored: four conditions; `shelf` and `promoted` are read to filter by and never stored. */
export const audiobooksReadNode = (): AutomationStudioFlowNode => ({
  id: AUDIOBOOKS_READ,
  definitionId: "web.output.dom-extract_list",
  parameterValues: {
    extractList: {
      fields: { title: { kind: "text" }, author: { kind: "text" }, rating: { kind: "text" }, shelf: { kind: "text" }, promoted: { kind: "text" } },
      where: [{ field: "promoted", is: "absent" }, { field: "shelf", contains: ["On shelf today"] }, { field: "rating", atLeast: 4 }, { field: "title", contains: ["Sampler"], not: true }],
      paginate: { mode: "next", maxPages: 5 }
    },
    recordOutput: { datasetId: "audiobooks", writeMode: "append" }
  }
});

const witness = (conditionIndex: number, value: string, page: number, item: number, source: "read" | "field" = "read"): JsonObject =>
  ({ conditionIndex, state: "present", value, source, readKind: "text", page, item });

/** The read's attempt; `witnessed` false sends no witness, as a read that predates them. */
export function audiobooksReadAttempt(witnessed = true): AutomationStudioFlowRunActionAttemptRecord {
  const aloneRows = [
    AUDIOBOOKS_PROMOTED.map((title) => ({ title })),
    AUDIOBOOKS_NOT_ON_SHELF.map(([title]) => ({ title })),
    [{ title: AUDIOBOOKS_LOW_RATED, rating: "3.7" }],
    [{ title: AUDIOBOOKS_SAMPLER }]
  ];
  const aloneObservations = [
    AUDIOBOOKS_PROMOTED.map((_title, at) => witness(0, "Promoted", at + 1, 1)),
    AUDIOBOOKS_NOT_ON_SHELF.map(([, shelf], at) => witness(1, shelf, at + 1, 4)),
    [witness(2, "3.7", 2, 6, "field")],
    [witness(3, AUDIOBOOKS_SAMPLER, 3, 2, "field")]
  ];
  return {
    attemptId: "attempt.catalogue.read", nodeId: AUDIOBOOKS_READ, definitionId: "web.output.dom-extract_list", order: 2, status: "succeeded", startedAt: 2,
    metadata: { extraction: {
      recordCount: AUDIOBOOKS_STORED.length, pagesRead: 3, truncated: false, itemsSeen: 14, paginationStop: "control_absent",
      conditions: {
        applied: 14, kept: 3, unfiltered: false, rejected: [2, 4, 2, 1], alone: [2, 3, 1, 1], seen: ["Promoted", "On shelf today", null, null],
        aloneRows, ...(witnessed ? { aloneObservations } : {})
      }
    } }
  };
}

/** The run's summary, as a trial makes it: the read's account, Core's readings of its values and the stored rows. */
export function audiobooksRunSummary(witnessed = true): AutomationStudioRunResultSummary {
  return summarizeAutomationStudioRunResult({
    recordSets: [{ summary: datasetSummary({ runId: "trial.1", datasetId: "audiobooks", nodeIds: [AUDIOBOOKS_READ], recordCount: AUDIOBOOKS_STORED.length }), schema, rows: AUDIOBOOKS_STORED.map((row) => ({ ...row })) }],
    flowNodes: [{ id: "node.catalogue.open", definitionId: "web.output.browser-navigate", parameterValues: { url: "https://catalogue.test/" } }, audiobooksReadNode()],
    actionAttempts: [audiobooksReadAttempt(witnessed)],
    deniedEvidenceKeys: [],
    now: 0
  });
}

/**
 * A yes in the shape of step 0054's: it quotes the request once beside each
 * condition and names no row a text test left out, only says they were
 * settled.
 */
export const AUDIOBOOKS_YES = {
  answersRequest: "yes",
  expected: "Every audiobook my branch has on the shelf today, rated 4 or higher, from every page, without promoted entries, each once, in catalogue order.",
  observed: [
    "3 rows stored from 3 pages, and the list ended.",
    "Condition 1 (promoted is absent) carries out \"Leave out promoted entries\".",
    "Condition 2 (shelf contains \"On shelf today\") carries out \"my branch has on the shelf today\": the rows it alone left out are settled, each showing a later shelf date, a loan or another branch.",
    "Condition 3 (rating atLeast 4) carries out \"rated 4 or higher\".",
    "Condition 4 (title not contains \"Sampler\") keeps whole titles, as \"every audiobook\" asks.",
    "The result answers the request."
  ].join(" ")
};
