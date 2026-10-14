// A called part's read is told by its own authored node (t574). Live run
// `run-mv7vor5f-ea4d08b4`: a subflow trial runs its part across a Call Subflow
// boundary, every read in it has a `parentAttemptId`, and `accounts.ts` then
// dropped the authored node -- so every subflow trial's judge got no condition
// wording, no tested value beside a left-out row, no `testedLabel` and no
// dedupe, where the whole-candidate trial of the same read had them all.
// A generic catalogue of another kind of site, the same shape.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";

type Attempt = AutomationStudioFlowRunActionAttemptRecord;
const CALL = "call.attempt.1";
const READ = "node.part.tools.read";

/** The part's read: a rating bound, a name exclusion over the label's own column, a stock presence test; paged and deduped by url. */
const partRead = (): AutomationStudioFlowNode => ({
  id: READ,
  definitionId: "unit.list",
  parameterValues: {
    list: {
      fields: { name: { kind: "text" }, rating: { kind: "text" }, url: { kind: "link" } },
      where: [{ field: "rating", atLeast: 4 }, { field: "name", contains: ["Replacement"], not: true }, { field: "stock", is: "present" }],
      paginate: { mode: "next", maxPages: 3 },
      dedupe: { by: ["url"] }
    }
  }
});

let order = 0;
const at = (nodeId: string, definitionId: string, route: string, extra: Partial<Attempt> = {}): Attempt => {
  order += 1;
  return { attemptId: `${CALL}:a${order}`, nodeId, definitionId, order, status: "succeeded", route, startedAt: order, parentAttemptId: CALL, ...extra };
};

/** A left-out row of the rating bound, written `name | rating`, as the read sends it: its label and the tested cell. */
function ratedRow(row: string): { name: string; rating: string } {
  const [name, rating] = row.split(" | ");
  return { name: name!, rating: rating! };
}

/** One pass's read of one page, as the run record holds it. */
const pass = (left: { rating: string[]; name: string[]; stock: string[] }): Attempt => at(READ, "unit.list", "success", { metadata: { extraction: {
  recordCount: 2, pagesRead: 1, truncated: false, itemsSeen: 2 + left.rating.length + left.name.length + left.stock.length,
  conditions: {
    applied: 5, kept: 2, unfiltered: false,
    rejected: [left.rating.length, left.name.length, left.stock.length], alone: [left.rating.length, left.name.length, left.stock.length],
    seen: [null, null, "In stock"],
    aloneRows: [
      left.rating.map(ratedRow),
      left.name.map((name) => ({ name })),
      left.stock.map((name) => ({ name }))
    ]
  }
} } });

/** The part's frame as a run walks it: a loop over two pages, every attempt under the Call Subflow attempt. */
function calledLoop(): Attempt[] {
  order = 0;
  return [
    at("node.part.loop", "builtin.control.merge", "success"), at("node.part.repeat", "builtin.control.repeat", "body"),
    pass({ rating: ["Copper Trowel | 3.5 out of 5"], name: ["Replacement Handle for Garden Tools, Ash Wood"], stock: ["Brass Hose Nozzle"] }),
    at("node.part.next", "unit.next", "success"),
    at("node.part.loop", "builtin.control.merge", "success"), at("node.part.repeat", "builtin.control.repeat", "body"),
    pass({ rating: ["Steel Rake | 2.9 out of 5"], name: [], stock: [] }),
    at("node.part.next", "unit.next", "ended")
  ];
}

const parts: AutomationStudioFlowNode[] = [
  { id: "node.part.repeat", definitionId: "builtin.control.repeat", parameterValues: { most: 3 } },
  partRead()
];
/** The root a subflow trial runs the part through: its Call Subflow attempt is the container, not a step, and callers leave it out. */
const root: AutomationStudioFlowNode[] = [{ id: "node.trial.start", definitionId: "builtin.control.start" }, { id: "node.trial.call", definitionId: "builtin.control.call-subflow" }];

describe("a called part's read", () => {
  it("carries the wording, the tested value, testedLabel and the dedupe a read of the root frame carries", () => {
    const attempts = calledLoop();
    // The Flow nodes a trial passes hold the called graph's nodes beside the root's (`service/candidate-trial/frame-evidence.ts`).
    const [called] = automationStudioResultReadAccounts({ actionAttempts: attempts, flowNodes: [...root, ...parts], deniedEvidenceKeys: [] }).reads;
    const [whole] = automationStudioResultReadAccounts({ actionAttempts: calledLoop().map(({ parentAttemptId: _call, ...attempt }) => attempt), flowNodes: [...root, ...parts], deniedEvidenceKeys: [] }).reads;
    expect(called).toEqual(whole);
    expect(called).toMatchObject({ nodeId: READ, pagesRead: 2, pageLimit: 3, stop: "ended", paginates: true, dedupes: true, dedupeBy: ["url"], dropsEarlierPageRepeats: true, keptPerPage: [2, 2] });
    const [rating, name, stock] = called!.conditions!;
    expect(rating).toMatchObject({ number: 1, condition: "rating atLeast 4", leftOutOnlyByThis: ["Copper Trowel — rating: 3.5 out of 5", "Steel Rake — rating: 2.9 out of 5"] });
    expect(name).toMatchObject({ number: 2, condition: "name not contains [\"Replacement\"]", leftOutOnlyByThis: ["Replacement Handle for Garden Tools, Ash Wood"], testedLabel: true });
    expect(stock).toMatchObject({ number: 3, condition: "stock is present", leftOutOnlyByThis: ["Brass Hose Nozzle — stock: (no value)"] });
    expect(stock?.presence).toContain("\"In stock\"");
  });

  // t406's reason for the old guard still holds where it applies: a part's node may share an id with a step of the root frame.
  it("is told by its counts alone where the root frame ran a step of the same id", () => {
    const attempts = calledLoop();
    const rootRead: Attempt = { attemptId: "root.read", nodeId: READ, definitionId: "unit.list", order: 0, status: "succeeded", startedAt: 0, metadata: { extraction: { recordCount: 1, pagesRead: 1, truncated: false } } };
    const reads = automationStudioResultReadAccounts({ actionAttempts: [rootRead, ...attempts], flowNodes: [...root, ...parts], deniedEvidenceKeys: [] }).reads;
    const called = reads.find((read) => read.keptPerPage !== undefined);
    expect(called?.conditions?.every((condition) => condition.condition === undefined)).toBe(true);
    expect(called).not.toHaveProperty("dedupes");
  });

  it("is told by its counts alone where the node is of another definition, or authored with another number of conditions", () => {
    const other: AutomationStudioFlowNode = { ...partRead(), definitionId: "unit.other-list" };
    const fewer: AutomationStudioFlowNode = { ...partRead(), parameterValues: { list: { ...(partRead().parameterValues!.list as object), where: [{ field: "rating", atLeast: 4 }] } } };
    for (const node of [other, fewer]) {
      const [called] = automationStudioResultReadAccounts({ actionAttempts: calledLoop(), flowNodes: [...root, parts[0]!, node], deniedEvidenceKeys: [] }).reads;
      expect(called?.conditions?.map((condition) => condition.condition), node.definitionId).toEqual([undefined, undefined, undefined]);
      expect(called?.conditions?.[0]?.leftOutOnlyByThis).toEqual(["Copper Trowel", "Steel Rake"]);
    }
  });
});
