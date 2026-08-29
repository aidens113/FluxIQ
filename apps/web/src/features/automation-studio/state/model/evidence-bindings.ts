import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { arrayValue, isObjectRecord, isString, numberValue, objectRecord, readablePath, readableToken, stringValue, valueSummary } from "./value-utils";

export function collectEvidenceBindings(input: BuildNodeStateViewModelInput, nodeId: string): NodeEvidenceBinding[] {
  const explicit = [
    ...arrayValue(objectRecord(input.pipelineArtifacts)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(input.selectedNode)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(objectRecord(input.selectedNode)?.metadata)?.nodeEvidenceBindings),
    ...arrayValue(objectRecord(objectRecord(input.selectedNode)?.metadata)?.evidenceBindings)
  ].filter(isNodeEvidenceBinding);
  const scoped = explicit.filter((binding) => !nodeId || binding.nodeId === nodeId);
  return scoped.length ? scoped : inferredEvidenceBindings(input, nodeId);
}

export function inferredEvidenceBindings(input: BuildNodeStateViewModelInput, nodeId: string): NodeEvidenceBinding[] {
  if (!nodeId) return [];
  const artifacts = objectRecord(input.pipelineArtifacts);
  const correlations = arrayValue(artifacts?.stateActionCorrelations).filter(isObjectRecord);
  const claims = arrayValue(artifacts?.evidenceClaims).filter(isObjectRecord);
  const nodeEvidence = nodeEvidenceReferenceIds(input.selectedNode);
  const bindings: NodeEvidenceBinding[] = [];
  for (const correlation of correlations) {
    const correlationId = stringValue(correlation.correlationId);
    const statePath = stringValue(correlation.statePath);
    if (!correlationId || !statePath || (nodeEvidence.size && !nodeEvidence.has(correlationId))) continue;
    const { namespace, path } = splitStatePath(statePath);
    const relation = stringValue(correlation.relation);
    const evidenceReference: EvidenceReference = {
      layer: "state_action_correlation",
      artifactId: correlationId,
      ...(relation ? { relationship: relation } : {})
    };
    const confidence = confidenceFromClaims(claims, correlationId);
    bindings.push({
      id: `binding:${nodeId}:${correlationId}`,
      nodeId,
      fact: {
        namespace,
        path,
        evidence: evidenceReference
      },
      role: roleFromRelation(stringValue(correlation.relation)),
      comparator: comparatorFromRelation(stringValue(correlation.relation)),
      ...(confidence !== undefined ? { confidence } : {}),
      provenance: [evidenceReference]
    });
  }
  return bindings;
}

export function evidenceBindingViewModel(binding: NodeEvidenceBinding, selectedEvidenceId: string | undefined): NodeEvidenceBindingViewModel {
  const factPath = `${binding.fact.namespace}.${binding.fact.path}`;
  return {
    id: binding.id,
    nodeId: binding.nodeId,
    factPath,
    role: binding.role,
    label: `${readableToken(binding.role)}: ${readablePath(factPath)}`,
    comparator: comparatorSummary(binding.comparator),
    ...(binding.expectedValue !== undefined ? { expectedValue: valueSummary(binding.expectedValue) } : {}),
    ...(binding.weight !== undefined ? { weight: binding.weight } : {}),
    ...(binding.confidence !== undefined ? { confidence: binding.confidence } : {}),
    ...(binding.anchor ? { anchor: binding.anchor } : {}),
    provenanceCount: binding.provenance?.length ?? 0,
    selected: binding.id === selectedEvidenceId
  };
}

export function summarizeEvidence(evidence: NodeEvidenceBindingViewModel[]) {
  let strong = 0;
  let weak = 0;
  let negative = 0;
  let ignored = 0;
  for (const item of evidence) {
    if (item.role === "ignored") ignored += 1;
    else if (item.role === "negative_eligibility" || item.role === "failure") negative += 1;
    else if ((item.confidence ?? item.weight ?? 1) < 0.6) weak += 1;
    else strong += 1;
  }
  return { strong, weak, negative, ignored };
}

export function roleFromRelation(relation: string | undefined): NodeEvidenceRole {
  if (!relation) return "context";
  if (relation.includes("before")) return "eligibility";
  if (relation.includes("after") || relation.includes("changed") || relation.includes("appeared") || relation.includes("disappeared")) return "expectation";
  return "context";
}

export function comparatorFromRelation(relation: string | undefined): NodeEvidenceBinding["comparator"] {
  if (relation?.includes("changed") || relation?.includes("appeared") || relation?.includes("disappeared")) return { kind: "changed" };
  return { kind: "exists" };
}

export function confidenceFromClaims(claims: Array<Record<string, unknown>>, correlationId: string): number | undefined {
  const claim = claims.find((item) => arrayValue(item.sourceEvidence).some((source) => stringValue(objectRecord(source)?.artifactId) === correlationId));
  return numberValue(objectRecord(claim?.confidence)?.score);
}

export function nodeEvidenceReferenceIds(node: unknown): Set<string> {
  const record = objectRecord(node);
  const sources = [
    ...arrayValue(record?.sourceEvidence),
    ...arrayValue(objectRecord(record?.metadata)?.evidence),
    ...arrayValue(objectRecord(record?.metadata)?.sourceEvidence)
  ];
  return new Set(sources.map((source) => stringValue(objectRecord(source)?.artifactId)).filter(isString));
}

export function comparatorSummary(comparator: NodeEvidenceBinding["comparator"]): string {
  if (comparator.kind === "exists") return "exists";
  if (comparator.kind === "changed") return "changed";
  if (comparator.kind === "equals") return `equals ${valueSummary(comparator.value)}`;
  if (comparator.kind === "not_equals") return `does not equal ${valueSummary(comparator.value)}`;
  if (comparator.kind === "numeric") return `${comparator.operator} ${comparator.value}`;
  return `custom ${comparator.comparatorId}`;
}

export function splitStatePath(value: string): { namespace: string; path: string } {
  const [namespace, ...pathParts] = value.split(".");
  return { namespace: namespace || "state", path: pathParts.join(".") || value };
}

export function isNodeEvidenceBinding(value: unknown): value is NodeEvidenceBinding {
  const record = objectRecord(value);
  return Boolean(record && stringValue(record.id) && stringValue(record.nodeId) && objectRecord(record.fact) && objectRecord(record.comparator) && typeof record.role === "string");
}
