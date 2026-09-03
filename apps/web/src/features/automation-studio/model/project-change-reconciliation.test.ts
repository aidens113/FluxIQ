import { describe, expect, it } from "vitest";
import { flowSummariesToCatalogEntries } from "./project-summary-converters";
import {
  mergeFlowDetails,
  mergeRecordingDetail,
  mergeRecordingSummaries,
  reconcileProjectFlowsFromChangeFeed,
  reconcileRecordingsFromChangeFeed,
  removeDeletedFlowsFromProjectFlows,
  removeSubflowSummaryFromProjectFlows,
  upsertSubflowSummaryIntoProjectFlows
} from "./project-change-reconciliation";

function deleteEvent(entityKind: string, entityId: string, parentId?: string) {
  return {
    sequence: 1,
    projectId: "project.one",
    entityKind,
    entityId,
    operation: "delete",
    occurredAt: 1,
    ...(parentId ? { parentId } : {})
  } as any;
}

describe("project change reconciliation", () => {
  it("preserves loaded recording details when fresh summaries arrive", () => {
    const loaded = { recordingId: "recording.one", timeline: [{ id: "entry.one" }], metadata: { summaryOnly: false, name: "Loaded" } };
    const [merged] = mergeRecordingSummaries([loaded], [{ recordingId: "recording.one", metadata: { summaryOnly: true, eventCount: 1 } }]);
    expect(merged.timeline).toEqual([{ id: "entry.one" }]);
    expect(merged.metadata).toEqual({ summaryOnly: false, eventCount: 1, name: "Loaded" });
    expect(mergeRecordingDetail([loaded], loaded)).toEqual([loaded]);
  });

  it("keeps Flow collection identity for a no-op merge", () => {
    const current = flowSummariesToCatalogEntries([{ flowId: "flow.one", projectId: "project.one", updatedAt: 1 }]);
    expect(mergeFlowDetails(current, current)).toBe(current);
    expect(removeDeletedFlowsFromProjectFlows(current, [])).toBe(current);
  });

  it("does not replace loaded or newer graph data with empty summaries or stale details", () => {
    const current = [{ source: "canonical", readOnly: false, flow: {
      flowId: "flow.one", updatedAt: 20, graphRevision: 3,
      nodes: [{ id: "current" }], edges: [], metadata: {}
    } }];
    const summary = flowSummariesToCatalogEntries([{ flowId: "flow.one", projectId: "project.one", updatedAt: 30 }]);
    const stale = [{ source: "canonical", readOnly: false, flow: {
      flowId: "flow.one", updatedAt: 10, graphRevision: 2,
      nodes: [{ id: "stale" }], edges: [], metadata: {}
    } }];

    expect(mergeFlowDetails(current, summary)).toBe(current);
    expect(mergeFlowDetails(current, stale)).toBe(current);
  });

  it("upserts and removes compact subflow summaries locally", () => {
    const current = flowSummariesToCatalogEntries([{ flowId: "flow.parent", projectId: "project.one", updatedAt: 1 }]);
    const withSubflow = upsertSubflowSummaryIntoProjectFlows(current, "flow.parent", {
      subflowId: "subflow.child",
      name: "Child",
      parentCategoryId: "category.one"
    });
    expect(withSubflow[0].flow.metadata.hierarchySubflows).toHaveLength(1);
    expect(removeSubflowSummaryFromProjectFlows(withSubflow, "flow.parent", ["subflow.child"])[0].flow.metadata.hierarchySubflows).toEqual([]);
  });

  it("applies feed deletes only when enough local information exists", () => {
    const flows = flowSummariesToCatalogEntries([{ flowId: "flow.one", projectId: "project.one", updatedAt: 1 }]);
    expect(reconcileProjectFlowsFromChangeFeed(flows, deleteEvent("flow", "flow.one"))).toEqual({ next: [], reconciled: true });
    expect(reconcileRecordingsFromChangeFeed([{ recordingId: "recording.one" }], deleteEvent("recording", "recording.one"))).toEqual({ next: [], reconciled: true });
    expect(reconcileProjectFlowsFromChangeFeed(flows, { ...deleteEvent("flow", "flow.one"), operation: "update" })).toMatchObject({ next: flows, reconciled: false });
  });
});
