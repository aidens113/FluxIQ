import { describe, expect, it } from "vitest";
import { applyAutomationGraphOperationBatch, createAutomationGraphOperationHistory, diffAutomationGraphDocuments } from "./operation-history";

describe("AutomationGraphOperationHistory", () => {
  it("stores graph edits as operation batches instead of full graph snapshots", () => {
    const before = { nodes: [{ id: "a", position: { x: 0, y: 0 }, data: { label: "A" } }], edges: [] } as any;
    const after = { nodes: [{ id: "a", position: { x: 20, y: 0 }, data: { label: "A" } }, { id: "b", position: { x: 80, y: 0 }, data: { label: "B" } }], edges: [{ id: "a.b", source: "a", target: "b" }] } as any;
    const batch = diffAutomationGraphDocuments(before, after, { batchId: "move-add", baseRevision: "7", now: 10 });

    expect(batch.operations.map((operation) => operation.kind)).toEqual(["node.update", "node.add", "edge.add"]);
    expect(applyAutomationGraphOperationBatch(before, batch, "forward")).toEqual(after);
    expect(applyAutomationGraphOperationBatch(after, batch, "reverse")).toEqual(before);
  });

  it("ignores ReactFlow presentation fields when diffing durable graph operations", () => {
    const before = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, selected: false, measured: { width: 200, height: 120 }, data: { label: "A", selected: "domain-value", width: 42 } }],
      edges: [{ id: "a.b", source: "a", target: "b", selected: false, data: { selected: "edge-value" } }]
    } as any;
    const after = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, selected: true, dragging: true, measured: { width: 300, height: 160 }, data: { label: "A", selected: "domain-value", width: 42 } }],
      edges: [{ id: "a.b", source: "a", target: "b", selected: true, data: { selected: "edge-value" } }]
    } as any;

    expect(diffAutomationGraphDocuments(before, after).operations).toEqual([]);

    const edited = { nodes: [{ ...after.nodes[0], data: { ...after.nodes[0].data, label: "B" } }], edges: after.edges } as any;
    const batch = diffAutomationGraphDocuments(after, edited, { batchId: "data-edit" });
    expect(batch.operations).toHaveLength(1);
    expect(batch.operations[0]).toMatchObject({ kind: "node.update", entityId: "a" });
    expect((batch.operations[0] as any).after.selected).toBeUndefined();
    expect((batch.operations[0] as any).after.measured).toBeUndefined();
    expect((batch.operations[0] as any).after.data.selected).toBe("domain-value");
    expect((batch.operations[0] as any).after.data.width).toBe(42);
  });

  it("does not create history entries for selection-only graph changes", () => {
    const before = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, selected: false, data: { label: "A" } }],
      edges: [{ id: "a.b", source: "a", target: "b", selected: false }]
    } as any;
    const after = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, selected: true, dragging: false, positionAbsolute: { x: 0, y: 0 }, data: { label: "A" } }],
      edges: [{ id: "a.b", source: "a", target: "b", selected: true }]
    } as any;
    const history = createAutomationGraphOperationHistory<any>();
    const selectionBatch = diffAutomationGraphDocuments(before, after, { batchId: "select-only", now: 1 });

    expect(selectionBatch.operations).toEqual([]);
    history.push(selectionBatch);
    expect(history.state()).toMatchObject({ undoDepth: 0, redoDepth: 0, estimatedBytes: 0 });
  });

  it("enforces byte budgets while preserving recent undo/redo", () => {
    const history = createAutomationGraphOperationHistory<any>({ maxBytes: 900 });
    let document = { nodes: [{ id: "a", position: { x: 0, y: 0 }, data: { label: "A" } }], edges: [] } as any;
    for (let index = 0; index < 20; index += 1) {
      const next = { nodes: [{ id: "a", position: { x: index * 10, y: 0 }, data: { label: "A" + index } }], edges: [] } as any;
      history.push(diffAutomationGraphDocuments(document, next, { batchId: "batch." + index, now: index }));
      document = next;
    }

    expect(history.state().estimatedBytes).toBeLessThanOrEqual(history.state().maxBytes + 900);
    const undone = history.undo(document);
    expect(undone.nodes[0]?.data.label).not.toBe(document.nodes[0]?.data.label);
    expect(history.state().redoDepth).toBe(1);
  });
});
