// The Flow outline inputs: each accepts the request its handler reads, with a plain refusal otherwise.
import { describe, expect, it } from "vitest";
import { editFlowStepsInput, getFlowOutlineInput, undoFlowEditInput } from "../index.ts";

describe("Flow outline inputs", () => {
  it("reading the steps needs a project and a Flow", () => {
    expect(getFlowOutlineInput.parse({ projectId: "p", flowId: "f" })).toEqual({ projectId: "p", flowId: "f" });
    expect(getFlowOutlineInput.read({ projectId: "p" })).toEqual({ ok: false, error: expect.stringContaining("flowId") });
  });

  it("a step edit names steps by number and a version", () => {
    const parsed = editFlowStepsInput.parse({ projectId: "p", flowId: "f", baseRevision: 3, edit: { kind: "set-words", step: "2", words: "Open the page" } });
    expect(parsed.edit).toEqual({ kind: "set-words", step: "2", words: "Open the page" });
    expect(editFlowStepsInput.parse({ projectId: "p", flowId: "f", baseRevision: 3, via: "assistant", edit: { kind: "move", step: "4", direction: "up" } }).via).toBe("assistant");
    expect(editFlowStepsInput.read({ projectId: "p", flowId: "f", baseRevision: 3, edit: { kind: "move", step: "4", direction: "sideways" } }).ok).toBe(false);
    expect(editFlowStepsInput.read({ projectId: "p", flowId: "f", edit: { kind: "delete", step: "1" } }).ok).toBe(false);
  });

  it("undo needs the undo edits a change returned", () => {
    expect(undoFlowEditInput.parse({ projectId: "p", flowId: "f", baseRevision: 4, inverseOperations: [{ op: "set_node_label", nodeId: "n", label: "Old" }] }).baseRevision).toBe(4);
    expect(undoFlowEditInput.read({ projectId: "p", flowId: "f", baseRevision: 4, inverseOperations: [] }).ok).toBe(false);
  });
});
