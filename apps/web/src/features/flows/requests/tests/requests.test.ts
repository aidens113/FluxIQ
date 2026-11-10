import { describe, expect, it } from "vitest";
import { freshId, restorePayload, runPayload, stepEditPayload, undoPayload } from "..";

const flow = { projectId: "p1", flowId: "f1" };

describe("what the editor sends", () => {
  it("edit-flow-steps carries the version the list showed", () => {
    expect(stepEditPayload({ ...flow, revision: 14 }, { kind: "set-words", step: "2", words: "Search for a lamp" }))
      .toEqual({ projectId: "p1", flowId: "f1", baseRevision: 14, edit: { kind: "set-words", step: "2", words: "Search for a lamp" } });
  });

  it("undo-flow-edit carries the undo edits against the version the change was saved as", () => {
    const inverseOperations = [{ op: "set_node_label", nodeId: "n2", label: "Search" }];
    expect(undoPayload(flow, { revision: 15, inverseOperations }))
      .toEqual({ projectId: "p1", flowId: "f1", baseRevision: 15, inverseOperations, message: "Undid the change saved as version 15" });
  });

  it("restore-graph-snapshot names the restore point and a fresh mutation", () => {
    expect(restorePayload(flow, { revisionNumber: 3, snapshotSha256: "abc" }, "m-1"))
      .toEqual({ projectId: "p1", flowId: "f1", snapshotSha256: "abc", mutationId: "m-1", message: "Restored version 3" });
  });

  it("freshId makes the version 4 UUID Core accepts for a named run, fresh each time", () => {
    const ids = Array.from({ length: 50 }, freshId);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("run-runtime-session names the run before it starts and leaves empty inputs out", () => {
    expect(runPayload(flow, {}, "run-1")).toEqual({ projectId: "p1", flowId: "f1", newRunId: "run-1" });
    expect(runPayload(flow, { query: "lamp" }, "run-2")).toEqual({ projectId: "p1", flowId: "f1", newRunId: "run-2", inputs: { query: "lamp" } });
  });
});
