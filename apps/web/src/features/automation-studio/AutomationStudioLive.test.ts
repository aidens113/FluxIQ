import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_PROJECT_OPEN_DETAIL_ENDPOINT_DENYLIST,
  automationStudioProjectOpenRequests,
  automationStudioRuntimeSummaryRequests,
  automationStudioGatewayActivitySnapshot,
  automationStudioFlowNeedsDetail,
  flowSummariesToCatalogEntries,
  latestProposalForRecordingId,
  resolveActionPreviewEntryId,
  resolveObservedStateEntryId,
  selectedNodeActionPreviewEntryId
} from "./AutomationStudioLive";
import { flowHierarchyNodes } from "./hierarchy/model";

describe("AutomationStudioLive state opening", () => {
  it("does not bootstrap through the unbounded legacy snapshot endpoint", () => {
    const source = readFileSync(new URL("./AutomationStudioLive.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('api.get("snapshot"');
    expect(source).not.toContain('runLatest("studio-snapshot"');
  });
  it("resolves action timeline entries to the exact action-adjacent state snapshot", () => {
    const recording = {
      timeline: [{
        id: "entry.state.first",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 100,
        payload: { metadata: { eventTimestampMs: 100 } }
      }, {
        id: "entry.action.target",
        type: "action",
        actionType: "web.dom.click",
        startedAt: 500,
        timestamp: 540
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500,
        payload: { metadata: { eventTimestampMs: 500 } }
      }, {
        id: "entry.state.later",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 900,
        payload: { metadata: { eventTimestampMs: 900 } }
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.action.target")).toBe("entry.state.target");
  });

  it("resolves state timeline entries to themselves", () => {
    const recording = {
      timeline: [{
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.state.target")).toBe("entry.state.target");
  });

  it("resolves state snapshot entries to the corresponding action preview entry", () => {
    const recording = {
      timeline: [{
        id: "entry.action.target",
        type: "action",
        startedAt: 500,
        timestamp: 500
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 510,
        payload: { metadata: { eventTimestampMs: 510 } }
      }]
    };

    expect(resolveActionPreviewEntryId(recording, "entry.state.target")).toBe("entry.action.target");
  });

  it("keeps action entries as action preview entries", () => {
    const recording = {
      timeline: [{ id: "entry.action.target", type: "domain_event", timestamp: 500 }]
    };

    expect(resolveActionPreviewEntryId(recording, "entry.action.target")).toBe("entry.action.target");
  });

  it("resolves selected proposal and flow nodes to the matching action preview entry", () => {
    const recording = {
      timeline: [{
        id: "entry.action.target",
        type: "action",
        timestamp: 500
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 510,
        payload: { snapshotId: "snapshot.target", metadata: { actionEntryId: "entry.action.target" } }
      }]
    };

    expect(selectedNodeActionPreviewEntryId(recording, { id: "node.proposal", metadata: { timelineEntryId: "entry.state.target" } })).toBe("entry.action.target");
    expect(selectedNodeActionPreviewEntryId(recording, { id: "node.flow", metadata: { stateSnapshotId: "snapshot.target" } })).toBe("entry.action.target");
  });

  it("keeps proposal context recoverable from a source recording after timeline or state selection", () => {
    const proposal = latestProposalForRecordingId("recording.web", [{
      proposalId: "proposal.old",
      generatedAt: 100,
      metadata: { recordingId: "recording.web" }
    }, {
      proposalId: "proposal.current",
      generatedAt: 200,
      metadata: { recordingId: "recording.web" }
    }], [{
      proposalId: "proposal.other",
      recordingId: "recording.other",
      generatedAt: 300
    }]);

    expect(proposal?.proposalId).toBe("proposal.current");
  });

  it("rebuilds subflow rows and nested folders from refreshed Flow summaries", () => {
    const entries = flowSummariesToCatalogEntries([{
      flowId: "flow.checkout",
      projectId: "project.fast",
      name: "Checkout",
      updatedAt: 100,
      hierarchySubflows: [{ subflowId: "subflow.refund", name: "Refund", parentCategoryId: "category.billing" }],
      subflowCategories: [{ id: "category.billing", name: "Billing" }]
    }]);
    const nodes = flowHierarchyNodes(entries);

    expect(nodes).toContainEqual(expect.objectContaining({ kind: "folder", label: "Billing", sourceId: "category.billing" }));
    expect(nodes).toContainEqual(expect.objectContaining({ kind: "subflow", label: "Refund", sourceId: "subflow.refund" }));
    const category = nodes.find((node) => node.sourceId === "category.billing");
    const subflow = nodes.find((node) => node.sourceId === "subflow.refund");
    expect(subflow?.parentId).toBe(category?.id);
  });
  it("rebuilds recursive Subflow scopes from refreshed compact summaries", () => {
    const entries = flowSummariesToCatalogEntries([
      { flowId: "flow.checkout", projectId: "project.fast", name: "Checkout", updatedAt: 100, hierarchySubflows: [{ subflowId: "subflow.pay", name: "Pay" }] },
      { flowId: "flow.pay.graph", projectId: "project.fast", name: "Pay", updatedAt: 110, subflowGraph: true, parentFlowId: "flow.checkout", parentSubflowId: "subflow.pay", hierarchySubflows: [{ subflowId: "subflow.retry", name: "Retry", parentCategoryId: "category.recovery" }], subflowCategories: [{ id: "category.recovery", name: "Recovery" }] },
      { flowId: "flow.retry.graph", projectId: "project.fast", name: "Retry", updatedAt: 120, subflowGraph: true, parentFlowId: "flow.pay.graph", parentSubflowId: "subflow.retry" }
    ]);
    const nodes = flowHierarchyNodes(entries);
    const pay = nodes.find((node) => node.kind === "subflow" && node.sourceId === "subflow.pay");
    const retry = nodes.find((node) => node.kind === "subflow" && node.sourceId === "subflow.retry");

    expect(pay?.metadata).toMatchObject({ graphFlowId: "flow.pay.graph", defaultCollapsed: true });
    expect(retry?.metadata).toMatchObject({ graphFlowId: "flow.retry.graph", defaultCollapsed: true });
    const paySubflows = nodes.find((node) => node.label === "Subflows" && node.flowId === "flow.pay.graph");
    expect(nodes).toContainEqual(expect.objectContaining({ label: "Recovery", parentId: paySubflows?.id }));
    expect(nodes).toContainEqual(expect.objectContaining({ label: "Nodes", parentId: pay?.id, flowId: "flow.pay.graph" }));
    expect(nodes).toContainEqual(expect.objectContaining({ label: "Settings", parentId: retry?.id, flowId: "flow.retry.graph" }));
    expect(nodes.filter((node) => node.viewId === "flow-router")).toHaveLength(1);
    expect(nodes.filter((node) => node.kind === "flow")).toHaveLength(1);
    expect(automationStudioFlowNeedsDetail(entries[1]!.flow, "policy-primary", "flow")).toBe(true);
    expect(automationStudioFlowNeedsDetail({ ...entries[1]!.flow, metadata: { ...entries[1]!.flow.metadata, summaryOnly: false } }, "policy-primary", "flow")).toBe(false);
  });

  it("opens projects through summary requests without broad detail hydration", () => {
    const requests = [
      ...automationStudioProjectOpenRequests("project.fast"),
      ...automationStudioRuntimeSummaryRequests("project.fast")
    ];
    const endpoints = requests.map((request) => request.endpoint);

    for (const bannedEndpoint of AUTOMATION_STUDIO_PROJECT_OPEN_DETAIL_ENDPOINT_DENYLIST) {
      expect(endpoints).not.toContain(bannedEndpoint);
    }
    expect(requests).toContainEqual({
      endpoint: "list-runtime-sessions",
      payload: { projectId: "project.fast", summaries: true, limit: 25, offset: 0 }
    });
    expect(requests).toContainEqual({
      endpoint: "list-recordings",
      payload: { projectId: "project.fast", summaries: true }
    });
  });

  it("keeps only bounded gateway activity needed by the Studio owner", () => {
    const activity = automationStudioGatewayActivitySnapshot({
      sessions: [{ sessionId: "client.1", activeRecordingId: "recording.live", largePayload: "discarded" }],
      auditLog: [
        { id: "ignored", type: "client.connected", message: "Discard this" },
        ...Array.from({ length: 25 }, (_, index) => ({ id: "blocked." + index, type: "recording.project_required", message: "Blocked " + index }))
      ],
      pairings: Array.from({ length: 100 }, (_, index) => ({ id: index }))
    });

    expect(activity.sessions).toEqual([{ id: "client.1", activeRecordingId: "recording.live" }]);
    expect(activity.auditLog).toHaveLength(20);
    expect(activity.auditLog[0]?.id).toBe("blocked.5");
    expect(JSON.stringify(activity)).not.toContain("largePayload");
    expect(JSON.stringify(activity)).not.toContain("pairings");
  });
});
