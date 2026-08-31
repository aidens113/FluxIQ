import type { Edge, Node } from "@xyflow/react";
import { automationPolicyGraphProblems, type AutomationGraphProblem } from "../flow-editor/graph-validation";
import type { AutomationFlowNodeData } from "../flow-editor/node-types";
import { taskFlowToReactFlowGraph } from "../flow-editor/model/policy-graph";
import { scheduleAutomationGraphIdleTask, type AutomationGraphIdleTaskOptions } from "./worker-tasks";

export type AutomationDerivedGraph = {
  nodes: Array<Node<AutomationFlowNodeData>>;
  edges: Edge[];
};

export type AutomationDerivedGraphProblem = AutomationGraphProblem & {
  id: string;
  severity: "error";
  source: "graph";
  artifactId: string;
  artifactLabel: string;
};

export type AutomationGraphDerivationRequest = {
  ownerKey: string;
  revisionKey: string;
  flowId: string;
  flowName: string;
  source: unknown;
  nodeDefinitions: unknown[];
  validationGraph: AutomationDerivedGraph | null;
  validate: boolean;
};

export type AutomationGraphDerivationSnapshot = {
  ownerKey: string | null;
  revisionKey: string | null;
  graph: AutomationDerivedGraph | null;
  problems: AutomationDerivedGraphProblem[];
  status: "idle" | "refreshing" | "ready" | "error";
  error: string | null;
};

type DerivationScheduler = (
  callback: () => void,
  options?: AutomationGraphIdleTaskOptions
) => () => void;

type AutomationGraphDerivationDependencies = {
  schedule?: DerivationScheduler;
  convert?: (source: unknown, nodeDefinitions: unknown[]) => AutomationDerivedGraph;
  validate?: (graph: AutomationDerivedGraph) => AutomationGraphProblem[];
};

const objectIdentities = new WeakMap<object, number>();
let nextObjectIdentity = 1;

function objectIdentity(value: unknown): string {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return String(value ?? "none");
  const object = value as object;
  const existing = objectIdentities.get(object);
  if (existing !== undefined) return String(existing);
  const identity = nextObjectIdentity++;
  objectIdentities.set(object, identity);
  return String(identity);
}

export function automationGraphDerivationKeys(input: {
  projectId: string | null;
  source: any;
  nodeDefinitions: unknown[];
  validationGraph?: AutomationDerivedGraph | null;
  validate: boolean;
}): { ownerKey: string; revisionKey: string } {
  const source = input.source;
  const flowId = String(source?.flowId ?? source?.id ?? "no-flow");
  const revision = source?.graphRevision ?? source?.revision ?? source?.updatedAt ?? source?.createdAt ?? "unversioned";
  const ownerKey = `${input.projectId ?? "no-project"}:${flowId}`;
  const revisionKey = [
    ownerKey,
    String(revision),
    objectIdentity(source),
    objectIdentity(input.nodeDefinitions),
    input.validate ? objectIdentity(input.validationGraph) : "validation-off",
    input.validate ? "validate" : "graph-only"
  ].join(":");
  return { ownerKey, revisionKey };
}

export function createAutomationGraphDerivationJob(dependencies: AutomationGraphDerivationDependencies = {}) {
  const schedule = dependencies.schedule ?? scheduleAutomationGraphIdleTask;
  const convert = dependencies.convert ?? ((source, nodeDefinitions) => taskFlowToReactFlowGraph(source, "", nodeDefinitions));
  const validate = dependencies.validate ?? ((graph) => automationPolicyGraphProblems(graph.nodes, graph.edges));
  const listeners = new Set<(snapshot: AutomationGraphDerivationSnapshot) => void>();
  let request: AutomationGraphDerivationRequest | null = null;
  let generation = 0;
  let cancelScheduled: (() => void) | null = null;
  let snapshot: AutomationGraphDerivationSnapshot = {
    ownerKey: null,
    revisionKey: null,
    graph: null,
    problems: [],
    status: "idle",
    error: null
  };

  const emit = () => {
    for (const listener of listeners) listener(snapshot);
  };

  const cancel = () => {
    generation += 1;
    cancelScheduled?.();
    cancelScheduled = null;
  };

  const start = () => {
    if (!request || listeners.size === 0) return;
    if (snapshot.revisionKey === request.revisionKey && snapshot.status === "ready") return;
    cancel();
    const activeRequest = request;
    const activeGeneration = generation;
    snapshot = {
      ...snapshot,
      ownerKey: activeRequest.ownerKey,
      revisionKey: activeRequest.revisionKey,
      status: "refreshing",
      error: null
    };
    emit();
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      if (activeGeneration !== generation || request?.revisionKey !== activeRequest.revisionKey || listeners.size === 0) return;
      try {
        const graph = convert(activeRequest.source, activeRequest.nodeDefinitions);
        const validationGraph = activeRequest.validationGraph ?? graph;
        const problems = activeRequest.validate
          ? validate(validationGraph).map((problem) => ({
              ...problem,
              id: `graph:${problem.id}`,
              severity: "error" as const,
              source: "graph" as const,
              artifactId: activeRequest.flowId,
              artifactLabel: activeRequest.flowName
            }))
          : [];
        if (activeGeneration !== generation || request?.revisionKey !== activeRequest.revisionKey || listeners.size === 0) return;
        snapshot = {
          ownerKey: activeRequest.ownerKey,
          revisionKey: activeRequest.revisionKey,
          graph,
          problems,
          status: "ready",
          error: null
        };
        emit();
      } catch (error) {
        if (activeGeneration !== generation || request?.revisionKey !== activeRequest.revisionKey || listeners.size === 0) return;
        snapshot = {
          ...snapshot,
          status: "error",
          error: error instanceof Error ? error.message : "Graph derivation failed."
        };
        emit();
      }
    }, { delayMs: 0, timeoutMs: 1_000 });
  };

  return {
    getSnapshot(): AutomationGraphDerivationSnapshot {
      return snapshot;
    },
    setRequest(nextRequest: AutomationGraphDerivationRequest | null): void {
      if (request?.revisionKey === nextRequest?.revisionKey) return;
      cancel();
      const ownerChanged = request?.ownerKey !== nextRequest?.ownerKey;
      request = nextRequest;
      if (!nextRequest) {
        snapshot = { ownerKey: null, revisionKey: null, graph: null, problems: [], status: "idle", error: null };
        emit();
        return;
      }
      snapshot = ownerChanged
        ? { ownerKey: nextRequest.ownerKey, revisionKey: nextRequest.revisionKey, graph: null, problems: [], status: "idle", error: null }
        : { ...snapshot, revisionKey: nextRequest.revisionKey, status: snapshot.graph ? "refreshing" : "idle", error: null };
      emit();
      start();
    },
    subscribe(listener: (nextSnapshot: AutomationGraphDerivationSnapshot) => void): () => void {
      listeners.add(listener);
      listener(snapshot);
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) cancel();
      };
    },
    dispose(): void {
      listeners.clear();
      request = null;
      cancel();
    }
  };
}
