import { createHash } from "node:crypto";

export type AutomationStudioScaleProfile = {
  projects: number;
  flows: number;
  subflows: number;
  nodes: number;
  edges: number;
  nodesPerGraph: number;
  edgesPerGraph: number;
  instructions: number;
  runs: number;
  eventsPerRun: number;
  recordings: number;
  eventsPerRecording: number;
  assets: number;
};

export const AUTOMATION_STUDIO_TARGET_SCALE: Readonly<AutomationStudioScaleProfile> = Object.freeze({
  projects: 10_000,
  flows: 10_000,
  subflows: 100_000,
  nodes: 1_000_000,
  edges: 2_500_000,
  nodesPerGraph: 100_000,
  edgesPerGraph: 250_000,
  instructions: 100_000,
  runs: 10_000_000,
  eventsPerRun: 1_000_000,
  recordings: 100_000,
  eventsPerRecording: 10_000_000,
  assets: 10_000_000
});

export const AUTOMATION_STUDIO_SCALE_PROFILES = Object.freeze({
  smoke: scaleProfile({ projects: 2, flows: 4, subflows: 12, nodes: 100, edges: 180, nodesPerGraph: 40, edgesPerGraph: 72, instructions: 20, runs: 50, eventsPerRun: 20, recordings: 4, eventsPerRecording: 50, assets: 30 }),
  baseline: scaleProfile({ projects: 20, flows: 100, subflows: 1_000, nodes: 10_000, edges: 25_000, nodesPerGraph: 10_000, edgesPerGraph: 25_000, instructions: 2_000, runs: 20_000, eventsPerRun: 1_000, recordings: 100, eventsPerRecording: 10_000, assets: 25_000 }),
  target: AUTOMATION_STUDIO_TARGET_SCALE
});

export type AutomationStudioScaleBatchOptions = {
  start?: number;
  count?: number;
  seed?: number;
  maxBatchSize?: number;
};

export type AutomationStudioScaleManifest = {
  schemaVersion: "0.1";
  seed: number;
  profile: AutomationStudioScaleProfile;
  digest: string;
};

export function createAutomationStudioScaleManifest(profile: AutomationStudioScaleProfile, seed = 0x51ca1e): AutomationStudioScaleManifest {
  const normalized = scaleProfile(profile);
  return {
    schemaVersion: "0.1",
    seed: normalizeSeed(seed),
    profile: normalized,
    digest: createHash("sha256").update(JSON.stringify({ seed: normalizeSeed(seed), profile: normalized })).digest("hex")
  };
}

export function automationStudioScaleProjectBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.projects, options, (index, seed) => ({
    projectId: scaleId("project", index),
    name: `Scale Project ${index}`,
    categoryId: index % 8 ? `category.${index % 32}` : null,
    description: `Deterministic project fixture ${fixtureValue(seed, index)}`,
    createdAt: fixtureTime(index),
    updatedAt: fixtureTime(index) + 1
  }));
}

export function automationStudioScaleFlowBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.flows, options, (index, seed) => ({
    flowId: scaleId("flow", index),
    projectId: scaleId("project", index % Math.max(1, profile.projects)),
    name: `Scale Flow ${index}`,
    status: index % 17 === 0 ? "disabled" : "active",
    graphRevision: 1 + (fixtureValue(seed, index) % 20),
    nodeCount: distributedCount(profile.nodes, profile.flows, index),
    edgeCount: distributedCount(profile.edges, profile.flows, index),
    updatedAt: fixtureTime(index)
  }));
}

export function automationStudioScaleSubflowBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.subflows, options, (index) => ({
    subflowId: scaleId("subflow", index),
    parentFlowId: scaleId("flow", index % Math.max(1, profile.flows)),
    graphFlowId: scaleId("subflow-graph", index),
    name: `Scale Subflow ${index}`,
    role: index % 7 === 0 ? "recovery" : "primary",
    status: index % 29 === 0 ? "archived" : "active",
    updatedAt: fixtureTime(index)
  }));
}

export function automationStudioScaleGraphNodeBatch(profile: AutomationStudioScaleProfile, flowId: string, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.nodesPerGraph, options, (index, seed) => {
    const jitter = fixtureValue(seed, index);
    return {
      nodeId: scaleId("node", index),
      flowId,
      definitionId: `builtin.scale.${index % 24}`,
      label: `Node ${index}`,
      x: (index % 500) * 220 + (jitter % 17),
      y: Math.floor(index / 500) * 140 + (jitter % 11),
      parameterValues: { fixtureIndex: index, lane: index % 16 },
      revision: 1
    };
  });
}

export function automationStudioScaleGraphEdgeBatch(profile: AutomationStudioScaleProfile, flowId: string, options: AutomationStudioScaleBatchOptions = {}) {
  const nodeCount = Math.max(1, profile.nodesPerGraph);
  return createBatch(profile.edgesPerGraph, options, (index, seed) => {
    const source = fixtureValue(seed, index) % nodeCount;
    const distance = 1 + (fixtureValue(seed ^ 0x9e3779b9, index) % Math.min(97, nodeCount));
    return {
      edgeId: scaleId("edge", index),
      flowId,
      sourceNodeId: scaleId("node", source),
      targetNodeId: scaleId("node", (source + distance) % nodeCount),
      sourcePortId: "success",
      targetPortId: "in",
      revision: 1
    };
  });
}

export function automationStudioScaleInstructionBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.instructions, options, (index) => ({
    instructionId: scaleId("instruction", index),
    flowId: scaleId("flow", index % Math.max(1, profile.flows)),
    title: `Scale Instruction ${index}`,
    body: `Apply deterministic fixture rule ${index}.`,
    scopeKind: index % 5 === 0 ? "subflow" : "flow",
    priority: 100 - (index % 100),
    status: "active",
    updatedAt: fixtureTime(index)
  }));
}

export function automationStudioScaleRunBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.runs, options, (index) => ({
    runId: scaleId("run", index),
    flowId: scaleId("flow", index % Math.max(1, profile.flows)),
    status: index % 23 === 0 ? "failed" : "succeeded",
    startedAt: fixtureTime(index),
    finishedAt: fixtureTime(index) + 5 + (index % 2_000),
    actionCount: profile.eventsPerRun,
    updatedAt: fixtureTime(index) + 5
  }));
}

export function automationStudioScaleRuntimeEventBatch(profile: AutomationStudioScaleProfile, runIndex: number, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.eventsPerRun, options, (index, seed) => ({
    eventId: `event.run.${runIndex}.${index}`,
    runId: scaleId("run", runIndex),
    sequence: index,
    type: index % 11 === 0 ? "state" : index % 7 === 0 ? "effect" : "action",
    nodeId: scaleId("node", fixtureValue(seed, index) % Math.max(1, profile.nodesPerGraph)),
    timestamp: fixtureTime(index),
    payload: { fixtureValue: fixtureValue(seed, index), status: index % 23 === 0 ? "failed" : "succeeded" }
  }));
}

export function automationStudioScaleRecordingBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.recordings, options, (index) => ({
    recordingId: scaleId("recording", index),
    name: `Scale Recording ${index}`,
    status: "completed",
    startedAt: fixtureTime(index),
    endedAt: fixtureTime(index) + profile.eventsPerRecording,
    eventCount: profile.eventsPerRecording,
    updatedAt: fixtureTime(index) + profile.eventsPerRecording
  }));
}

export function automationStudioScaleRecordingEventBatch(profile: AutomationStudioScaleProfile, recordingIndex: number, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.eventsPerRecording, options, (index, seed) => ({
    eventId: `event.recording.${recordingIndex}.${index}`,
    recordingId: scaleId("recording", recordingIndex),
    sequence: index,
    type: index % 13 === 0 ? "state_checkpoint" : index % 5 === 0 ? "observation" : "action",
    timestamp: fixtureTime(index),
    payload: { fixtureValue: fixtureValue(seed, index) }
  }));
}

export function automationStudioScaleAssetBatch(profile: AutomationStudioScaleProfile, options: AutomationStudioScaleBatchOptions = {}) {
  return createBatch(profile.assets, options, (index, seed) => ({
    objectId: scaleId("object", index),
    sha256: deterministicHex(seed, index, 64),
    mediaType: index % 4 === 0 ? "image/png" : "application/json",
    byteCount: 512 + (fixtureValue(seed, index) % 4_000_000),
    ownerKind: index % 3 === 0 ? "recording" : index % 3 === 1 ? "run" : "flow",
    ownerId: scaleId(index % 3 === 0 ? "recording" : index % 3 === 1 ? "run" : "flow", index)
  }));
}

export function scaleProfile(input: Partial<AutomationStudioScaleProfile>): AutomationStudioScaleProfile {
  return {
    projects: count(input.projects),
    flows: count(input.flows),
    subflows: count(input.subflows),
    nodes: count(input.nodes),
    edges: count(input.edges),
    nodesPerGraph: count(input.nodesPerGraph),
    edgesPerGraph: count(input.edgesPerGraph),
    instructions: count(input.instructions),
    runs: count(input.runs),
    eventsPerRun: count(input.eventsPerRun),
    recordings: count(input.recordings),
    eventsPerRecording: count(input.eventsPerRecording),
    assets: count(input.assets)
  };
}

function createBatch<T>(total: number, options: AutomationStudioScaleBatchOptions, create: (index: number, seed: number) => T): T[] {
  const start = Math.max(0, Math.min(total, Math.trunc(options.start ?? 0)));
  const maxBatchSize = Math.max(1, Math.min(100_000, Math.trunc(options.maxBatchSize ?? 10_000)));
  const requested = Math.max(0, Math.trunc(options.count ?? Math.min(total - start, maxBatchSize)));
  const batchCount = Math.min(requested, maxBatchSize, total - start);
  const seed = normalizeSeed(options.seed ?? 0x51ca1e);
  return Array.from({ length: batchCount }, (_, offset) => create(start + offset, seed));
}

function count(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

function distributedCount(total: number, owners: number, index: number): number {
  if (!owners) return 0;
  return Math.floor(total / owners) + (index < total % owners ? 1 : 0);
}

function fixtureTime(index: number): number {
  return 1_700_000_000_000 + index * 10;
}

function scaleId(kind: string, index: number): string {
  return `${kind}.scale.${String(index).padStart(10, "0")}`;
}

function normalizeSeed(seed: number): number {
  return (Math.trunc(seed) >>> 0) || 1;
}

function fixtureValue(seed: number, index: number): number {
  let value = (normalizeSeed(seed) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function deterministicHex(seed: number, index: number, length: number): string {
  let output = "";
  let part = 0;
  while (output.length < length) {
    output += fixtureValue(seed ^ Math.imul(part + 1, 0x45d9f3b), index).toString(16).padStart(8, "0");
    part += 1;
  }
  return output.slice(0, length);
}
