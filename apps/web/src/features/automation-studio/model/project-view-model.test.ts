import { describe, expect, it } from "vitest";
import type { AutomationSelection } from "../shared/selection-contracts";
import { createAutomationProjectViewModelSelector, type AutomationProjectViewModelInput } from "./project-view-model";

function input(selection: AutomationSelection | null = null): AutomationProjectViewModelInput {
  const projectFlows = [
    {
      source: "canonical",
      flow: {
        flowId: "flow.primary",
        name: "Primary",
        nodes: [],
        edges: [],
        metadata: { summaryOnly: false, hierarchySubflows: [] }
      }
    },
    {
      source: "canonical",
      flow: {
        flowId: "flow.secondary",
        name: "Secondary",
        nodes: [],
        edges: [],
        metadata: { summaryOnly: false, hierarchySubflows: [] }
      }
    }
  ];
  return {
    hasActiveProject: true,
    canonical: {
      signalRegistries: [{ registryId: "registry.main", definitions: [{ path: "checkout.total" }] }],
      learnedTaskModels: [],
      policyGraphs: []
    },
    pipelineArtifacts: {
      learnedTaskModels: [],
      policyProposals: [
        { proposalId: "proposal.old", recordingId: "recording.main", generatedAt: 1, policy: { nodes: [] } },
        { proposalId: "proposal.latest", recordingId: "recording.main", generatedAt: 2, policy: { nodes: [] } }
      ],
      recordingFlowProposals: []
    },
    snapshotProblems: [],
    projectRecordings: [{
      recordingId: "recording.main",
      name: "Checkout",
      notes: [{ id: "note.1" }],
      timeline: [{ id: "entry.raw", type: "action" }]
    }],
    projectTimelines: [{
      normalizedTimelineId: "timeline.main",
      recordingId: "recording.main",
      timeline: [{ id: "entry.normalized", type: "action" }]
    }],
    projectFlows,
    projectArtifacts: { tasks: [], flows: [] },
    indexedStateSources: { primary: { sourceId: "state.primary" } },
    nativeNodeDefinitions: [{ id: "node.native" }],
    publishedFlowDefinitions: [{ id: "node.published" }],
    customHierarchyNodes: [],
    deletedHierarchyIds: [],
    selection,
    lastOpenFlowId: null,
    lastOpenTaskId: null
  };
}

describe("Automation Studio project view model", () => {
  it("keeps the complete model stable across workspace-only rerenders", () => {
    const selectModel = createAutomationProjectViewModelSelector();
    const source = input();
    const first = selectModel(source);
    const second = selectModel({ ...source });

    expect(second).toBe(first);
    expect(second.indexes).toBe(first.indexes);
    expect(second.hierarchyNodes).toBe(first.hierarchyNodes);
    expect(second.recordings).toBe(first.recordings);
    expect(second.projectFlowUrlScopeSignature).toBe(first.projectFlowUrlScopeSignature);
  });

  it("changes selection without rebuilding project-wide indexes or derived arrays", () => {
    const selectModel = createAutomationProjectViewModelSelector();
    const source = input();
    const first = selectModel(source);
    const second = selectModel({ ...source, selection: { kind: "flow", id: "flow.secondary" } });

    expect(second).not.toBe(first);
    expect(second.selectedFlow?.flowId).toBe("flow.secondary");
    expect(second.indexes).toBe(first.indexes);
    expect(second.indexes.flowById).toBe(first.indexes.flowById);
    expect(second.hierarchyNodes).toBe(first.hierarchyNodes);
    expect(second.signals).toBe(first.signals);
    expect(second.availableNodeDefinitions).toBe(first.availableNodeDefinitions);
  });

  it("updates problems without rebuilding entity indexes or hierarchy", () => {
    const selectModel = createAutomationProjectViewModelSelector();
    const source = input();
    const first = selectModel(source);
    const problems = [{ id: "problem.new", severity: "error" }];
    const second = selectModel({ ...source, snapshotProblems: problems });

    expect(second.snapshotProblems).toBe(problems);
    expect(second.indexes).toBe(first.indexes);
    expect(second.hierarchyNodes).toBe(first.hierarchyNodes);
    expect(second.recordings).toBe(first.recordings);
  });

  it("resolves recording, timeline, proposal, signal, titles, and breadcrumbs through indexes", () => {
    const selectModel = createAutomationProjectViewModelSelector();
    const source = input({ kind: "timeline", id: "entry.normalized" });
    const model = selectModel(source);
    const timelineView = {
      id: "timeline-recording",
      label: "Timeline",
      type: "recordings" as const,
      icon: (() => null) as any
    };

    expect(model.selectedRecording?.recordingId).toBe("recording.main");
    expect(model.selectedTimeline?.normalizedTimelineId).toBe("timeline.main");
    expect(model.selectedProposal?.proposalId).toBe("proposal.latest");
    expect(model.selectedEntry?.id).toBe("entry.normalized");
    expect(model.viewLabelForSelection(timelineView)).toBe("Timeline: Checkout");
    expect(model.workspaceBreadcrumbsForView("policy-primary", "Nodes").at(-1)?.label).toBe("Nodes");

    const signalModel = selectModel({ ...source, selection: { kind: "signal", id: "checkout.total" } });
    expect(signalModel.selectedSignal?.registryId).toBe("registry.main");
  });
});