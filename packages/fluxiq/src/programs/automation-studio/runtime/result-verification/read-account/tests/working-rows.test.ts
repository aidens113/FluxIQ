// A read whose kept rows a later step was repeated over, and whose list a later
// read of the same target read again, carries Core's flag (t752): its rows are
// working rows, never the answer. Shown on a recipe archive: a first read lists
// every recipe with no condition, a display-only press opens each recipe's card,
// then a second read of the same list keeps the quick recipes. The selectors are
// invented and exist only to prove none of them leaves.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadSentence } from "../sentence.ts";

const LOCATORS = [".recipe-row", ".recipe-minutes", ".recipe-title", ".recipe-card"];
const READ = "web.output.dom-extract_list";

function read(id: string, extra: JsonObject = {}, item = ".recipe-row"): AutomationStudioFlowNode {
  return { id, definitionId: READ, parameterValues: { extractList: { item, fields: { title: { kind: "text", selector: ".recipe-title" }, minutes: { kind: "text", selector: ".recipe-minutes" } }, minItems: 0, ...extra }, timeoutMs: 30000 } };
}

const every = read("s3");
const each: AutomationStudioFlowNode = { id: "s4", definitionId: "builtin.control.for-each" };
const open: AutomationStudioFlowNode = { id: "s5", definitionId: "custom.press", label: "open the recipe card", metadata: { declaredConsequences: [] } };
const quick = (item = ".recipe-row"): AutomationStudioFlowNode => read("s6", { where: [{ read: { kind: "text", selector: ".recipe-minutes" }, atMost: 20 }] }, item);

const edges = (itemsPort: string | null = "items"): AutomationStudioFlowEdge[] => [
  { id: "e1", sourceNodeId: "s3", targetNodeId: "s4", sourcePortId: "records", ...(itemsPort ? { targetPortId: itemsPort } : {}) },
  { id: "e2", sourceNodeId: "s4", targetNodeId: "s5", sourcePortId: "body" },
  { id: "e3", sourceNodeId: "s5", targetNodeId: "s4" },
  { id: "e4", sourceNodeId: "s4", targetNodeId: "s6", sourcePortId: "done" }
];

let order = 0;
function attempt(nodeId: string, definitionId: string, extra: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord {
  order += 1;
  return { attemptId: `a${order}`, nodeId, definitionId, order, status: "succeeded", startedAt: order, ...extra };
}
const extraction = (seen: number, kept: number, rejected?: number[]) => ({ metadata: { extraction: { recordCount: kept, pagesRead: 1, truncated: false, itemsSeen: seen, ...(rejected ? { conditions: { applied: seen, kept, rejected } } : {}) } } });

function run(options: { press?: Partial<AutomationStudioFlowRunActionAttemptRecord>; laterFirst?: boolean } = {}): AutomationStudioFlowRunActionAttemptRecord[] {
  const first = attempt("s3", READ, extraction(9, 9));
  const loop = [1, 2, 3].flatMap(() => [attempt("s4", each.definitionId, { route: "body" }), attempt("s5", open.definitionId, options.press)]).concat(attempt("s4", each.definitionId, { route: "done" }));
  const last = attempt("s6", READ, extraction(9, 3, [6]));
  return options.laterFirst ? [first, last, ...loop] : [first, ...loop, last];
}

function accounts(flowNodes: AutomationStudioFlowNode[], actionAttempts: AutomationStudioFlowRunActionAttemptRecord[], flowEdges: AutomationStudioFlowEdge[] | null = edges()) {
  return automationStudioResultReadAccounts({ actionAttempts, flowNodes, deniedEvidenceKeys: [], ...(flowEdges ? { flowEdges } : {}) }).reads;
}

const flagOf = (reads: ReturnType<typeof accounts>, nodeId: string) => reads.find((entry) => entry.nodeId === nodeId)?.workingRows;

describe("a read whose kept rows a step was repeated over, and whose list a later read read again", () => {
  it("is flagged with the later read, the repeated steps and Core's sentence: its rows are working rows, not the answer", () => {
    const reads = accounts([every, each, open, quick()], run());
    expect(flagOf(reads, "s3")).toEqual({ rereadBy: "s6", repeatedBy: ["s5"], sameList: "items_edge_and_read_target", said: expect.any(String) });
    const said = flagOf(reads, "s3")!.said;
    expect(said).toContain("step s6 then read the same list again");
    expect(said).toContain("working rows");
    expect(said).toContain("the answer is what step s6 stored");
    // The later read is the answer, never flagged.
    expect(flagOf(reads, "s6")).toBeUndefined();
  });

  it("says the flag in the read's full sentence, and never a locator either read was authored with", () => {
    const reads = accounts([every, each, open, quick()], run());
    const full = automationStudioResultReadSentence(reads.find((entry) => entry.nodeId === "s3")!, "full");
    expect(full).toContain(flagOf(reads, "s3")!.said);
    const sent = JSON.stringify(reads) + full;
    for (const locator of LOCATORS) expect(sent).not.toContain(locator);
  });

  it("is not decided where the caller gives no edges, or the loop's rows do not come from this read's items edge", () => {
    expect(flagOf(accounts([every, each, open, quick()], run(), null), "s3")).toBeUndefined();
    expect(flagOf(accounts([every, each, open, quick()], run(), edges(null)), "s3")).toBeUndefined();
  });

  it("is not raised where the later read reads another target, ran before the repeat, or no repeated step succeeded", () => {
    expect(flagOf(accounts([every, each, open, quick(".archived-row")], run()), "s3")).toBeUndefined();
    expect(flagOf(accounts([every, each, open, quick()], run({ laterFirst: true })), "s3")).toBeUndefined();
    expect(flagOf(accounts([every, each, open, quick()], run({ press: { status: "failed" } })), "s3")).toBeUndefined();
    expect(flagOf(accounts([every, each, open, quick()], run({ press: { skipped: { reason: "target_absent", code: "host.target.not_found" } } })), "s3")).toBeUndefined();
  });
});
