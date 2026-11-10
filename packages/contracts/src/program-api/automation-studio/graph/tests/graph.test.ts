// The graph inputs: each accepts the request its handler reads, and refuses a wrong one with a plain reason.
import { describe, expect, it } from "vitest";
import { applyGraphPatchInput, createGraphSnapshotInput, listGraphRevisionsInput, restoreGraphSnapshotInput } from "../index.ts";

describe("apply-graph-patch input", () => {
  const base = { projectId: "p-1", flowId: "f-1", baseRevision: 3, mutationId: "m-1" };

  it("accepts a step label edit", () => {
    const parsed = applyGraphPatchInput.parse({ ...base, operations: [{ op: "set_node_label", nodeId: "n-1", label: "Open the page" }] });
    expect(parsed.operations).toEqual([{ op: "set_node_label", nodeId: "n-1", label: "Open the page" }]);
  });

  it("refuses an empty label and an unknown edit", () => {
    expect(applyGraphPatchInput.read({ ...base, operations: [{ op: "set_node_label", nodeId: "n-1", label: "  " }] }).ok).toBe(false);
    expect(applyGraphPatchInput.read({ ...base, operations: [{ op: "explode", nodeId: "n-1" }] }).ok).toBe(false);
  });

  it("refuses a base revision below 1", () => {
    expect(applyGraphPatchInput.read({ ...base, baseRevision: 0, operations: [{ op: "delete_node", nodeId: "n" }] })).toEqual({ ok: false, error: expect.stringContaining("baseRevision") });
  });
});

describe("version history inputs", () => {
  it("list-graph-revisions needs a project and a Flow", () => {
    expect(listGraphRevisionsInput.parse({ projectId: "p", flowId: "f", limit: 10 })).toEqual({ projectId: "p", flowId: "f", limit: 10 });
    expect(listGraphRevisionsInput.read({ projectId: "p" }).ok).toBe(false);
  });

  it("create-graph-snapshot takes only the project and Flow", () => {
    expect(createGraphSnapshotInput.parse({ projectId: "p", flowId: "f" })).toEqual({ projectId: "p", flowId: "f" });
  });

  it("restore-graph-snapshot needs the restore point and a mutation id", () => {
    expect(restoreGraphSnapshotInput.parse({ projectId: "p", flowId: "f", snapshotSha256: "abc", mutationId: "m" }).snapshotSha256).toBe("abc");
    expect(restoreGraphSnapshotInput.read({ projectId: "p", flowId: "f", mutationId: "m" })).toEqual({ ok: false, error: expect.stringContaining("snapshotSha256") });
  });
});
