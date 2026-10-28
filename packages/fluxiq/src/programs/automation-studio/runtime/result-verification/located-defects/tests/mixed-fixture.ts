// A mixed request on the made-up library account of `./act-only-fixture.ts` (t766): it owes records -- the books due
// this week, by title -- and asks for an act beside them. The run read and stored the two books, but never switched
// the reminders on. No task, site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { reminderInstruction, reminderRunSummary } from "./act-only-fixture.ts";

/** The mixed request: a list to return, and one act. */
export const MIXED_REQUEST = "List every book on loan due this week with its title, and turn on due-date reminders for my account.";

/** The mixed request as a Flow's instruction states it. */
export function mixedInstruction(): AutomationStudioFlowInstruction {
  return { ...reminderInstruction(), title: "Due books and reminders", body: MIXED_REQUEST };
}

/** What the mixed run did: it opened the loans page and read the two books due, and switched nothing on. */
export function mixedRunSummary(): AutomationStudioRunResultSummary {
  const due = [{ title: "Winter at Holloway Mill" }, { title: "A Field Guide to Small Hours" }];
  return reminderRunSummary({
    totalRecordCount: 2, recordSetCount: 1,
    recordSets: [{
      datasetId: "due", recordCount: 2, refusedCount: 0, truncated: false, columns: ["title"], columnsWithheld: false, rowsChecked: 2, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: due.map((row) => ({ ...row })),
      processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: "read-due", pass: 1, rows: 2, newRows: 2 }] }
    }],
    reads: [{ nodeId: "read-due", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 2, kept: 2 }],
    flowShape: [
      { nodeId: "open-loans", definitionId: "example.press", label: "Open loans", parameters: { control: "Loans" }, changed: [{ added: "heading \"Loans\"" }] },
      { nodeId: "read-due", definitionId: "extract_list", label: "Read the books due" }
    ],
    endView: { after: "read-due", view: { page: "PAGE \"Loans\"\nswitch \"Due-date reminders\" off" } }
  });
}

/** A no of the mixed run naming the act no step did, quoting the request. */
export const MIXED_ACT_NO = {
  answersRequest: "no",
  observed: "The books are listed, but no step turns the due-date reminders on: the switch is still off.",
  changed: "Turn on the Due-date reminders switch.",
  defects: [{ kind: "act_missing", row: "Due-date reminders switch", requestWords: "turn on due-date reminders for my account" }]
};

/** A no of the mixed run claiming a kept row the result does not hold: a row claim still needs a row. */
export const MIXED_ROW_NO = {
  answersRequest: "no",
  observed: "The list keeps a book that is not due this week.",
  changed: "Keep only the books due this week.",
  defects: [{ kind: "kept_not_asked", row: "The Lamplighter's Almanac", requestWords: "every book on loan due this week" }]
};
