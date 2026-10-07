// A read that ran as a pass of a loop: Merge -> Repeat -> read -> the step
// that moves the list on, whose `success` goes back to the Merge and whose
// `ended` leaves (read-list design 5.2). Every pass is a new attempt of the
// read, so the account adds up every pass rather than speak for the last.
// The trace is the one `flow-bootstrap/authoring/tests/repeat-loop.test.ts`
// runs: Repeat answers `body` per pass, the moving step `success` until `ended`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";
import { automationStudioResultSummaryWithPagingWords } from "../judge-paging.ts";

const REPEAT = "builtin.control.repeat";
const READ_ID = "read";

let order = 0;
type Attempt = AutomationStudioFlowRunActionAttemptRecord;
const at = (nodeId: string, definitionId: string, route: string, status: Attempt["status"] = "succeeded", metadata?: Attempt["metadata"]): Attempt => {
  order += 1;
  return { attemptId: `a${order}`, nodeId, definitionId, order, status, route, startedAt: order, ...(metadata ? { metadata } : {}) };
};

/** One pass's read, as the run record holds it: one page, its kept rows and what each condition rejected. */
const pass = (kept: number, seen: number, rejected: [number, number], alone?: string[]): Attempt =>
  at(READ_ID, "opaque.read", "success", "succeeded", {
    extraction: {
      recordCount: kept,
      pagesRead: 1,
      truncated: false,
      itemsSeen: seen,
      conditions: { applied: seen, kept, rejected, alone: [rejected[0], 0], ...(alone ? { aloneRows: [alone.map((name) => ({ name })), []] } : {}) }
    }
  });

/** The loop as a run walks it: one entry of the Merge and the Repeat per pass, then the read and the moving step. */
function loopRun(kept: number[], end: "ended" | "bound" | "failed"): Attempt[] {
  order = 0;
  const attempts: Attempt[] = [at("start", "builtin.control.start", "success")];
  kept.forEach((rows, index) => {
    attempts.push(at("loop", "builtin.control.merge", "success"), at("repeat", REPEAT, "body"));
    attempts.push(pass(rows, rows + 4, [3, 1], index === 0 ? ["Left A"] : index === 2 ? ["Left C"] : undefined));
    const last = index === kept.length - 1;
    if (!last || end === "bound") attempts.push(at("move", "opaque.move-on", "success"));
    else if (end === "ended") attempts.push(at("move", "opaque.move-on", "ended"));
    else attempts.push(at("move", "opaque.move-on", "failed", "failed"));
  });
  if (end === "bound") attempts.push(at("loop", "builtin.control.merge", "success"), at("repeat", REPEAT, "done"));
  attempts.push(at("after", "opaque.after", "success"));
  return attempts;
}

const flowNodes = (most?: number): AutomationStudioFlowNode[] => [
  { id: "repeat", definitionId: REPEAT, ...(most !== undefined ? { parameterValues: { most } } : {}) },
  { id: READ_ID, definitionId: "opaque.read", parameterValues: { where: [{ field: "sponsored", is: "absent" }, { field: "rating", atLeast: 4 }], fields: { name: { kind: "text" }, rating: { kind: "text" } } } }
];

const accountOf = (attempts: Attempt[], most?: number) =>
  automationStudioResultReadAccounts({ actionAttempts: attempts, flowNodes: flowNodes(most), deniedEvidenceKeys: [] }).reads;

describe("a read that ran as the passes of a loop", () => {
  it("adds up every pass into one account, and says the list ended where the moving step found no further page", () => {
    const reads = accountOf(loopRun([3, 3, 3, 2, 2], "ended"), 10);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toEqual({
      nodeId: READ_ID,
      definitionId: "opaque.read",
      pagesRead: 5,
      pageLimit: 10,
      stop: "ended",
      truncated: false,
      itemsSeen: 33,
      kept: 13,
      paginates: true,
      dedupes: false,
      conditions: [
        { condition: "sponsored is absent", rejected: 15, alone: 15, leftOutOnlyByThis: ["Left A", "Left C"] },
        { condition: "rating atLeast 4", rejected: 5, alone: 0 }
      ],
      attempts: 5,
      keptPerPage: [3, 3, 3, 2, 2]
    });
  });

  it("says the loop's bound where the Repeat answered done, with the bound the Flow authored", () => {
    const [read] = accountOf(loopRun([4, 4, 4], "bound"), 3);
    expect(read).toMatchObject({ pagesRead: 3, pageLimit: 3, stop: "bound", kept: 12, keptPerPage: [4, 4, 4] });
  });

  it("says a loop a step of which failed as failed, and states no bound the Flow did not author", () => {
    const [read] = accountOf(loopRun([4, 2], "failed"));
    expect(read).toMatchObject({ pagesRead: 2, stop: "failed", kept: 6, keptPerPage: [4, 2] });
    expect(read).not.toHaveProperty("pageLimit");
  });

  it("leaves a read outside any loop as it was, even after a loop that ran before it", () => {
    const attempts = [...loopRun([1, 1], "ended")];
    const outside = pass(7, 9, [1, 1]);
    const reads = automationStudioResultReadAccounts({ actionAttempts: [...attempts, { ...outside, nodeId: "later" }], deniedEvidenceKeys: [] }).reads;
    expect(reads.find((read) => read.nodeId === "later")).toEqual({
      nodeId: "later", definitionId: "opaque.read", pagesRead: 1, truncated: false, itemsSeen: 9, kept: 7,
      conditions: [{ rejected: 1, alone: 1 }, { rejected: 1, alone: 0 }]
    });
  });

  it("says a read the list ended as every page read, in Core's words for a loop", () => {
    const [read] = accountOf(loopRun([3, 3, 3, 2, 2], "ended"), 10);
    for (const length of ["brief", "full"] as const) {
      const said = automationStudioResultReadSentence(read!, length);
      expect(said).toContain("read every page (5) and the list ended: the step that moves it on found no page after page 5");
      expect(said).not.toMatch(/maxPages|Next|paginat/u);
    }
    const paging = (automationStudioResultSummaryWithPagingWords({
      schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 13, totalRefusedCount: 0, totalRowsMissingRequired: 0,
      recordSetCount: 1, recordSets: [], flowShape: [], withheld: false, reads: [read!]
    }).reads?.[0] as unknown as { paging: string }).paging;
    expect(paging).toContain("There is no further page.");
  });

  it("tells a read the loop's bound stopped to raise the repeat's most, never maxPages", () => {
    const [read] = accountOf(loopRun([4, 4, 4], "bound"), 3);
    const full = automationStudioResultReadSentence(read!, "full");
    expect(full).toContain("the loop's bound of 3 passes stopped it");
    expect(full).toContain("raise the most passes (`most`) of the Repeat that loops it");
    expect(full).not.toMatch(/maxPages|maxScrolls|Next|paginat/u);
  });
});
