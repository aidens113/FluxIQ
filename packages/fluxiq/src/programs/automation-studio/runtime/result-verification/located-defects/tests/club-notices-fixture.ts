// A made-up hobby club notice board for a no calling a left-out row missing
// (t771): a request for the notices written in the clubs the person belongs
// to, a read that kept one club notice and left out a friend's own notice --
// labelled by the friend's name, with no club link -- and an old club notice.
// The shape of rerun round 6 social `run-mvrj7qg8-c20c132e`, where judges gave
// a friend's own post a group it does not have and called it missing. No task,
// site, item or answer of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

export const NOTICE_REQUEST = "List every notice written in one of the clubs I belong to, with its club, author and posting date.";

/** The request's words a club notice is asked for by. */
export const CLUB_WORDS = "written in one of the clubs I belong to";

export function noticeInstruction(): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Club notices", body: NOTICE_REQUEST,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/**
 * The run: one stored notice of the Chess Club; a friend's own notice, "Ann
 * Lee", that the club-link condition alone left out, with `friendClub` its
 * club cell as the read found it; and Bo Kim's old notice, left out by both
 * conditions together. The read read every page.
 */
export function noticeRunSummary(friendClub = "Ann Lee"): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "notices", recordCount: 1, refusedCount: 0, truncated: false, columns: ["club", "author", "posted"], columnsWithheld: false,
      rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: [{ club: "Chess Club", author: "Dana Ortiz", posted: "6 March 2027" }]
    }],
    reads: [{
      nodeId: "read-notices", definitionId: "example.read-list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 3, kept: 1,
      conditions: [
        { number: 1, condition: "clubLink is present", rejected: 2, alone: 1, leftOutOnlyByThis: ["Ann Lee"], leftOutCells: [{ club: friendClub, clubLink: "", author: "Ann Lee", posted: "6 March 2027" }] },
        { number: 2, condition: "posted contains [\"2027\"]", rejected: 1, alone: 0 }
      ],
      leftOutTogether: [{ conditions: [1, 2], rows: ["Bo Kim"], cells: [{ club: "Bo Kim", clubLink: "", author: "Bo Kim", posted: "1 May 2026" }] }]
    }],
    flowShape: [{ nodeId: "read-notices", definitionId: "example.read-list", label: "Read the notices" }],
    withheld: false
  };
}

/** A no calling the friend's own notice missing, giving it the Chess Club, which its own club cell does not say. */
export const INVENTED_CLUB_NO = {
  answersRequest: "no",
  expected: "Every notice written in a club the person belongs to.",
  observed: "The club-link condition left out Ann Lee's Chess Club notice.",
  changed: "Drop the club-link condition and keep notices by their club name.",
  defects: [{ kind: "asked_missing", row: "Ann Lee — Chess Club, 6 March 2027", column: "club", value: "Chess Club", requestWords: CLUB_WORDS }]
};

/** A yes naming the left-out rows and quoting the request. */
export const NOTICE_YES = {
  answersRequest: "yes",
  expected: "Every notice written in a club the person belongs to.",
  observed: "The result holds the one Chess Club notice. \"Ann Lee\" was left out: it is a friend's own notice with no club, and the request asks only for notices \"written in one of the clubs I belong to\". \"Bo Kim\" was left out: it has no club and is from 2026, and the request asks only for notices \"written in one of the clubs I belong to\".",
  changed: ""
};
