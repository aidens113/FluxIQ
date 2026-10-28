// The rows a read left out reach its account with their own cells beside their
// labels (t771): every declared column, alone or together, screened as stored
// rows are, empty where the read found nothing, and carried through a loop's
// passes. Rerun round 6 social `run-mvrj7qg8-c20c132e`: a left-out row named
// only by a friend's name looked like any row with a group, and its judges
// invented one. A hobby club's notice board: no task, site, item or answer of
// any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioResultReadAccount } from "../../contracts/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadLeftOutCells } from "../../left-out-cells/index.ts";
import { automationStudioResultReadLoopedAccount } from "../looped-account.ts";

const NODE = "read.notices";

const node = (): AutomationStudioFlowNode => ({
  id: NODE,
  definitionId: "web.output.dom-extract_list",
  parameterValues: {
    extractList: {
      item: ".notice",
      fields: { club: { kind: "text", selector: "h3" }, clubLink: { kind: "attribute", selector: "h3 a", attribute: "href" }, posted: { kind: "text", selector: "time" } },
      where: [{ field: "clubLink", is: "present" }, { field: "posted", contains: "2027" }],
      minItems: 0
    }
  }
});

/** A notice a friend wrote on their own page: labelled by the friend's name, no club link. */
const FRIEND_NOTICE = { club: "Ann Lee", clubLink: "", posted: "6 March 2027" };
/** An old notice of a club, with no link and from another year. */
const OLD_NOTICE = { club: "Bo Kim", clubLink: "", posted: "1 May 2026" };

const attempt = (): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "attempt.read", nodeId: NODE, definitionId: "web.output.dom-extract_list", order: 1, status: "succeeded", startedAt: 1,
  metadata: {
    extraction: {
      recordCount: 1, pagesRead: 1, truncated: false, fieldNames: ["club", "clubLink", "posted"], missingFields: [], itemsSeen: 3,
      conditions: {
        applied: 3, kept: 1, rejected: [2, 1], unfiltered: false, alone: [1, 0],
        aloneRows: [[FRIEND_NOTICE], []],
        togetherRows: [{ failed: [0, 1], rows: [OLD_NOTICE] }]
      }
    }
  }
});

describe("the rows a read left out, with their own cells (t771)", () => {
  it("carries each row a condition alone left out with every declared cell, an empty one where the read found nothing", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt()], flowNodes: [node()], deniedEvidenceKeys: [] });
    const first = reads[0]?.conditions?.[0];
    expect(first?.leftOutOnlyByThis).toHaveLength(1);
    expect(first?.leftOutCells).toEqual([FRIEND_NOTICE]);
  });

  it("carries each row conditions left out together with its cells", () => {
    const { reads } = automationStudioResultReadAccounts({ actionAttempts: [attempt()], flowNodes: [node()], deniedEvidenceKeys: [] });
    expect(reads[0]?.leftOutTogether).toEqual([{ conditions: [1, 2], rows: ["Bo Kim"], cells: [OLD_NOTICE] }]);
  });

  it("leaves out a denied column, and says a credential- or locator-shaped value withheld", () => {
    const cells = automationStudioResultReadLeftOutCells([{ club: "Ann Lee", memberId: "M-1", note: "token sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }], 1, ["memberId"]);
    expect(cells).toEqual([{ club: "Ann Lee", note: "(withheld)" }]);
  });

  it("carries none where the rows cannot be aligned with their labels", () => {
    expect(automationStudioResultReadLeftOutCells([{ club: "Ann Lee" }], 2, [])).toBeUndefined();
    expect(automationStudioResultReadLeftOutCells(["Ann Lee"], 1, [])).toBeUndefined();
  });

  it("adds up every pass of a loop, cells in the rows' order", () => {
    const pass = (label: string, club: string): AutomationStudioResultReadAccount => ({
      nodeId: NODE, definitionId: "web.output.dom-extract_list", pagesRead: 1, truncated: false, kept: 1,
      conditions: [{ number: 1, rejected: 1, alone: 1, leftOutOnlyByThis: [label], leftOutCells: [{ club }] }],
      leftOutTogether: [{ conditions: [1, 2], rows: [label], cells: [{ club }] }]
    });
    const looped = automationStudioResultReadLoopedAccount({ passes: [pass("Ann Lee", "Ann Lee"), pass("Bo Kim", "Bo Kim")], attempts: 2 });
    expect(looped.conditions?.[0]?.leftOutCells).toEqual([{ club: "Ann Lee" }, { club: "Bo Kim" }]);
    expect(looped.leftOutTogether).toEqual([{ conditions: [1, 2], rows: ["Ann Lee", "Bo Kim"], cells: [{ club: "Ann Lee" }, { club: "Bo Kim" }] }]);
  });
});
