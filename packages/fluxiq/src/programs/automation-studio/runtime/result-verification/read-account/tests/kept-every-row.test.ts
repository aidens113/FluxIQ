// A read that kept every item it saw after an act was repeated over a narrower
// read of the same list carries Core's flag (t692). A8 cost round 2
// `run-mvbr0w7e-6a01c05b`: a Flow acted on the 4 of 8 rows a condition kept,
// then read the same list with no condition and stored all 8 as the answer, and
// both trial judges said yes. Shown here on another kind of site: a shop's
// returns desk approves the returns of at most 50, then reads the returns list
// with no condition. The selectors are invented and exist only to prove none of
// them leaves.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";

const LOCATORS = [".return-row", ".return-amount", ".return-order", ".return-status"];
const READ = "web.output.dom-extract_list";

function read(id: string, extra: JsonObject = {}, item: JsonValue = ".return-row"): AutomationStudioFlowNode {
  return { id, definitionId: READ, parameterValues: { extractList: { item, fields: { order: { kind: "text", selector: ".return-order" }, amount: { kind: "text", selector: ".return-amount" } }, minItems: 0, ...extra }, timeoutMs: 30000 } };
}

const narrower = read("s3", { where: [{ read: { kind: "text", selector: ".return-amount" }, atMost: 50 }] });
const each: AutomationStudioFlowNode = { id: "s4", definitionId: "builtin.control.for-each" };
const approve: AutomationStudioFlowNode = { id: "s5", definitionId: "custom.press", label: "approve the return", metadata: { declaredConsequences: ["modify_existing"] } };
const settle: AutomationStudioFlowNode = { id: "s6", definitionId: "custom.wait", label: "wait for the row to settle" };
const later = (node: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode => ({ ...read("s7", { fields: { order: { kind: "text", selector: ".return-order" }, status: { kind: "text", selector: ".return-status" } } }), ...node });

const edges = (itemsPort: string | null = "items"): AutomationStudioFlowEdge[] => [
  { id: "e1", sourceNodeId: "s3", targetNodeId: "s4", sourcePortId: "records", ...(itemsPort ? { targetPortId: itemsPort } : {}) },
  { id: "e2", sourceNodeId: "s4", targetNodeId: "s5", sourcePortId: "body" },
  { id: "e3", sourceNodeId: "s5", targetNodeId: "s6" },
  { id: "e4", sourceNodeId: "s6", targetNodeId: "s4" },
  { id: "e5", sourceNodeId: "s4", targetNodeId: "s7", sourcePortId: "done" }
];

let order = 0;
function attempt(nodeId: string, definitionId: string, extra: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord {
  order += 1;
  return { attemptId: `a${order}`, nodeId, definitionId, order, status: "succeeded", startedAt: order, ...extra };
}
const extraction = (seen: number, kept: number, rejected?: number[]) => ({ metadata: { extraction: { recordCount: kept, pagesRead: 1, truncated: false, itemsSeen: seen, ...(rejected ? { conditions: { applied: seen, kept, rejected } } : {}) } } });

/** Three passes of the loop, each approving its row, then the end of the loop. */
function passes(act: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord[] {
  return [1, 2, 3].flatMap(() => [attempt("s4", each.definitionId, { route: "body" }), attempt("s5", approve.definitionId, act), attempt("s6", settle.definitionId)])
    .concat(attempt("s4", each.definitionId, { route: "done" }));
}

function run(options: { laterSeen?: number; laterKept?: number; laterRejected?: number[]; narrowerRejected?: number[]; narrowerKept?: number; act?: Partial<AutomationStudioFlowRunActionAttemptRecord>; laterFirst?: boolean } = {}): AutomationStudioFlowRunActionAttemptRecord[] {
  const first = attempt("s3", READ, extraction(7, options.narrowerKept ?? 3, options.narrowerRejected ?? [4]));
  const loop = passes(options.act);
  const last = attempt("s7", READ, extraction(options.laterSeen ?? 7, options.laterKept ?? 7, options.laterRejected));
  return options.laterFirst ? [first, last, ...loop] : [first, ...loop, last];
}

function accounts(flowNodes: AutomationStudioFlowNode[], actionAttempts: AutomationStudioFlowRunActionAttemptRecord[], flowEdges: AutomationStudioFlowEdge[] | null = edges()) {
  return automationStudioResultReadAccounts({ actionAttempts, flowNodes, deniedEvidenceKeys: [], ...(flowEdges ? { flowEdges } : {}) }).reads;
}

const flagOf = (reads: ReturnType<typeof accounts>, nodeId: string) => reads.find((entry) => entry.nodeId === nodeId)?.keptEveryRow;

describe("a read that kept every item it saw after an act over a narrower read of the same list", () => {
  it("is flagged with the narrower read, its counts, the steps that acted, and Core's sentence asking for each stored row to be checked", () => {
    const reads = accounts([narrower, each, approve, settle, later()], run());
    expect(flagOf(reads, "s7")).toEqual({
      narrowerRead: "s3", narrowerSeen: 7, narrowerKept: 3, actedBy: ["s5"], sameList: "items_edge_and_read_target", said: expect.any(String)
    });
    const said = flagOf(reads, "s7")!.said;
    expect(said).toContain("Step s7 read the same list as step s3");
    expect(said).toContain("Step s3's conditions kept 3 of the 7 items it saw; step s7 has no condition and kept every one of the 7 items it saw.");
    expect(said).toContain("Check each row step s7 stored, one by one, against the request's own words for what the answer holds");
    // The narrower read itself is not flagged.
    expect(flagOf(reads, "s3")).toBeUndefined();
  });

  it("says the flag in the read's full sentence, and never a locator either read was authored with", () => {
    const reads = accounts([narrower, each, approve, settle, later()], run());
    const full = automationStudioResultReadSentence(reads.find((entry) => entry.nodeId === "s7")!, "full");
    expect(full).toContain(flagOf(reads, "s7")!.said);
    const sent = JSON.stringify(reads) + full;
    for (const locator of LOCATORS) expect(sent).not.toContain(locator);
  });

  it("is not decided where the caller gives no edges, which say what list a loop walks", () => {
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run(), null), "s7")).toBeUndefined();
  });

  it("is not raised for a later read with a condition, or one that kept fewer than it saw", () => {
    const conditioned = later({ parameterValues: { extractList: { item: ".return-row", where: [{ read: { kind: "text", selector: ".return-status" }, contains: ["approved"] }] } } });
    expect(flagOf(accounts([narrower, each, approve, settle, conditioned], run({ laterKept: 3, laterRejected: [4] })), "s7")).toBeUndefined();
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run({ laterKept: 6 })), "s7")).toBeUndefined();
  });

  it("is not raised where the two reads have different targets, or the loop's rows do not come from the earlier read's items edge", () => {
    const elsewhere = later({ parameterValues: { extractList: { item: ".archived-row", fields: {}, minItems: 0 } } });
    expect(flagOf(accounts([narrower, each, approve, settle, elsewhere], run()), "s7")).toBeUndefined();
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run(), edges(null)), "s7")).toBeUndefined();
  });

  it("is not raised where the earlier read's conditions rejected nothing", () => {
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run({ narrowerKept: 7, narrowerRejected: [0] })), "s7")).toBeUndefined();
  });

  it("is not raised where no lasting step of the loop succeeded, or the later read ran before it", () => {
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run({ act: { status: "failed" } })), "s7")).toBeUndefined();
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run({ act: { skipped: { reason: "target_absent", code: "host.target.not_found" } } })), "s7")).toBeUndefined();
    const passive = { ...approve, metadata: { declaredConsequences: [] } };
    expect(flagOf(accounts([narrower, each, passive, settle, later()], run()), "s7")).toBeUndefined();
    expect(flagOf(accounts([narrower, each, approve, settle, later()], run({ laterFirst: true })), "s7")).toBeUndefined();
  });

  it("compares the read target as values, whatever order its members were written in, and never by the reads' bounds or columns", () => {
    const first = read("s3", { where: [{ read: { kind: "text", selector: ".return-amount" }, atMost: 50 }] }, { kind: "list", selector: ".return-row" });
    const second = later({ parameterValues: { extractList: { item: { selector: ".return-row", kind: "list" }, fields: { status: { kind: "text", selector: ".return-status" } }, minItems: 1, maxItems: 40 } } });
    expect(flagOf(accounts([first, each, approve, settle, second], run()), "s7")).toMatchObject({ narrowerRead: "s3" });
  });
});
