export type AutomationFlowEntry = { source?: string; flow?: any } & Record<string, unknown>;

export type AutomationEntityIndexSources = {
  flowEntries: AutomationFlowEntry[];
  artifactFlows: any[];
  tasks: any[];
  recordings: any[];
  timelines: any[];
  proposals: any[];
  policies: any[];
  signals: any[];
  hierarchyNodes: any[];
};

export type AutomationTimelineEntryLocation = {
  entry: any;
  recordingId: string | null;
  timeline: any;
};

export type AutomationEntityIndexes = {
  flowEntryById: ReadonlyMap<string, AutomationFlowEntry>;
  canonicalFlowEntryById: ReadonlyMap<string, AutomationFlowEntry>;
  flowById: ReadonlyMap<string, any>;
  artifactFlowById: ReadonlyMap<string, any>;
  taskById: ReadonlyMap<string, any>;
  taskByPolicyId: ReadonlyMap<string, any>;
  taskFlowByTaskId: ReadonlyMap<string, any>;
  recordingById: ReadonlyMap<string, any>;
  timelineByRecordingId: ReadonlyMap<string, any>;
  timelineEntryById: ReadonlyMap<string, AutomationTimelineEntryLocation>;
  proposalById: ReadonlyMap<string, any>;
  proposalsByRecordingId: ReadonlyMap<string, readonly any[]>;
  latestProposalByRecordingId: ReadonlyMap<string, any>;
  policyById: ReadonlyMap<string, any>;
  policyByTaskId: ReadonlyMap<string, any>;
  signalByPath: ReadonlyMap<string, any>;
  hierarchyNodeById: ReadonlyMap<string, any>;
  subflowHierarchyNodeByScope: ReadonlyMap<string, any>;
  subflowRootByFlowId: ReadonlyMap<string, any>;
  folderHierarchyNodesByCategory: ReadonlyMap<string, readonly any[]>;
  subflowContainerNodesByFlowId: ReadonlyMap<string, readonly any[]>;
};

function stringId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function proposalRecordingId(proposal: any): string | null {
  return stringId(proposal?.recordingId) ?? stringId(proposal?.metadata?.recordingId);
}

export function subflowHierarchyScopeKey(flowId: string, subflowId: string): string {
  return `${flowId}::${subflowId}`;
}

export function buildAutomationEntityIndexes(sources: AutomationEntityIndexSources): AutomationEntityIndexes {
  const flowEntryById = new Map<string, AutomationFlowEntry>();
  const canonicalFlowEntryById = new Map<string, AutomationFlowEntry>();
  const flowById = new Map<string, any>();
  for (const entry of sources.flowEntries) {
    const flow = entry?.flow ?? entry;
    const flowId = stringId(flow?.flowId);
    if (!flowId) continue;
    if (!flowEntryById.has(flowId)) flowEntryById.set(flowId, entry);
    if (!flowById.has(flowId)) flowById.set(flowId, flow);
    if (entry?.source === "canonical" && !canonicalFlowEntryById.has(flowId)) canonicalFlowEntryById.set(flowId, entry);
  }

  const artifactFlowById = new Map<string, any>();
  for (const flow of sources.artifactFlows) {
    const flowId = stringId(flow?.flowId);
    if (!flowId) continue;
    artifactFlowById.set(flowId, flow);
    if (!flowById.has(flowId)) flowById.set(flowId, flow);
  }

  const taskById = new Map<string, any>();
  const taskByPolicyId = new Map<string, any>();
  for (const task of sources.tasks) {
    const taskId = stringId(task?.taskId);
    const policyId = stringId(task?.metadata?.policyId);
    if (taskId) taskById.set(taskId, task);
    if (policyId && !taskByPolicyId.has(policyId)) taskByPolicyId.set(policyId, task);
  }

  const taskFlowByTaskId = new Map<string, any>();
  const unclaimedTaskIds = new Set<string>();
  for (const task of sources.tasks) {
    const taskId = stringId(task?.taskId);
    if (!taskId) continue;
    const graphId = stringId(task?.graphId) ?? stringId(task?.policyFlowId);
    const explicit = graphId ? artifactFlowById.get(graphId) : undefined;
    if (explicit) taskFlowByTaskId.set(taskId, explicit);
    else unclaimedTaskIds.add(taskId);
  }
  for (const flow of sources.artifactFlows) {
    const ownerId = flow?.ownerKind === "task" ? stringId(flow?.ownerId) : null;
    if (ownerId && unclaimedTaskIds.has(ownerId)) {
      taskFlowByTaskId.set(ownerId, flow);
      unclaimedTaskIds.delete(ownerId);
    }
  }

  const recordingById = new Map<string, any>();
  const timelineEntryById = new Map<string, AutomationTimelineEntryLocation>();
  for (const recording of sources.recordings) {
    const recordingId = stringId(recording?.recordingId);
    if (recordingId) recordingById.set(recordingId, recording);
    for (const entry of Array.isArray(recording?.timeline) ? recording.timeline : []) {
      const entryId = stringId(entry?.id);
      if (entryId && !timelineEntryById.has(entryId)) timelineEntryById.set(entryId, { entry, recordingId, timeline: recording });
    }
  }

  const timelineByRecordingId = new Map<string, any>();
  for (const timeline of sources.timelines) {
    const recordingId = stringId(timeline?.recordingId);
    if (recordingId && !timelineByRecordingId.has(recordingId)) timelineByRecordingId.set(recordingId, timeline);
    for (const entry of Array.isArray(timeline?.timeline) ? timeline.timeline : []) {
      const entryId = stringId(entry?.id);
      if (entryId) timelineEntryById.set(entryId, { entry, recordingId, timeline });
    }
  }

  const proposalById = new Map<string, any>();
  const proposalBuckets = new Map<string, any[]>();
  for (const proposal of sources.proposals) {
    const proposalId = stringId(proposal?.proposalId);
    if (proposalId && !proposalById.has(proposalId)) proposalById.set(proposalId, proposal);
    const recordingId = proposalRecordingId(proposal);
    if (!recordingId) continue;
    const bucket = proposalBuckets.get(recordingId);
    if (bucket) bucket.push(proposal);
    else proposalBuckets.set(recordingId, [proposal]);
  }
  const proposalsByRecordingId = new Map<string, readonly any[]>();
  const latestProposalByRecordingId = new Map<string, any>();
  for (const [recordingId, bucket] of proposalBuckets) {
    proposalsByRecordingId.set(recordingId, bucket);
    const latest = bucket.reduce((current, proposal) =>
      (proposal?.generatedAt ?? 0) > (current?.generatedAt ?? 0) ? proposal : current, bucket[0]);
    if (latest) latestProposalByRecordingId.set(recordingId, latest);
  }

  const policyById = new Map<string, any>();
  const policyByTaskId = new Map<string, any>();
  for (const policy of sources.policies) {
    const policyId = stringId(policy?.policyId);
    const taskId = stringId(policy?.taskId);
    if (policyId) policyById.set(policyId, policy);
    if (taskId && !policyByTaskId.has(taskId)) policyByTaskId.set(taskId, policy);
  }

  const signalByPath = new Map<string, any>();
  for (const signal of sources.signals) {
    const path = stringId(signal?.path);
    if (path) signalByPath.set(path, signal);
  }

  const hierarchyNodeById = new Map<string, any>();
  const subflowHierarchyNodeByScope = new Map<string, any>();
  const subflowRootByFlowId = new Map<string, any>();
  const folderHierarchyNodesByCategory = new Map<string, any[]>();
  const subflowContainerNodesByFlowId = new Map<string, any[]>();
  for (const node of sources.hierarchyNodes) {
    const nodeId = stringId(node?.id);
    if (nodeId) hierarchyNodeById.set(nodeId, node);
    const flowId = stringId(node?.flowId);
    const subflowId = node?.kind === "subflow" ? stringId(node?.sourceId) : null;
    if (flowId && subflowId) subflowHierarchyNodeByScope.set(subflowHierarchyScopeKey(flowId, subflowId), node);
    if (node?.kind === "folder" && typeof node?.category === "string") {
      const folders = folderHierarchyNodesByCategory.get(node.category);
      if (folders) folders.push(node); else folderHierarchyNodesByCategory.set(node.category, [node]);
    }
    const isSubflowRoot = node?.kind === "folder"
      && (node?.metadata?.subflowRoot === true || node?.metadata?.flowStructure === "subflows");
    const isSubflowCategory = node?.kind === "folder"
      && (node?.metadata?.subflowCategory === true || node?.metadata?.flowStructure === "subflow-category");
    if (flowId && isSubflowRoot) subflowRootByFlowId.set(flowId, node);
    if (flowId && (isSubflowRoot || isSubflowCategory)) {
      const containers = subflowContainerNodesByFlowId.get(flowId);
      if (containers) containers.push(node); else subflowContainerNodesByFlowId.set(flowId, [node]);
    }
  }

  return {
    flowEntryById,
    canonicalFlowEntryById,
    flowById,
    artifactFlowById,
    taskById,
    taskByPolicyId,
    taskFlowByTaskId,
    recordingById,
    timelineByRecordingId,
    timelineEntryById,
    proposalById,
    proposalsByRecordingId,
    latestProposalByRecordingId,
    policyById,
    policyByTaskId,
    signalByPath,
    hierarchyNodeById,
    subflowHierarchyNodeByScope,
    subflowRootByFlowId,
    folderHierarchyNodesByCategory,
    subflowContainerNodesByFlowId
  };
}

export function createAutomationEntityIndexesSelector() {
  let previousSources: AutomationEntityIndexSources | null = null;
  let previousIndexes: AutomationEntityIndexes | null = null;
  return (sources: AutomationEntityIndexSources): AutomationEntityIndexes => {
    if (previousSources
      && previousSources.flowEntries === sources.flowEntries
      && previousSources.artifactFlows === sources.artifactFlows
      && previousSources.tasks === sources.tasks
      && previousSources.recordings === sources.recordings
      && previousSources.timelines === sources.timelines
      && previousSources.proposals === sources.proposals
      && previousSources.policies === sources.policies
      && previousSources.signals === sources.signals
      && previousSources.hierarchyNodes === sources.hierarchyNodes
      && previousIndexes) return previousIndexes;
    previousSources = sources;
    previousIndexes = buildAutomationEntityIndexes(sources);
    return previousIndexes;
  };
}
