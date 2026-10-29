// A made-up club board for a no calling a left-out row missing by the very
// value a condition tested and left it out for (t785): a read that kept the
// posts whose club is one of two clubs the Flow wrote, and left out Ann Lee's
// post in a third, by that condition alone. The shape of run
// `run-mvskodlp-9966d618`, where both judges of a correct result called such
// rows missing, quoting the value the condition had rejected. No task, site,
// item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

/** The request that defines its rows by a property no cell holds. */
export const MEMBER_REQUEST = "every post in a club I belong to";
/** The request that names every club it asks for. */
export const NAMED_CLUBS_REQUEST = "every post in A Club, B Club or C Club";

export function clubPostsInstruction(body: string = MEMBER_REQUEST): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Posts", body,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/**
 * The run: one stored post of A Club; Ann Lee's post, whose club cell is
 * C Club, left out by condition 1, `club equals ["A Club", "B Club"]`, alone.
 * The step is held as authored, screened as every summary carries it -- each
 * list as `{ count, items }` (`../../../recovery/repair-context/parameter-screen.ts`)
 * -- so Core reads the condition's values there.
 */
export function clubPostsRunSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "posts", recordCount: 1, refusedCount: 0, truncated: false, columns: ["author", "club"], columnsWithheld: false,
      rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: [{ author: "Dana Ortiz", club: "A Club" }]
    }],
    reads: [{
      nodeId: "read-posts", definitionId: "example.read-list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 2, kept: 1,
      conditions: [
        { number: 1, condition: "club equals [\"A Club\", \"B Club\"]", rejected: 1, alone: 1, leftOutOnlyByThis: ["Ann Lee"], leftOutCells: [{ club: "C Club" }] }
      ]
    }],
    flowShape: [{
      nodeId: "read-posts", definitionId: "example.read-list", label: "Read the posts",
      parameters: { extractList: { where: { count: 1, items: [{ field: "club", equals: { count: 2, items: ["A Club", "B Club"] } }] }, fields: { author: { kind: "text" }, club: { kind: "text" } } } }
    }],
    withheld: false
  };
}

/** The no: Ann Lee's post is missing, by the club the condition tested and left it out for. */
export const TESTED_CLUB_NO = {
  answersRequest: "no",
  expected: "Every post in a club the person belongs to.",
  observed: "The club condition left out Ann Lee's C Club post.",
  changed: "Keep the posts of every club the person belongs to.",
  defects: [{ kind: "asked_missing", row: "Ann Lee — C Club", column: "club", value: "C Club", requestWords: MEMBER_REQUEST }]
};

/** A yes naming the left-out row and quoting the request. */
export const CLUB_POSTS_YES = {
  answersRequest: "yes",
  expected: "Every post in a club the person belongs to.",
  observed: "The result holds the one A Club post. \"Ann Lee\" was left out: its club is C Club, and the request asks only for posts \"in a club I belong to\".",
  changed: ""
};
