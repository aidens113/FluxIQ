// A library account's loans, in the shape of A8 `run-mvbr0w7e-6a01c05b`'s
// judged trial (steps 0032-0033), paraphrased to another kind of site (t691):
// a first read keeps the loans at least 5 days overdue and the Flow renews
// each; a last read, meant to list the loans now shown as renewed, has no
// condition and stores all eight. Condition 1 settled its four left-out rows,
// and the stored copies of those four came from the last read alone.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../request-wording.ts";

/** The first read, which narrows the loans the Flow renews, and the last read, which stores the answer. */
export const RENEWALS_ACT_READ = "node.loans.renew_overdue.s8";
export const RENEWALS_LIST_READ = "node.loans.renew_overdue.s14";

/** The loans condition 1 kept, which the Flow renewed, with what each shows. */
export const RENEWALS_KEPT: ReadonlyArray<readonly [string, string]> = [
  ["The Salt Road", "12 days overdue"], ["Winter Orchard", "5 days overdue"], ["A Map of Tides", "9 days overdue"], ["Quiet Engines", "5 days overdue"]
];

/** The loans condition 1 alone left out, which the Flow did not renew, with what each shows. */
export const RENEWALS_LEFT_OUT: ReadonlyArray<readonly [string, string]> = [
  ["Paper Lanterns", "1 day overdue"], ["The Long Field", "4 days overdue"], ["North of Nowhere", ""], ["Glass Harbour", "3 days overdue"]
];

/** Condition 1's left-out rows as the read's account says them. */
export const RENEWALS_LEFT_OUT_ROWS = RENEWALS_LEFT_OUT.map(([title, days]) => `${title} — daysOverdue: ${days || "(no value)"}`);

/** The request, in two parts: renew the overdue loans, then list the loans now shown as renewed. */
export const RENEWALS_REQUEST = [
  "Go through my loans and renew every loan that is at least 5 days overdue, and leave every other loan as it is.",
  "Then give me a table of every loan the list now shows as renewed, in the order the list shows them, with columns title and daysOverdue, where daysOverdue is written exactly as the loan shows it."
].join(" ");

/** The same Flow's request where the last table asks for every loan, renewed or not: there the four rows are asked for. */
export const RENEWALS_REQUEST_EVERY_LOAN = RENEWALS_REQUEST.replace("every loan the list now shows as renewed", "every loan on the list, renewed or not");

const instruction = (body: string): AutomationStudioFlowInstruction => ({
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Renew overdue loans", body,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
});

/** The request as a Flow's instructions state it. */
export function renewalsInstructions(request = RENEWALS_REQUEST): AutomationStudioFlowInstruction[] {
  return [instruction(request)];
}

/** The judged trial's summary, as Core built it before the judge's copy (step 0032's shape). */
export function renewalsRunSummary(): AutomationStudioRunResultSummary {
  const row = ([title, days]: readonly [string, string]) => ({ title, daysOverdue: days });
  const listed = [RENEWALS_LEFT_OUT[0]!, RENEWALS_KEPT[0]!, RENEWALS_LEFT_OUT[1]!, RENEWALS_KEPT[1]!, RENEWALS_LEFT_OUT[2]!, RENEWALS_KEPT[2]!, RENEWALS_KEPT[3]!, RENEWALS_LEFT_OUT[3]!];
  const set = (datasetId: string, node: string, rows: ReadonlyArray<readonly [string, string]>) => ({
    datasetId, recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "daysOverdue"], columnsWithheld: false,
    rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: rows.map(row),
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node, pass: 1, rows: rows.length, newRows: rows.length }] }
  });
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 12, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 2,
    recordSets: [set("renewed-loans-s14", RENEWALS_LIST_READ, listed), set("overdue-loans-s8", RENEWALS_ACT_READ, RENEWALS_KEPT)],
    reads: [
      {
        nodeId: RENEWALS_ACT_READ, definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 8, kept: 4, paginates: false, dedupes: false,
        conditions: [{
          number: 1, condition: "daysOverdue atLeast 5", rejected: 4, alone: 4,
          leftOutOnlyByThis: [...RENEWALS_LEFT_OUT_ROWS], leftOutSettled: [...RENEWALS_LEFT_OUT_ROWS],
          settled: "Core read daysOverdue on each row in leftOutSettled, and each fails condition 1 (daysOverdue atLeast 5) as written. It must still show the bound is the request's: quote, once, in a sentence that names condition 1 (daysOverdue atLeast 5) or daysOverdue, the request's own words stating that bound."
        }]
      },
      { nodeId: RENEWALS_LIST_READ, definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 8, kept: 8, paginates: false, dedupes: false }
    ],
    flowShape: [
      { nodeId: "node.loans.renew_overdue.s1", definitionId: "navigate" }, { nodeId: RENEWALS_ACT_READ, definitionId: "extract_list" },
      { nodeId: "node.loans.renew_overdue.s11", definitionId: "click" }, { nodeId: RENEWALS_LIST_READ, definitionId: "extract_list" }
    ],
    withheld: false
  };
}

/** The request as a judge's words are held to it, over the summary above. */
export function renewalsWording(request = RENEWALS_REQUEST): AutomationStudioRequestWording {
  return automationStudioRequestWording(renewalsInstructions(request), renewalsRunSummary())!;
}

/**
 * Judge 0032's yes, paraphrased: it settles condition 1 with a quote of the
 * request's bound, and says the last read "holds all 8 rows", never why the
 * answer holds the four the Flow did not renew.
 */
export const RENEWALS_YES = {
  diagnosis: {
    answersRequest: "yes",
    expected: "Renew every loan at least 5 days overdue, leave all others untouched, then list every loan the list now shows as renewed, in list order, with title and daysOverdue exactly as shown.",
    observed: "Condition 1 (daysOverdue atLeast 5) kept The Salt Road (12), Winter Orchard (5), A Map of Tides (9), Quiet Engines (5) and left out Paper Lanterns (1), The Long Field (4), Glass Harbour (3), North of Nowhere (no value) — all correctly below the request's \"at least 5 days overdue\". Renew ran on exactly those four; endView shows those four renewed and the other four still with Renew. Renewed table s14 holds all 8 rows in list order with daysOverdue verbatim.",
    changed: "No change needed.",
    patchNeeded: false
  },
  summaryText: "The Flow opened the loans, read the list, kept only loans at least 5 days overdue (condition 1, daysOverdue atLeast 5, matching the request's \"at least 5 days overdue\"), renewed exactly those four, and left the other four untouched, as endView confirms. The renewed-loans read then returned all eight rows in list order with title and daysOverdue exactly as shown, including the four newly renewed. The request is satisfied."
} as const;

/** A yes that names each of the four beside the read that stored them and the request's words asking for them: what the rule asks, where the request does. */
export const RENEWALS_YES_EXPLAINED = [
  RENEWALS_YES.diagnosis.observed,
  "s14 stores Paper Lanterns, The Long Field, North of Nowhere and Glass Harbour because the request asks for \"every loan on the list, renewed or not\"."
].join(" ");
