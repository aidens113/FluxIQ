import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_PROJECT_OPEN_DETAIL_ENDPOINT_DENYLIST,
  automationStudioProjectOpenRequests,
  automationStudioRuntimeSummaryRequests,
  replaceAutomationStudioBrowserUrl
} from "./model/live-helpers";
import {
  automationStudioFlowNeedsDetail,
  automationStudioGatewayActivitySnapshot,
  flowSummariesToCatalogEntries
} from "./model/project-summary-converters";
import {
  flowDocumentWithoutFlowObjectReferences,
  flowDocumentWithoutSubflowCategory,
  mergeCreatedFlowIntoProjectFlows,
  reconcileCustomHierarchyNodesFromChangeFeed,
  reconcilePipelineArtifactsFromChangeFeed,
  reconcileProjectFlowsFromChangeFeed,
  reconcileRecordingsFromChangeFeed,
  reconcileRuntimeSessionsFromChangeFeed,
  removeDeletedFlowsFromProjectFlows,
  removeFlowObjectReferencesFromProjectFlows,
  removeSubflowSummaryFromProjectFlows,
  upsertSubflowSummaryIntoProjectFlows
} from "./model/project-change-reconciliation";
import {
  latestProposalForRecordingId,
  resolveActionPreviewEntryId,
  resolveObservedStateEntryId,
  selectedNodeActionPreviewEntryId
} from "./model/timeline-resolution";
import { persistentAutomationWorkspacePrefs } from "./model/workspace-persistence";
import { flowHierarchyNodes } from "./hierarchy/model";
import {
  applyCustomFolderCreate,
  applyCustomFolderDelete,
  applyFlowCreate,
  applyFlowDelete,
  applyFlowObjectReferenceDelete,
  applySubflowReferenceDelete,
  applySubflowReferenceUpsert
} from "./model/local-mutations";
import { defaultAutomationWorkspacePrefs } from "./workspace/layout";

describe("AutomationStudioLive public behavior", () => {
  it("preserves complete per-view state and active tabs in project workspace prefs", () => {
    const prefs = defaultAutomationWorkspacePrefs();
    const persisted = persistentAutomationWorkspacePrefs({
      ...prefs,
      mainLayoutPreset: "two-even",
      mainSplitRatios: [0.5, 0.5],
      activePaneId: "pane-main-2",
      activeViewId: "runtime-debug",
      panes: [
        { id: "pane-main-1", activeViewId: "policy-primary", tabs: ["policy-primary", "flow-settings"] },
        { id: "pane-main-2", activeViewId: "runtime-debug", tabs: ["runtime-debug", "state-explorer"] }
      ],
      rightSidebar: { activeViewId: "problems-view", tabs: ["global-inspector", "problems-view"], collapsed: false },
      viewStates: {
        "runtime-debug": { selection: { kind: "flow", id: "flow.checkout" }, page: 2 },
        "state-explorer": { selection: { kind: "state", id: "state.node" }, expanded: true }
      }
    });

    expect(persisted.activePaneId).toBe("pane-main-2");
    expect(persisted.activeViewId).toBe("runtime-debug");
    expect(persisted.panes[0]?.activeViewId).toBe("flow-nodes");
    expect(persisted.panes[1]?.activeViewId).toBe("runtime-debug");
    expect(persisted.rightSidebar.activeViewId).toBe("problems-view");
    expect(persisted.viewStates["runtime-debug"]).toEqual({ selection: { kind: "flow", id: "flow.checkout" }, page: 2 });
    expect(persisted.viewStates["state-explorer"]).toEqual({ selection: { kind: "state", id: "state.node" }, expanded: true });
  });

  it("updates browser history for Studio URL sync without routing", () => {
    const originalWindow = globalThis.window;
    const replaceStateCalls: string[] = [];
    const fakeWindow = {
      location: { pathname: "/programs/automation-studio", search: "?projectId=old", hash: "#anchor" },
      history: { state: { keep: true }, replaceState: (_state: unknown, _title: string, url?: string | URL | null) => { replaceStateCalls.push(String(url)); } }
    } as any;
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    try {
      replaceAutomationStudioBrowserUrl("/programs/automation-studio", new URLSearchParams("projectId=new&view=runtime-debug"));
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }

    expect(replaceStateCalls).toEqual(["/programs/automation-studio?projectId=new&view=runtime-debug#anchor"]);
  });

  it("updates local Flow entries for create and delete without waiting for project refresh", () => {
    const current = flowSummariesToCatalogEntries([{ flowId: "flow.old", projectId: "project.fast", name: "Old", updatedAt: 100 }]);
    const createdFlow = {
      flowId: "flow.new",
      projectId: "project.fast",
      name: "New",
      scope: { kind: "global" },
      visibility: "private",
      origin: "manual",
      source: { mode: "visual" },
      interface: { inputs: [], outputs: [] },
      errors: [],
      variables: [],
      nodes: [],
      edges: [],
      publication: { status: "draft" },
      createdAt: 200,
      updatedAt: 200
    };

    const withCreated = mergeCreatedFlowIntoProjectFlows(current, createdFlow);
    expect(withCreated.map((entry) => entry.flow.flowId)).toEqual(["flow.old", "flow.new"]);
    expect(withCreated.find((entry) => entry.flow.flowId === "flow.new")?.flow.metadata?.summaryOnly).toBeUndefined();

    const afterDelete = removeDeletedFlowsFromProjectFlows(withCreated, ["flow.old"]);
    expect(afterDelete.map((entry) => entry.flow.flowId)).toEqual(["flow.new"]);
  });

  it("applies create/delete Flow and child object mutations locally with rollback state", () => {
    const current = [
      { source: "canonical", flow: { flowId: "flow.checkout", projectId: "project.fast", name: "Checkout", expansion: { recordingIds: ["recording.old"], instructionIds: ["instruction.keep", "instruction.delete"], adaptationIds: ["adaptation.delete"], subflowIds: [] } } },
      { source: "canonical", flow: { flowId: "flow.checkout.child", projectId: "project.fast", name: "Checkout child", metadata: { parentFlowId: "flow.checkout" } } }
    ];

    const created = applyFlowCreate(current, { flowId: "flow.new", projectId: "project.fast", name: "New Flow" });
    expect(created.next.map((entry) => entry.flow.flowId)).toEqual(["flow.new", "flow.checkout", "flow.checkout.child"]);
    expect(created.restore()).toBe(current);

    const withSubflow = applySubflowReferenceUpsert(created.next, "flow.checkout", { subflowId: "subflow.refund", name: "Refund" });
    expect(withSubflow.next.find((entry) => entry.flow.flowId === "flow.checkout")?.flow.expansion.subflowIds).toEqual([{ subflowId: "subflow.refund", name: "Refund" }]);

    const withoutRefs = applyFlowObjectReferenceDelete(withSubflow.next, "flow.checkout", "instruction", "instruction.delete");
    const withoutSubflow = applySubflowReferenceDelete(withoutRefs.next, "flow.checkout", "subflow.refund");
    const checkout = withoutSubflow.next.find((entry) => entry.flow.flowId === "flow.checkout")?.flow;
    expect(checkout.expansion.instructionIds).toEqual(["instruction.keep"]);
    expect(checkout.expansion.subflowIds).toEqual([]);

    const deletedParent = applyFlowDelete(withoutSubflow.next, "flow.checkout");
    expect(deletedParent.next.map((entry) => entry.flow.flowId)).toEqual(["flow.new"]);
    expect(deletedParent.restore()).toBe(withoutSubflow.next);
  });

  it("applies folder and object collection deletes locally without project refresh", () => {
    const nodes = [
      { id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" },
      { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root", sourceId: "folder.child" },
      { id: "recording.one", label: "Recording", kind: "recording", category: "flow", parentId: "folder.child", sourceId: "recording.one" },
      { id: "folder.keep", label: "Keep", kind: "folder", category: "flow", parentId: null, sourceId: "folder.keep" }
    ] as any[];

    const created = applyCustomFolderCreate(nodes, { id: "folder.new", label: "New", kind: "folder", category: "flow", parentId: null, sourceId: "folder.new" } as any);
    expect(created.next.map((node) => node.id)).toContain("folder.new");
    expect(created.restore()).toBe(nodes);

    const deleted = applyCustomFolderDelete(created.next, "folder.root");
    expect(deleted.next.map((node) => node.id).sort()).toEqual(["folder.keep", "folder.new"]);
  });

  it("removes Flow object references locally without a project refresh", () => {
    const current = [
      { source: "canonical", flow: { flowId: "flow.checkout", expansion: { recordingIds: ["recording.delete", "recording.keep"], instructionIds: ["instruction.delete", "instruction.keep"], adaptationIds: ["adaptation.delete"] } } },
      { source: "canonical", flow: { flowId: "flow.support", expansion: { recordingIds: ["recording.delete"], instructionIds: ["instruction.other"], adaptationIds: ["adaptation.other"] } } }
    ];

    const withoutOneInstruction = removeFlowObjectReferencesFromProjectFlows(current, "flow.checkout", "instruction", "instruction.delete");
    expect(withoutOneInstruction.find((entry) => entry.flow.flowId === "flow.checkout")?.flow.expansion.instructionIds).toEqual(["instruction.keep"]);
    expect(withoutOneInstruction.find((entry) => entry.flow.flowId === "flow.support")?.flow.expansion.instructionIds).toEqual(["instruction.other"]);

    const withoutRecordingEverywhere = removeFlowObjectReferencesFromProjectFlows(withoutOneInstruction, null, "recording", "recording.delete");
    expect(withoutRecordingEverywhere.map((entry) => entry.flow.expansion.recordingIds)).toEqual([["recording.keep"], []]);
  });

  it("builds saved Flow documents for object and subflow category removal", () => {
    const flow = {
      flowId: "flow.checkout",
      expansion: {
        instructionIds: ["instruction.delete", "instruction.keep"],
        subflowIds: [{ subflowId: "subflow.pay", metadata: { subflowCategoryId: "category.delete" } }]
      },
      metadata: {
        subflowCategories: [
          { id: "category.delete", name: "Delete", parentId: null },
          { id: "category.child", name: "Child", parentId: "category.delete" }
        ]
      }
    };

    const withoutInstruction = flowDocumentWithoutFlowObjectReferences(flow, "instruction", "instruction.delete");
    expect(withoutInstruction.expansion.instructionIds).toEqual(["instruction.keep"]);

    const withoutCategory = flowDocumentWithoutSubflowCategory(flow, "category.delete");
    expect(withoutCategory.metadata.subflowCategories).toEqual([]);
    expect(withoutCategory.expansion.subflowIds).toEqual([{ subflowId: "subflow.pay" }]);
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

  it("uses compact summary metadata as the subflow tree source without parent Flow expansion", () => {
    const entries = flowSummariesToCatalogEntries([{
      flowId: "flow.checkout",
      projectId: "project.fast",
      name: "Checkout",
      updatedAt: 100,
      hierarchySubflows: [{ subflowId: "subflow.refund", name: "Refund", graphFlowId: "flow.refund.graph", parentCategoryId: "category.billing" }],
      subflowCategories: [{ id: "category.billing", name: "Billing" }]
    }]);
    const nodes = flowHierarchyNodes(entries);
    const subflow = nodes.find((node) => node.kind === "subflow" && node.sourceId === "subflow.refund");

    expect(entries[0]!.flow.expansion).toBeUndefined();
    expect(subflow).toMatchObject({ label: "Refund", metadata: { graphFlowId: "flow.refund.graph" } });
    expect(subflow?.parentId).toBe(nodes.find((node) => node.sourceId === "category.billing")?.id);
  });

  it("updates local canonical subflow summaries for create and delete", () => {
    const current = flowSummariesToCatalogEntries([{ flowId: "flow.checkout", projectId: "project.fast", name: "Checkout", updatedAt: 100 }]);
    const withSubflow = upsertSubflowSummaryIntoProjectFlows(current, "flow.checkout", {
      subflowId: "subflow.refund",
      name: "Refund",
      graphFlowId: "flow.refund.graph",
      metadata: { subflowCategoryId: "category.billing" }
    });
    expect(withSubflow[0]!.flow.metadata.hierarchySubflows).toEqual([{ subflowId: "subflow.refund", name: "Refund", graphFlowId: "flow.refund.graph", parentCategoryId: "category.billing", metadata: { subflowCategoryId: "category.billing" } }]);

    const withoutSubflow = removeSubflowSummaryFromProjectFlows(withSubflow, "flow.checkout", ["subflow.refund"]);
    expect(withoutSubflow[0]!.flow.metadata.hierarchySubflows).toEqual([]);
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
      endpoint: "get-project-workspace-summary",
      payload: { projectId: "project.fast" },
      intent: "summary"
    });
    expect(endpoints).not.toContain("list-runtime-sessions");
    expect(endpoints).not.toContain("list-recordings");
    expect(endpoints).not.toContain("list-recording-domains");
  });

  it("reconciles feed delete events against local sidebar/list state without a project refresh", () => {
    const flowEntries = flowSummariesToCatalogEntries([{
      flowId: "flow.checkout",
      projectId: "project.fast",
      name: "Checkout",
      hierarchySubflows: [{ subflowId: "subflow.refund", name: "Refund", parentCategoryId: "category.billing" }]
    }, {
      flowId: "flow.support",
      projectId: "project.fast",
      name: "Support"
    }]);

    const withoutSubflow = reconcileProjectFlowsFromChangeFeed(flowEntries, feedEvent("subflow", "subflow.refund", { parentId: "flow.checkout" }));
    expect(withoutSubflow.reconciled).toBe(true);
    expect(withoutSubflow.next[0]!.flow.metadata.hierarchySubflows).toEqual([]);

    const withoutFlow = reconcileProjectFlowsFromChangeFeed(withoutSubflow.next, feedEvent("flow", "flow.support"));
    expect(withoutFlow.next.map((entry) => entry.flow.flowId)).toEqual(["flow.checkout"]);

    const hierarchy = [
      { id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" },
      { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root", sourceId: "folder.child" }
    ] as any[];
    expect(reconcileCustomHierarchyNodesFromChangeFeed(hierarchy, feedEvent("folder", "folder.root")).next).toEqual([]);

    const recordings = [{ recordingId: "recording.delete" }, { recordingId: "recording.keep" }];
    expect(reconcileRecordingsFromChangeFeed(recordings, feedEvent("recording", "recording.delete")).next).toEqual([{ recordingId: "recording.keep" }]);

    const runs = [{ runId: "run.delete" }, { runId: "run.keep" }];
    expect(reconcileRuntimeSessionsFromChangeFeed(runs, feedEvent("runtime_run", "run.delete")).next).toEqual([{ runId: "run.keep" }]);

    const artifacts = { policyProposals: [{ proposalId: "adaptation.delete" }, { proposalId: "adaptation.keep" }], recordingFlowProposals: [], replayResults: [] };
    expect(reconcilePipelineArtifactsFromChangeFeed(artifacts, feedEvent("adaptation", "adaptation.delete")).next.policyProposals).toEqual([{ proposalId: "adaptation.keep" }]);
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

function feedEvent(entityKind: string, entityId: string, override: Record<string, any> = {}) {
  return {
    projectId: "project.fast",
    sequence: 1,
    transactionId: "tx.feed",
    entityKind,
    entityId,
    operation: "delete" as const,
    revision: 2,
    changedAt: 200,
    ...override
  };
}
