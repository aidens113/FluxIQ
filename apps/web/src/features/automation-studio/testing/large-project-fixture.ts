export type LargeProjectFixtureCounts = {
  flows: number;
  subflows: number;
  recordings: number;
  runs: number;
  actions: number;
  instructions: number;
  adaptations: number;
  stateFacts: number;
  hierarchyNodes: number;
  clients: number;
};

export const defaultLargeProjectFixtureCounts: Readonly<LargeProjectFixtureCounts> = Object.freeze({
  flows: 2_048,
  subflows: 2_048,
  recordings: 2_048,
  runs: 2_048,
  actions: 8_192,
  instructions: 2_048,
  adaptations: 2_048,
  stateFacts: 8_192,
  hierarchyNodes: 4_096,
  clients: 2_048
});

const MAX_COLLECTION_SIZE = 50_000;
const BASE_TIMESTAMP = 1_700_000_000_000;

export function createLargeAutomationStudioProjectFixture(requested: Partial<LargeProjectFixtureCounts> = {}) {
  const counts = normalizeCounts(requested);
  const projectId = "project.large";
  const flows = generate(counts.flows, (index) => ({
    flowId: id("flow", index), name: `Flow ${index}`, description: `Deterministic fixture Flow ${index}`,
    status: "active", nodes: [], edges: [], metadata: { summaryOnly: true, revision: index }, updatedAt: timestamp(index)
  }));
  const subflows = generate(counts.subflows, (index) => ({
    subflowId: id("subflow", index), flowId: relatedId("flow", index, counts.flows), graphFlowId: id("subflow-graph", index),
    name: `Subflow ${index}`, role: index % 2 ? "recovery" : "primary", status: index % 17 ? "active" : "disabled", updatedAt: timestamp(index)
  }));
  const recordings = generate(counts.recordings, (index) => ({
    recordingId: id("recording", index), flowId: relatedId("flow", index, counts.flows), startedAt: timestamp(index),
    endedAt: timestamp(index) + 1_000, metadata: { name: `Recording ${index}`, eventCount: 4, noteCount: index % 3 }
  }));
  const runs = generate(counts.runs, (index) => ({
    runId: id("run", index), flowId: relatedId("flow", index, counts.flows), targetKind: "flow",
    targetId: relatedId("flow", index, counts.flows), status: index % 11 === 0 ? "failed" : "succeeded",
    queuedAt: timestamp(index), startedAt: timestamp(index) + 10, finishedAt: timestamp(index) + 110,
    actionAttemptCount: counts.runs ? Math.floor(counts.actions / counts.runs) : 0, effectCount: index % 4
  }));
  const actions = generate(counts.actions, (index) => ({
    attemptId: id("attempt", index), runId: relatedId("run", index, counts.runs), nodeId: id("node", index), order: index,
    status: index % 13 === 0 ? "failed" : "succeeded", startedAt: timestamp(index), finishedAt: timestamp(index) + 5
  }));
  const instructions = generate(counts.instructions, (index) => ({
    instructionId: id("instruction", index), flowId: relatedId("flow", index, counts.flows), title: `Instruction ${index}`,
    body: `Perform deterministic behavior ${index}.`, scopeKind: index % 3 === 0 ? "on_error" : "flow",
    priority: index % 101, status: "active", updatedAt: timestamp(index)
  }));
  const adaptations = generate(counts.adaptations, (index) => ({
    adaptationId: id("adaptation", index), flowId: relatedId("flow", index, counts.flows), trigger: `Observed condition ${index}`,
    riskLevel: index % 5 === 0 ? "medium" : "low", status: index % 7 === 0 ? "validated" : "proposed",
    patch: [{ targetId: id("node", index), before: index, after: index + 1 }], updatedAt: timestamp(index)
  }));
  const stateFacts = generate(counts.stateFacts, (index) => ({
    factId: id("fact", index), namespace: `namespace-${index % 16}`, path: `field.${index}`,
    value: index, observedAt: timestamp(index), confidence: 0.9
  }));
  const hierarchyNodes = generate(counts.hierarchyNodes, (index) => ({
    id: id("hierarchy", index), parentId: index < 16 ? null : id("hierarchy", Math.floor(index / 16) - 1),
    projectId, kind: index % 8 === 0 ? "folder" : "flow", name: `Hierarchy node ${index}`, order: index
  }));
  const clients = generate(counts.clients, (index) => ({
    sessionId: id("session", index), clientId: id("client", index), status: "connected",
    capabilities: [{ actionTypes: ["click", "input", `custom-${index % 8}`] }]
  }));

  return {
    counts,
    project: { id: projectId, name: "Large deterministic project", createdAt: BASE_TIMESTAMP, updatedAt: BASE_TIMESTAMP },
    flows, subflows, recordings, runs, actions, instructions, adaptations, stateFacts, hierarchyNodes, clients,
    generatedEntityCount: Object.values(counts).reduce((total, count) => total + count, 0)
  };
}

function normalizeCounts(requested: Partial<LargeProjectFixtureCounts>): LargeProjectFixtureCounts {
  return Object.fromEntries(Object.entries(defaultLargeProjectFixtureCounts).map(([key, fallback]) => [
    key, boundedCount(requested[key as keyof LargeProjectFixtureCounts] ?? fallback)
  ])) as LargeProjectFixtureCounts;
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_COLLECTION_SIZE, Math.max(0, Math.trunc(value)));
}

function generate<T>(count: number, create: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => create(index));
}

function id(prefix: string, index: number): string {
  return `${prefix}.${index.toString().padStart(5, "0")}`;
}

function relatedId(prefix: string, index: number, count: number): string {
  return id(prefix, count ? index % count : 0);
}

function timestamp(index: number): number {
  return BASE_TIMESTAMP + index;
}
