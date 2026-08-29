import { describe, expect, it } from "vitest";
import {
  buildAutomationEntityIndexes,
  createAutomationEntityIndexesSelector
} from "./entity-indexes";

function fixture(size: number) {
  const flowEntries = Array.from({ length: size }, (_, index) => ({
    source: "canonical",
    flow: { flowId: `flow.${index}`, name: `Flow ${index}` }
  }));
  const artifactFlows = Array.from({ length: size }, (_, index) => ({
    flowId: `graph.${index}`,
    ownerKind: "task",
    ownerId: `task.${index}`
  }));
  const tasks = Array.from({ length: size }, (_, index) => ({
    taskId: `task.${index}`,
    graphId: `graph.${index}`,
    metadata: { policyId: `policy.${index}` }
  }));
  const recordings = Array.from({ length: size }, (_, index) => ({
    recordingId: `recording.${index}`,
    timeline: [{ id: `entry.${index}`, type: "action" }]
  }));
  const timelines = recordings.map((recording, index) => ({
    recordingId: recording.recordingId,
    normalizedTimelineId: `timeline.${index}`,
    timeline: [{ id: `normalized-entry.${index}`, type: "action" }]
  }));
  const proposals = Array.from({ length: size }, (_, index) => ({
    proposalId: `proposal.${index}`,
    recordingId: `recording.${index}`,
    generatedAt: index
  }));
  const policies = Array.from({ length: size }, (_, index) => ({
    policyId: `policy.${index}`,
    taskId: `task.${index}`
  }));
  const signals = Array.from({ length: size }, (_, index) => ({ path: `signal.${index}` }));
  const hierarchyNodes = Array.from({ length: size }, (_, index) => ({
    id: `hierarchy.${index}`,
    kind: "subflow",
    flowId: `flow.${index}`,
    sourceId: `subflow.${index}`
  }));
  return { flowEntries, artifactFlows, tasks, recordings, timelines, proposals, policies, signals, hierarchyNodes };
}

describe("Automation Studio entity indexes", () => {
  it("indexes a project with thousands of entities for constant-time selection resolution", () => {
    const sources = fixture(5_000);
    const indexes = buildAutomationEntityIndexes(sources);

    expect(indexes.flowEntryById).toHaveLength(5_000);
    expect(indexes.taskById).toHaveLength(5_000);
    expect(indexes.recordingById).toHaveLength(5_000);
    expect(indexes.timelineEntryById).toHaveLength(10_000);
    expect(indexes.proposalById).toHaveLength(5_000);
    expect(indexes.flowById.get("flow.4999")?.name).toBe("Flow 4999");
    expect(indexes.taskFlowByTaskId.get("task.4999")?.flowId).toBe("graph.4999");
    expect(indexes.timelineEntryById.get("normalized-entry.4999")?.recordingId).toBe("recording.4999");
    expect(indexes.latestProposalByRecordingId.get("recording.4999")?.proposalId).toBe("proposal.4999");
    expect(indexes.subflowHierarchyNodeByScope.get("flow.4999::subflow.4999")?.id).toBe("hierarchy.4999");
  });

  it("returns the exact same index and map references for unchanged entity sources", () => {
    const sources = fixture(8);
    const selectIndexes = createAutomationEntityIndexesSelector();
    const first = selectIndexes(sources);
    const second = selectIndexes({ ...sources });

    expect(second).toBe(first);
    expect(second.flowById).toBe(first.flowById);
    expect(second.timelineEntryById).toBe(first.timelineEntryById);
    expect(second.hierarchyNodeById).toBe(first.hierarchyNodeById);
  });

  it("selects the latest proposal without mutating proposal source order", () => {
    const sources = fixture(1);
    sources.proposals.push(
      { proposalId: "proposal.old", recordingId: "recording.0", generatedAt: 1 },
      { proposalId: "proposal.latest", recordingId: "recording.0", generatedAt: 20 }
    );
    const indexes = buildAutomationEntityIndexes(sources);

    expect(sources.proposals.map((proposal) => proposal.proposalId)).toEqual([
      "proposal.0",
      "proposal.old",
      "proposal.latest"
    ]);
    expect(indexes.latestProposalByRecordingId.get("recording.0")?.proposalId).toBe("proposal.latest");
  });

  it("indexes hierarchy roots, folders, and subflow containers for root event handlers", () => {
    const sources = fixture(0);
    sources.hierarchyNodes.push(
      { id: "folder.general", kind: "folder", category: "flow" } as any,
      { id: "subflows.root", kind: "folder", category: "flow", flowId: "flow.main", metadata: { subflowRoot: true } } as any,
      { id: "subflows.category", kind: "folder", category: "flow", flowId: "flow.main", metadata: { subflowCategory: true } } as any
    );
    const indexes = buildAutomationEntityIndexes(sources);

    expect(indexes.subflowRootByFlowId.get("flow.main")?.id).toBe("subflows.root");
    expect(indexes.folderHierarchyNodesByCategory.get("flow")?.map((node) => node.id)).toEqual([
      "folder.general",
      "subflows.root",
      "subflows.category"
    ]);
    expect(indexes.subflowContainerNodesByFlowId.get("flow.main")?.map((node) => node.id)).toEqual([
      "subflows.root",
      "subflows.category"
    ]);
  });});