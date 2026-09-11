import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { emptyFlowSummaryIndex, type AutomationStudioFlowSummaryIndex } from "../../../storage/index.ts";
import { emptyPipelineIndex, type PipelineIndex } from "../../pipeline-model.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { FlowAdaptationIndex, FlowAdaptationPolicyIndex, FlowChangeProposalIndex, FlowInstructionIndex, FlowRouterIndex, FlowRunIndex, FlowSubflowIndex, RecordingIndex, RuntimeIndex } from "./types.ts";

// Every JSON index a project keeps beside its documents. Each call resolves the
// project first, exactly as the monolithic service did, so an unknown project
// still throws before the store is touched.
export class AutomationStudioServiceIndexes {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly projects: AutomationStudioProjectStore
  ) {}

  async readFlowIndex(projectId: string): Promise<AutomationStudioFlowSummaryIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<AutomationStudioFlowSummaryIndex>(this.paths.projectFile(projectId, "indexes", "flows.json"), emptyFlowSummaryIndex).read();
  }

  async writeFlowIndex(projectId: string, mutator: (index: AutomationStudioFlowSummaryIndex) => AutomationStudioFlowSummaryIndex): Promise<AutomationStudioFlowSummaryIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<AutomationStudioFlowSummaryIndex>(this.paths.projectFile(projectId, "indexes", "flows.json"), emptyFlowSummaryIndex).update(mutator);
  }

  async readRecordingIndex(projectId: string): Promise<RecordingIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.paths.projectFile(projectId, "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).read();
  }

  async writeRecordingIndex(projectId: string, mutator: (index: RecordingIndex) => RecordingIndex): Promise<RecordingIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.paths.projectFile(projectId, "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).update(mutator);
  }

  async readFlowRouterIndex(projectId: string): Promise<FlowRouterIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowRouterIndex>(this.paths.flowRouterIndexFile(projectId), emptyFlowRouterIndex).read();
  }

  async writeFlowRouterIndex(projectId: string, mutator: (index: FlowRouterIndex) => FlowRouterIndex): Promise<FlowRouterIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowRouterIndex>(this.paths.flowRouterIndexFile(projectId), emptyFlowRouterIndex).update((index) => sortFlowRouterIndex(mutator(index)));
  }

  async readFlowSubflowIndex(projectId: string): Promise<FlowSubflowIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowSubflowIndex>(this.paths.flowSubflowIndexFile(projectId), emptyFlowSubflowIndex).read();
  }

  async writeFlowSubflowIndex(projectId: string, mutator: (index: FlowSubflowIndex) => FlowSubflowIndex): Promise<FlowSubflowIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowSubflowIndex>(this.paths.flowSubflowIndexFile(projectId), emptyFlowSubflowIndex).update((index) => sortFlowSubflowIndex(mutator(index)));
  }

  async readFlowInstructionIndex(projectId: string): Promise<FlowInstructionIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowInstructionIndex>(this.paths.flowInstructionIndexFile(projectId), emptyFlowInstructionIndex).read();
  }

  async writeFlowInstructionIndex(projectId: string, mutator: (index: FlowInstructionIndex) => FlowInstructionIndex): Promise<FlowInstructionIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowInstructionIndex>(this.paths.flowInstructionIndexFile(projectId), emptyFlowInstructionIndex).update((index) => sortFlowInstructionIndex(mutator(index)));
  }

  async readFlowChangeProposalIndex(projectId: string): Promise<FlowChangeProposalIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowChangeProposalIndex>(this.paths.flowChangeProposalIndexFile(projectId), emptyFlowChangeProposalIndex).read();
  }

  async writeFlowChangeProposalIndex(projectId: string, mutator: (index: FlowChangeProposalIndex) => FlowChangeProposalIndex): Promise<FlowChangeProposalIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowChangeProposalIndex>(this.paths.flowChangeProposalIndexFile(projectId), emptyFlowChangeProposalIndex).update((index) => sortFlowChangeProposalIndex(mutator(index)));
  }

  async readFlowRunIndex(projectId: string): Promise<FlowRunIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowRunIndex>(this.paths.flowRunIndexFile(projectId), emptyFlowRunIndex).read();
  }

  async writeFlowRunIndex(projectId: string, mutator: (index: FlowRunIndex) => FlowRunIndex): Promise<FlowRunIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowRunIndex>(this.paths.flowRunIndexFile(projectId), emptyFlowRunIndex).update((index) => sortFlowRunIndex(mutator(index)));
  }

  async readFlowAdaptationIndex(projectId: string): Promise<FlowAdaptationIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowAdaptationIndex>(this.paths.flowAdaptationIndexFile(projectId), emptyFlowAdaptationIndex).read();
  }

  async writeFlowAdaptationIndex(projectId: string, mutator: (index: FlowAdaptationIndex) => FlowAdaptationIndex): Promise<FlowAdaptationIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowAdaptationIndex>(this.paths.flowAdaptationIndexFile(projectId), emptyFlowAdaptationIndex).update((index) => sortFlowAdaptationIndex(mutator(index)));
  }

  async readFlowAdaptationPolicyIndex(projectId: string): Promise<FlowAdaptationPolicyIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowAdaptationPolicyIndex>(this.paths.flowAdaptationPolicyIndexFile(projectId), emptyFlowAdaptationPolicyIndex).read();
  }

  async writeFlowAdaptationPolicyIndex(projectId: string, mutator: (index: FlowAdaptationPolicyIndex) => FlowAdaptationPolicyIndex): Promise<FlowAdaptationPolicyIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<FlowAdaptationPolicyIndex>(this.paths.flowAdaptationPolicyIndexFile(projectId), emptyFlowAdaptationPolicyIndex).update((index) => sortFlowAdaptationPolicyIndex(mutator(index)));
  }

  async readRuntimeIndex(projectId: string): Promise<RuntimeIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<RuntimeIndex>(this.paths.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).read();
  }

  async readPipelineIndex(projectId: string): Promise<PipelineIndex> {
    await this.projects.findProject(projectId);
    return await new ProgramJsonStore<PipelineIndex>(this.paths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).read();
  }
}

function emptyFlowRouterIndex(): FlowRouterIndex {
  return { schemaVersion: "0.1", routers: [] };
}

export function emptyFlowSubflowIndex(): FlowSubflowIndex {
  return { schemaVersion: "0.1", summaryVersion: 2, subflows: [] };
}

function emptyFlowInstructionIndex(): FlowInstructionIndex {
  return { schemaVersion: "0.1", summaryVersion: 2, instructions: [] };
}

function emptyFlowChangeProposalIndex(): FlowChangeProposalIndex {
  return { schemaVersion: "0.1", changeProposals: [] };
}

export function emptyFlowRunIndex(): FlowRunIndex {
  return { schemaVersion: "0.1", runs: [] };
}

export function emptyFlowAdaptationIndex(): FlowAdaptationIndex {
  return { schemaVersion: "0.1", adaptations: [] };
}

function emptyFlowAdaptationPolicyIndex(): FlowAdaptationPolicyIndex {
  return { schemaVersion: "0.1", policies: [] };
}

function sortFlowRouterIndex(index: FlowRouterIndex): FlowRouterIndex {
  return { schemaVersion: "0.1", routers: [...(index.routers ?? [])].sort(compareSummaryByUpdatedAtThenId("routerId")) };
}

function sortFlowSubflowIndex(index: FlowSubflowIndex): FlowSubflowIndex {
  return {
    schemaVersion: "0.1",
    ...(index.summaryVersion === 2 ? { summaryVersion: 2 as const } : {}),
    subflows: [...(index.subflows ?? [])].sort(compareSummaryByUpdatedAtThenId("subflowId"))
  };
}

function sortFlowInstructionIndex(index: FlowInstructionIndex): FlowInstructionIndex {
  return {
    schemaVersion: "0.1",
    ...(index.summaryVersion === 2 ? { summaryVersion: 2 as const } : {}),
    instructions: [...(index.instructions ?? [])].sort(compareSummaryByUpdatedAtThenId("instructionId"))
  };
}

function sortFlowChangeProposalIndex(index: FlowChangeProposalIndex): FlowChangeProposalIndex {
  return { schemaVersion: "0.1", changeProposals: [...(index.changeProposals ?? [])].sort(compareSummaryByUpdatedAtThenId("proposalId")) };
}

function sortFlowRunIndex(index: FlowRunIndex): FlowRunIndex {
  return { schemaVersion: "0.1", runs: [...(index.runs ?? [])].sort(compareSummaryByUpdatedAtThenId("runId")) };
}

function sortFlowAdaptationIndex(index: FlowAdaptationIndex): FlowAdaptationIndex {
  return { schemaVersion: "0.1", adaptations: [...(index.adaptations ?? [])].sort(compareSummaryByUpdatedAtThenId("adaptationId")) };
}

function sortFlowAdaptationPolicyIndex(index: FlowAdaptationPolicyIndex): FlowAdaptationPolicyIndex {
  return { schemaVersion: "0.1", policies: [...(index.policies ?? [])].sort(compareSummaryByUpdatedAtThenId("policyId")) };
}

function compareSummaryByUpdatedAtThenId<TItem extends { updatedAt: number }>(idKey: keyof TItem): (left: TItem, right: TItem) => number {
  return (left, right) => (right.updatedAt - left.updatedAt) || String(left[idKey]).localeCompare(String(right[idKey]));
}
