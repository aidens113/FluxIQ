import type { JsonObject } from "../../../core/index.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { SignalMiningResult } from "../mining/index.ts";
import type { AutomationStudioFlowDocument, PolicyGraph, PolicyNode } from "../model/index.ts";
import { safeSegment } from "../../_shared/storage.ts";

export type PolicyProposalArtifact = {
  schemaVersion: "0.1";
  proposalId: string;
  learnedTaskModelId: string;
  policy: PolicyGraph;
  patch?: PolicyGraphPatch;
  status: "proposed" | "approved";
  summary: string;
  generatedAt: number;
  approvedAt?: number;
  metadata?: JsonObject;
};

export type PolicyGraphPatch = {
  schemaVersion: "0.1";
  patchId: string;
  targetTaskId: string;
  basePolicyId?: string | null;
  mergeStrategy: "append_or_branch";
  nodes: PolicyNode[];
  edges: PolicyGraph["edges"];
  sourceRecordingIds: string[];
  sourceMiningRunIds: string[];
  generatedAt: number;
  metadata?: JsonObject;
};

export function mergeProposalPatchIntoPolicy(existingPolicy: PolicyGraph | null | undefined, proposal: PolicyProposalArtifact): PolicyGraph {
  const patch = proposal.patch ?? {
    schemaVersion: "0.1" as const,
    patchId: `patch.${safeSegment(proposal.proposalId)}`,
    targetTaskId: proposal.policy.taskId,
    basePolicyId: null,
    mergeStrategy: "append_or_branch" as const,
    nodes: proposal.policy.nodes,
    edges: proposal.policy.edges,
    sourceRecordingIds: [String(proposal.metadata?.recordingId ?? "")].filter(Boolean),
    sourceMiningRunIds: [String(proposal.metadata?.miningRunId ?? "")].filter(Boolean),
    generatedAt: proposal.generatedAt
  };
  if (!existingPolicy || existingPolicy.taskId !== patch.targetTaskId) {
    return withPolicyOutgoingEdges({
      ...proposal.policy,
      policyId: existingPolicy?.policyId ?? `policy.${safeSegment(patch.targetTaskId)}.proposal`,
      taskId: patch.targetTaskId,
      nodes: patch.nodes.map((node) => markProposalNode(node, proposal.proposalId, patch.sourceRecordingIds)),
      edges: patch.edges,
      sourceEvidence: uniqueEvidenceReferences([...proposal.policy.sourceEvidence]),
      metadata: {
        ...(proposal.policy.metadata ?? {}),
        proposalId: proposal.proposalId,
        patchId: patch.patchId,
        sourceRecordingIds: patch.sourceRecordingIds
      }
    });
  }

  const existingNodes = existingPolicy.nodes.map((node) => ({ ...node }));
  const existingEdges = existingPolicy.edges.map((edge) => ({ ...edge }));
  const nodeIds = new Set(existingNodes.map((node) => node.id));
  const edgeIds = new Set(existingEdges.map((edge) => edge.id));
  const idMap = new Map<string, string>();
  let previousResolvedId = "";

  for (const [index, proposedNode] of patch.nodes.entries()) {
    const matchingPrefixNode = existingNodes[index];
    if (matchingPrefixNode && policyNodeSignature(matchingPrefixNode) === policyNodeSignature(proposedNode)) {
      idMap.set(proposedNode.id, matchingPrefixNode.id);
      previousResolvedId = matchingPrefixNode.id;
      continue;
    }
    const nextId = uniqueGraphId(`${proposedNode.id}.${safeSegment(proposal.proposalId)}`, nodeIds);
    nodeIds.add(nextId);
    idMap.set(proposedNode.id, nextId);
    existingNodes.push(markProposalNode({ ...proposedNode, id: nextId }, proposal.proposalId, patch.sourceRecordingIds));
    if (previousResolvedId) {
      const branchEdgeId = uniqueGraphId(`edge.${safeSegment(previousResolvedId)}.${safeSegment(nextId)}`, edgeIds);
      edgeIds.add(branchEdgeId);
      existingEdges.push({
        id: branchEdgeId,
        fromNodeId: previousResolvedId,
        toNodeId: nextId,
        label: index === 0 ? "Start branch" : "Recorded branch",
        probability: 0.8,
        metadata: { proposalId: proposal.proposalId, patchId: patch.patchId, branch: true }
      });
    }
    previousResolvedId = nextId;
  }

  for (const edge of patch.edges) {
    const fromNodeId = idMap.get(edge.fromNodeId) ?? edge.fromNodeId;
    const toNodeId = idMap.get(edge.toNodeId) ?? edge.toNodeId;
    if (!fromNodeId || !toNodeId) continue;
    const duplicate = existingEdges.some((candidate) => candidate.fromNodeId === fromNodeId && candidate.toNodeId === toNodeId && String(candidate.label ?? "Next") === String(edge.label ?? "Next"));
    if (duplicate) continue;
    const nextId = uniqueGraphId(`${edge.id}.${safeSegment(proposal.proposalId)}`, edgeIds);
    edgeIds.add(nextId);
    existingEdges.push({
      ...edge,
      id: nextId,
      fromNodeId,
      toNodeId,
      metadata: { ...(edge.metadata ?? {}), proposalId: proposal.proposalId, patchId: patch.patchId }
    });
  }

  return withPolicyOutgoingEdges({
    ...existingPolicy,
    nodes: existingNodes,
    edges: existingEdges,
    sourceEvidence: uniqueEvidenceReferences([...existingPolicy.sourceEvidence, ...proposal.policy.sourceEvidence]),
    generatedMetadata: {
      ...existingPolicy.generatedMetadata,
      generatedAt: Date.now(),
      confidence: average(existingNodes.map((node) => node.generatedMetadata.confidence ?? 0))
    },
    metadata: {
      ...(existingPolicy.metadata ?? {}),
      lastProposalId: proposal.proposalId,
      sourceRecordingIds: uniqueStrings([...asStringArray(existingPolicy.metadata?.sourceRecordingIds), ...patch.sourceRecordingIds])
    }
  });
}

export function policyGraphToAutomationStudioFlow(policy: PolicyGraph, input: { flowId: string; existingFlow?: AutomationStudioFlowDocument | null; proposalId: string; recordingId?: string }): AutomationStudioFlowDocument {
  const now = Date.now();
  return {
    schemaVersion: "0.1",
    flowId: input.flowId,
    ownerKind: "task",
    ownerId: policy.taskId,
    name: humanTaskName(policy.taskId),
    description: `Task flow generated from policy ${policy.policyId}.`,
    nodes: policy.nodes.map((node, index) => ({
      id: node.id,
      definitionId: "builtin.policy.action",
      label: node.label,
      ...(node.description !== undefined ? { description: node.description } : {}),
      position: { x: index * 340, y: index % 2 === 0 ? 120 : 280 },
      parameterValues: compactJsonObject({
        outputId: node.actions[0]?.outputId ?? "",
        confirmationInputId: node.actions[0]?.confirmationInputId ?? "",
        confirmationTimeoutMs: node.actions[0]?.confirmationTimeoutMs ?? 5_000,
        parameters: node.actions[0]?.parameters as JsonObject ?? {},
        timeoutMs: node.timeout.timeoutMs,
        requiresApproval: node.actions[0]?.metadata?.requiresApproval === true,
        failureRoute: "failed"
      }),
      metadata: {
        ...(node.metadata ?? {}),
        policyNodeId: node.id,
        policyId: policy.policyId,
        proposalId: input.proposalId,
        actions: node.actions as unknown as JsonObject[],
        ...(input.recordingId !== undefined ? { recordingId: input.recordingId } : {})
      }
    })),
    edges: policy.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.fromNodeId,
      targetNodeId: edge.toNodeId,
      ...(edge.label !== undefined ? { label: edge.label } : {}),
      metadata: { ...(edge.metadata ?? {}), policyEdgeId: edge.id, policyId: policy.policyId, proposalId: input.proposalId }
    })),
    createdAt: input.existingFlow?.createdAt ?? now,
    updatedAt: now,
    metadata: {
      ...(input.existingFlow?.metadata ?? {}),
      source: "policy_proposal",
      policyId: policy.policyId,
      lastProposalId: input.proposalId,
      ...(input.recordingId !== undefined ? { lastRecordingId: input.recordingId } : {})
    }
  };
}

export function createTaskProposalModelFromMiningRun(miningRun: SignalMiningResult, taskId?: string): LearnedTaskModel {
  const resolvedTaskId = taskId ?? String(miningRun.metadata?.taskId ?? miningRun.metadata?.recordingId ?? "task.learned");
  const actionClaims = (miningRun.claims ?? []).filter((claim) => claim.claimType === "action_effect");
  // Only output-bound recorded actions are candidates. Domain events, state
  // inputs, telemetry, unmapped interactions, and legacy opaque action types
  // are evidence only and can never become executable policy actions.
  const actionObservations = (miningRun.observations ?? []).filter((observation) =>
    observation.kind === "action_performed" && typeof observation.subject?.outputId === "string" && Boolean(observation.subject.outputId.trim())
  );
  const factsById = new Map((miningRun.facts ?? []).map((fact) => [fact.factId, fact]));
  const windows = miningRun.windows.filter((window) => window.actionEntryId);
  const actionClusters = actionObservations.map((observation, index) => {
    const observationSourceEntryId = factsById.get(observation.factIds[0] ?? "")?.source.entryId;
    const window = windows[index];
    const actionEntryId = typeof observationSourceEntryId === "string"
        ? observationSourceEntryId
        : typeof observation.metadata?.entryId === "string"
          ? observation.metadata.entryId
          : window?.actionEntryId;
    const matchingEffects = uniqueBy(miningRun.actionEffects.filter((effect) => effect.actionOccurrenceId === actionEntryId), (effect) => `${effect.signalPath}:${effect.relationship}`);
    const matchingActionClaims = actionClaims.filter((candidate) => candidate.statement.subject.entryId === actionEntryId);
    const primaryEvidence = [{ layer: "evidence_observation" as const, artifactId: observation.observationId, relationship: observation.kind }];
    const claimEvidence = uniqueBy([
      ...matchingActionClaims.map((candidate) => ({ layer: "evidence_claim" as const, artifactId: candidate.claimId, relationship: candidate.claimType })),
      ...primaryEvidence
    ], (evidence) => `${evidence.layer}:${evidence.artifactId}`);
    const outputId = observation.subject!.outputId!;
    const actionType = outputId;
    return {
      id: `cluster.${index + 1}`,
      label: observation.title ?? `Step ${index + 1}`,
      actionTemplate: {
        id: `action.${index + 1}`,
        actionType,
        outputId,
        ...(observation.subject?.confirmationInputId ? { confirmationInputId: observation.subject.confirmationInputId, confirmationTimeoutMs: observation.subject.confirmationTimeoutMs ?? 5_000 } : {}),
        parameters: observation.subject?.parameters ?? {},
        sourceEvidence: claimEvidence
      },
      positiveRequirements: uniqueBy((miningRun.claims ?? [])
        .filter((candidate) => candidate.claimType === "candidate_condition")
        .map((candidate) => ({ signalPath: String(candidate.statement.object?.signalPath ?? candidate.statement.subject.signalPath ?? ""), operator: "exists" as const, weight: candidate.confidence.score }))
        .filter((condition) => condition.signalPath)
        .slice(0, 3), (condition) => condition.signalPath),
      negativeRequirements: [],
      expectedEffects: matchingEffects.map((effect) => ({
        signalPath: effect.signalPath,
        condition: { signalPath: effect.signalPath, operator: "changed" as const },
        probability: actionClaims.find((candidate) => candidate.statement.object?.signalPath === effect.signalPath && candidate.statement.subject.entryId === actionEntryId)?.confidence.score ?? effect.probability,
        evidence: matchingActionClaims
          .filter((candidate) => candidate.statement.object?.signalPath === effect.signalPath)
          .map((candidate) => ({ layer: "evidence_claim" as const, artifactId: candidate.claimId, relationship: candidate.claimType }))
      })),
      possibleSideEffects: [],
      confidence: Math.min(0.85, 0.55 + matchingEffects.length * 0.05),
      sourceOccurrences: actionEntryId ? [actionEntryId] : [],
      metadata: { sourceObservationId: observation.observationId, factIds: observation.factIds }
    };
  });
  const transitions = actionClusters.slice(0, -1).map((cluster, index) => ({
    id: `transition.${index + 1}`,
    fromClusterId: cluster.id,
    toClusterId: actionClusters[index + 1]!.id,
    probability: 0.8,
    evidence: []
  }));
  return {
    schemaVersion: "0.1",
    learnedTaskModelId: `model.${safeSegment(resolvedTaskId)}.${Date.now()}`,
    taskId: resolvedTaskId,
    version: "0.1",
    actionClusters,
    transitions,
    invariants: miningRun.conditionCandidates.slice(0, 5).map((candidate) => ({ signalPath: candidate.signalPath, operator: "exists" })),
    unresolvedQuestions: miningRun.issues.map((issue, index) => ({ id: `question.${index + 1}`, question: issue, severity: "important", evidence: [] })),
    sourceRecordings: [String(miningRun.metadata?.recordingId ?? "")].filter(Boolean),
    sourceMiningRuns: [miningRun.miningRunId],
    generatedAt: Date.now(),
    metadata: { source: "mined_evidence" }
  };
}

export function humanTaskName(taskId: string): string {
  const name = readableTokenValue(taskId.replace(/^task[.:_-]?/i, ""));
  return name === "Unknown" ? "Generated Proposal" : name;
}

export function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : 0;
}

export function withPolicyOutgoingEdges(policy: PolicyGraph): PolicyGraph {
  return { ...policy, nodes: policy.nodes.map((node) => ({ ...node, outgoingEdges: policy.edges.filter((edge) => edge.fromNodeId === node.id) })) };
}

function markProposalNode(node: PolicyNode, proposalId: string, recordingIds: string[]): PolicyNode {
  return { ...node, metadata: { ...(node.metadata ?? {}), proposalId, sourceRecordingIds: recordingIds, graphTone: "proposed" } };
}

function policyNodeSignature(node: PolicyNode): string {
  return `${node.label.toLowerCase().trim()}::${node.actions.map((action) => `${action.actionType}:${JSON.stringify(action.parameters ?? {})}`).join("|")}::${JSON.stringify(node.successConditions ?? {})}`;
}

function uniqueGraphId(seed: string, used: Set<string>): string {
  const base = safeSegment(seed);
  let id = base;
  let index = 2;
  while (used.has(id)) id = `${base}.${index++}`;
  return id;
}

export function uniqueEvidenceReferences(items: PolicyGraph["sourceEvidence"]): PolicyGraph["sourceEvidence"] {
  return uniqueBy(items, (item) => `${item.layer}:${item.artifactId}:${item.entryId ?? ""}:${item.relationship ?? ""}`);
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

function readableTokenValue(value: string): string {
  return value.replace(/[_:.-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unknown";
}
