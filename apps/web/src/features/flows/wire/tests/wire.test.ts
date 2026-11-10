import { describe, expect, it } from "vitest";
import { editAnswer, flowSummaries, outlineAnswer, parseOutline, restoreAnswer, revisionEntries, runSummaries } from "..";

const outline = {
  interface: { needs: [{ id: "query", name: "Query", type: "text", required: true }], gives: [] },
  steps: [
    { number: "1", nodeIds: ["open"], kind: "act", words: "Open the shop", lasting: [] },
    {
      number: "2", nodeIds: ["each"], kind: "loop", words: "For each of results:", lasting: [],
      children: [{ number: "2.1", nodeIds: ["keep"], kind: "data", words: "Keep rows where price is at most 20", lasting: [] }],
      arms: [{ words: "Otherwise:", steps: [{ number: "2.2", nodeIds: ["stop"], kind: "end", words: "Finish here", lasting: [] }] }]
    },
    { number: "3", nodeIds: ["call"], kind: "call", words: "Run Flow ▸ Sort", lasting: ["send_or_publish"], link: { kind: "flow", id: "flow-sort" } },
    { number: "4", nodeIds: ["bad"], words: "no kind" },
    { number: "5", nodeIds: ["odd"], kind: "call", words: "Run Flow ▸ Odd", lasting: [], link: { kind: "elsewhere", id: "x" } }
  ],
  issues: [{ code: "unstructured", words: "This part is clearer in the graph", step: "2", nodeIds: ["each"] }, { words: "" }]
};

describe("parseOutline", () => {
  it("reads nested steps, arms, links and issues, and drops what it cannot read", () => {
    const read = parseOutline(outline);
    expect(read?.steps.map((step) => step.number)).toEqual(["1", "2", "3", "5"]);
    expect(read?.steps[1]?.children[0]?.words).toBe("Keep rows where price is at most 20");
    expect(read?.steps[1]?.arms[0]?.steps[0]?.kind).toBe("end");
    expect(read?.steps[2]?.link).toEqual({ kind: "flow", id: "flow-sort" });
    expect(read?.steps[3]?.link).toBeUndefined();
    expect(read?.issues).toEqual([{ code: "unstructured", words: "This part is clearer in the graph", step: "2" }]);
    expect(read?.interface.needs[0]).toEqual({ id: "query", name: "Query", type: "text", required: true });
  });

  it("is undefined for an answer with no steps", () => {
    expect(parseOutline({ interface: {} })).toBeUndefined();
    expect(parseOutline(null)).toBeUndefined();
  });

  it("outlineAnswer needs a version number", () => {
    expect(outlineAnswer({ outline, revision: 14 })?.revision).toBe(14);
    expect(outlineAnswer({ outline })).toBeUndefined();
  });
});

describe("editAnswer", () => {
  it("reads a saved change with its undo", () => {
    const answer = editAnswer({ ok: true, payload: { ok: true, revision: 15, inverseOperations: [{ op: "set_node_label", nodeId: "open", label: "Open" }, { nope: 1 }], outline } });
    expect(answer.kind).toBe("saved");
    if (answer.kind === "saved") {
      expect(answer.revision).toBe(15);
      expect(answer.inverseOperations).toEqual([{ op: "set_node_label", nodeId: "open", label: "Open" }]);
    }
  });

  it("reads a refusal's reason", () => {
    expect(editAnswer({ ok: true, payload: { ok: false, reason: "Step 3 uses “result”, which step 2 gives, so it cannot go before it." } }))
      .toEqual({ kind: "refused", reason: "Step 3 uses “result”, which step 2 gives, so it cannot go before it." });
  });

  it("reads a conflict with who changed which steps", () => {
    const answer = editAnswer({ ok: true, payload: { ok: false, conflict: { status: "conflict", baseRevision: 2, currentRevision: 3, changedBy: [{ revisionNumber: 3, madeByLabel: "FluxIQ repair", message: "Repaired step 5", createdAt: 10 }], steps: ["5"] }, outline, revision: 3 } });
    expect(answer.kind).toBe("conflict");
    if (answer.kind === "conflict") {
      expect(answer.revision).toBe(3);
      expect(answer.conflict.steps).toEqual(["5"]);
      expect(answer.conflict.changedBy[0]?.madeByLabel).toBe("FluxIQ repair");
    }
  });

  it("says when FluxIQ could not be reached or refused the request", () => {
    expect(editAnswer({ ok: false, status: 0 })).toEqual({ kind: "refused", reason: "FluxIQ could not be reached, so nothing was saved. Try again." });
    expect(editAnswer({ ok: false, status: 403, error: "You may not change this Flow." })).toEqual({ kind: "refused", reason: "You may not change this Flow." });
  });

  it("never reads an answer it does not understand as saved", () => {
    expect(editAnswer({ ok: true, payload: { ok: true, revision: 4 } }).kind).toBe("refused");
    expect(editAnswer({ ok: true, payload: "?" }).kind).toBe("refused");
  });
});

describe("the other readers", () => {
  it("revisionEntries keeps who, why and the restore point", () => {
    expect(revisionEntries({ revisions: [{ revisionNumber: 2, madeByLabel: "A person", message: "Changed the words of step 2", createdAt: 5, snapshotSha256: null }, { nope: true }] }))
      .toEqual([{ revisionNumber: 2, madeByLabel: "A person", message: "Changed the words of step 2", createdAt: 5, snapshotSha256: null }]);
    expect(revisionEntries({})).toBeUndefined();
  });

  it("restoreAnswer reads applied, conflict and refused", () => {
    expect(restoreAnswer({ ok: true, payload: { result: { status: "applied", revisionNumber: 6 } } })).toEqual({ kind: "restored", revision: 6 });
    expect(restoreAnswer({ ok: true, payload: { result: { status: "conflict" } } })).toEqual({ kind: "conflict" });
    expect(restoreAnswer({ ok: false, status: 500, error: "No such restore point." })).toEqual({ kind: "refused", reason: "No such restore point." });
  });

  it("flowSummaries leaves a Subflow's own graph out", () => {
    expect(flowSummaries({ flows: [{ flowId: "a", name: "A", updatedAt: 1 }, { flowId: "b", name: "B", subflowGraph: true }] })?.map((flow) => flow.flowId)).toEqual(["a"]);
  });

  it("runSummaries keeps the cost only when there is one", () => {
    expect(runSummaries({ runs: [{ runId: "r1", flowId: "a", status: "succeeded", startedAt: 3, tokenUsage: { estimatedCostUsd: 0 } }, { runId: "r2", flowId: "a", updatedAt: 4 }, { flowId: "a" }] }))
      .toEqual([{ runId: "r1", flowId: "a", status: "succeeded", startedAt: 3, costUsd: 0 }, { runId: "r2", flowId: "a", status: "unknown", startedAt: 4 }]);
  });
});
