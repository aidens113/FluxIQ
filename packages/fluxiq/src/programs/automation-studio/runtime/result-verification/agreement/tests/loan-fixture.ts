// A made-up library account for the re-ask of a no that names no defect Core
// can find (t752): a request for the books on loan marked due this week, a Flow
// that read the whole loans list with no condition, pressed a display-only
// control on each row it kept, then read the same list again with a condition
// testing the request's own words and stored exactly the three books asked for.
// The first read's rows are working rows, never the answer. An earlier judged
// trial of the same build advised a change to the condition, and this revision
// made it. No task, site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioResultEarlierAdvice, AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The request: one list, three columns, one stated mark. */
export const LOAN_REQUEST = "Open my library account's loans page and list every book on loan marked due this week, with its title, due date and renewals left.";

/** The three books stored: exactly the ones asked for. */
export const LOANS_DUE = [
  { title: "The Cartographer's Silence", due: "Mon 12 Oct", renewals: "2" },
  { title: "Winter at Holloway Mill", due: "Wed 14 Oct", renewals: "1" },
  { title: "A Field Guide to Small Hours", due: "Fri 16 Oct", renewals: "0" }
];

/** The books on loan the condition alone left out, each read by Core with a status that fails it. */
export const LOANS_LATER = [
  { title: "Notes from the Salt Marsh", due: "Tue 20 Oct", renewals: "3", status: "Due next week" },
  { title: "The Lamplighter's Almanac", due: "Mon 26 Oct", renewals: "2", status: "Due in 2 weeks" },
  { title: "Seven Bridges of Calder", due: "Mon 2 Nov", renewals: "1", status: "Due in 3 weeks" }
];

/** The answer read's condition, as its account words it: it reads its own value, and the text it tests is the request's. */
export const DUE_THIS_WEEK = "status (read \"Due this week\" on a row it kept) contains [\"Due this week\"]";

/** The request as a Flow's instruction states it. */
export function loanInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Books due this week", body: LOAN_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The request text as the verification reads it (`../../verify.ts`). */
export function loanRequestText(): string {
  return `Books due this week\n${LOAN_REQUEST}`;
}

/** The earlier judged trial's advice, which this revision followed. */
export const LOAN_EARLIER_ADVICE: AutomationStudioResultEarlierAdvice = {
  revision: 2,
  verdict: "no",
  advice: "Condition 1 tests the title; test each row's status for the words the request uses instead.",
  followed: "changed",
  named: ["condition 1"],
  said: "After revision 2 a judge advised changing condition 1 to test each row's status; this revision changed condition 1."
};

/**
 * The run (header). `answerRead` overrides the answer read's account, `wholeRead`
 * the first read's; `earlierAdvice: false` leaves the earlier advice off, and
 * `working: false` Core's working-rows flag on the first read.
 */
export function loanRunSummary(options: { answerRead?: Partial<AutomationStudioResultReadAccount>; wholeRead?: Partial<AutomationStudioResultReadAccount>; earlierAdvice?: boolean; working?: boolean } = {}): AutomationStudioRunResultSummary {
  const all = [...LOANS_DUE, ...LOANS_LATER.map(({ title, due, renewals }) => ({ title, due, renewals }))];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: all.length + LOANS_DUE.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 2,
    recordSets: [
      {
        datasetId: "loans-all", recordCount: all.length, refusedCount: 0, truncated: false, columns: ["title", "due", "renewals"], columnsWithheld: false,
        rowsChecked: all.length, rowsMissingRequired: 0, missingRequiredColumns: [],
        sampleRows: all.map((row) => ({ ...row })),
        processing: { collected: all.length, duplicates: 0, filteredOut: 0, cut: 0, kept: all.length, passes: [{ node: "read-all", pass: 1, rows: all.length, newRows: all.length }] }
      },
      {
        datasetId: "loans-due", recordCount: LOANS_DUE.length, refusedCount: 0, truncated: false, columns: ["title", "due", "renewals"], columnsWithheld: false,
        rowsChecked: LOANS_DUE.length, rowsMissingRequired: 0, missingRequiredColumns: [],
        sampleRows: LOANS_DUE.map((row) => ({ ...row })),
        processing: { collected: LOANS_DUE.length, duplicates: 0, filteredOut: 0, cut: 0, kept: LOANS_DUE.length, passes: [{ node: "read-due", pass: 1, rows: LOANS_DUE.length, newRows: LOANS_DUE.length }] }
      }
    ],
    reads: [
      {
        nodeId: "read-all", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: all.length, kept: all.length,
        ...(options.working === false ? {} : { workingRows: { rereadBy: "read-due", repeatedBy: ["details"], sameList: "items_edge_and_read_target" as const, said: "Step details was repeated once per row of step read-all, and step read-due read the same list again: read-all's rows are working rows, not the answer." } }),
        ...options.wholeRead
      },
      {
        nodeId: "read-due", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: all.length, kept: LOANS_DUE.length,
        conditions: [{
          number: 1, condition: DUE_THIS_WEEK, rejected: LOANS_LATER.length, alone: LOANS_LATER.length,
          leftOutOnlyByThis: LOANS_LATER.map((book) => book.title),
          leftOutObservations: LOANS_LATER.map((book, index) => ({ source: "read" as const, page: 1, item: 4 + index, readKind: "text" as const, state: "present" as const, value: book.status })),
          leftOutSettled: LOANS_LATER.map((book) => book.title),
          settled: "On each row in leftOutSettled the read found status, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 1 as written: each fails it."
        }],
        ...options.answerRead
      }
    ],
    flowShape: [
      { nodeId: "open", definitionId: "click" },
      { nodeId: "read-all", definitionId: "extract_list" },
      { nodeId: "details", definitionId: "click" },
      { nodeId: "read-due", definitionId: "extract_list" }
    ],
    withheld: false,
    ...(options.earlierAdvice === false ? {} : { earlierAdvice: [{ ...LOAN_EARLIER_ADVICE }] })
  };
}

/** A no for a method objection, and a count of the rows stored: no defect of this result, and none listed. */
export const LOAN_METHOD_NO = {
  answersRequest: "no",
  expected: "Every book on loan marked due this week, with its title, due date and renewals left.",
  observed: "The loans table holds only 3 rows: The Cartographer's Silence, Winter at Holloway Mill, A Field Guide to Small Hours. The Flow reads each row's status text rather than comparing its due date with today, which is fragile.",
  changed: "Compare each book's due date with today's date instead of reading the status text.",
  defects: []
};

/** A no claiming a condition drops rows the request asks for, listing a defect Core cannot find: no such row, and words the request never says. */
export const LOAN_FALSE_CLAIM_NO = {
  answersRequest: "no",
  expected: "Every book on loan marked due this week, with its title, due date and renewals left.",
  observed: "The status condition also drops books whose renewal is pending, which the request asks for.",
  changed: "Remove the status condition.",
  defects: [{ kind: "asked_missing", row: "books whose renewal is pending", requestWords: "including books awaiting renewal" }]
};

/** A no naming a real defect Core finds: a stored book the request does not ask for, quoting its words. */
export const LOAN_KEPT_NO = {
  answersRequest: "no",
  expected: "Only the books marked due this week.",
  observed: "Winter at Holloway Mill is stored, but its status says it is due next week.",
  changed: "Keep only rows whose status says due this week.",
  defects: [{ kind: "kept_not_asked", row: "Winter at Holloway Mill", requestWords: "marked due this week" }]
};

/** The yes: the three books asked for are stored, each left-out book named beside the request's words that leave it out. */
export const LOAN_YES = {
  answersRequest: "yes",
  expected: "Every book on loan marked due this week, with its title, due date and renewals left.",
  observed: "Three books are stored, each with its title, due date and renewals left. Notes from the Salt Marsh is left out: its status says due next week, and the request asks for books \"marked due this week\". The Lamplighter's Almanac is left out: its status says due in 2 weeks, not \"marked due this week\". Seven Bridges of Calder is left out: its status says due in 3 weeks, not \"marked due this week\"."
};
