import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";
import { arrayValue, compactObject, objectRecord, readablePath, stringValue, valueSummary } from "./value-utils";

type NumericComparatorOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export function collectDiffRows(activeRecord: StateSourceRecord | null): StateDiffRow[] {
  return (activeRecord?.deltas ?? []).flatMap((delta, index) => {
    const record = objectRecord(delta);
    if (!record) return [];
    const namespace = stringValue(record.namespace) ?? stringValue(objectRecord(record.path)?.namespace) ?? "state";
    const path = typeof record.path === "string" ? record.path : stringValue(objectRecord(record.path)?.path) ?? String(index);
    return [{
      id: `delta:${namespace}.${path}:${index}`,
      path: `${namespace}.${path}`,
      change: stringValue(record.change) ?? "changed",
      before: valueSummary(objectRecord(record.previous)?.value ?? record.previous),
      after: valueSummary(objectRecord(record.current)?.value ?? record.current),
      ...(typeof record.confidence === "number" ? { confidence: `${Math.round(record.confidence * 100)}%` } : {})
    }];
  });
}

export function buildRuntimeComparison(input: BuildNodeStateViewModelInput, activeRecord: StateSourceRecord | null, nodeId: string, bindings: NodeEvidenceBinding[], facts: StateFactViewModel[], sourceRecords: StateSourceRecord[]): NodeStateRuntimeComparisonViewModel | undefined {
  if (activeRecord?.source.kind !== "runtime" || !nodeId) return undefined;
  const explicit = findRuntimeComparison(input, activeRecord.raw, nodeId, activeRecord.source.id);
  if (explicit) return runtimeComparisonFromContract(explicit, bindings, facts);
  const expectedBindings = bindings.filter((binding) => binding.role === "expectation" || binding.role === "invariant");
  if (!expectedBindings.length && !facts.length) return undefined;
  const expectedSourceId = sourceRecords.find((record) => record.source.kind !== "runtime")?.source.id ?? `expected:${nodeId}`;
  const actualSourceId = activeRecord.source.id;
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  const matches: NodeStateRuntimeComparisonRow[] = [];
  const mismatches: NodeStateRuntimeComparisonRow[] = [];
  const boundFactPaths = new Set<string>();
  for (const binding of expectedBindings) {
    const factPath = `${binding.fact.namespace}.${binding.fact.path}`;
    boundFactPaths.add(factPath);
    const fact = factsByPath.get(factPath);
    const expected = expectedValueForBinding(binding);
    const matched = fact ? comparatorMatches(binding.comparator, fact.rawValue) : false;
    const base = compactComparisonRow({
      id: `${matched ? "match" : "mismatch"}:${binding.id}`,
      status: matched ? "match" : "mismatch",
      evidenceId: binding.id,
      factPath,
      label: readablePath(factPath),
      expected: expected,
      actual: fact ? fact.value : "-",
      score: matched ? binding.confidence ?? binding.weight ?? fact?.confidence : undefined,
      severity: matched ? undefined : "error",
      anchor: binding.anchor ?? fact?.anchor
    });
    if (matched) matches.push(base);
    else mismatches.push(base);
  }
  const irrelevant = facts
    .filter((fact) => !boundFactPaths.has(fact.fullPath))
    .map((fact) => compactComparisonRow({
      id: `irrelevant:${fact.id}`,
      status: "irrelevant",
      factPath: fact.fullPath,
      label: fact.label,
      expected: "Irrelevant",
      actual: fact.value,
      anchor: fact.anchor
    }));
  return compactRuntimeComparisonViewModel({
    expectedSourceId,
    actualSourceId,
    nodeId,
    confidence: comparisonConfidence(matches.length, mismatches.length),
    matches,
    mismatches,
    irrelevant,
    rows: [...mismatches, ...matches, ...irrelevant]
  });
}

export function findRuntimeComparison(input: BuildNodeStateViewModelInput, activeRaw: unknown, nodeId: string, actualSourceId: string): NodeStateRuntimeComparison | null {
  const candidates = [
    objectRecord(activeRaw)?.runtimeComparison,
    objectRecord(objectRecord(activeRaw)?.metadata)?.runtimeComparison,
    objectRecord(input.pipelineArtifacts)?.runtimeComparison,
    ...arrayValue(objectRecord(input.pipelineArtifacts)?.runtimeComparisons)
  ];
  for (const candidate of candidates) {
    if (isNodeStateRuntimeComparison(candidate) && candidate.nodeId === nodeId && candidate.actualSourceId === actualSourceId) return candidate;
  }
  return null;
}

export function runtimeComparisonFromContract(comparison: NodeStateRuntimeComparison, bindings: NodeEvidenceBinding[], facts: StateFactViewModel[]): NodeStateRuntimeComparisonViewModel {
  const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
  const factsByPath = new Map(facts.map((fact) => [fact.fullPath, fact]));
  const boundFactPaths = new Set([...comparison.matches, ...comparison.mismatches].map((item) => item.factPath));
  const matches = comparison.matches.map((item) => {
    const binding = bindingsById.get(item.evidenceId);
    const fact = factsByPath.get(item.factPath);
    return compactComparisonRow({
      id: `match:${item.evidenceId}:${item.factPath}`,
      status: "match",
      evidenceId: item.evidenceId,
      factPath: item.factPath,
      label: readablePath(item.factPath),
      expected: binding ? expectedValueForBinding(binding) : "Expected",
      actual: fact?.value ?? "-",
      score: item.score,
      anchor: binding?.anchor ?? fact?.anchor
    });
  });
  const mismatches = comparison.mismatches.map((item) => {
    const binding = bindingsById.get(item.evidenceId);
    const fact = factsByPath.get(item.factPath);
    return compactComparisonRow({
      id: `mismatch:${item.evidenceId}:${item.factPath}`,
      status: "mismatch",
      evidenceId: item.evidenceId,
      factPath: item.factPath,
      label: readablePath(item.factPath),
      expected: valueSummary(item.expected),
      actual: valueSummary(item.actual),
      severity: item.severity,
      anchor: binding?.anchor ?? fact?.anchor
    });
  });
  const irrelevant = facts
    .filter((fact) => !boundFactPaths.has(fact.fullPath))
    .map((fact) => compactComparisonRow({
      id: `irrelevant:${fact.id}`,
      status: "irrelevant",
      factPath: fact.fullPath,
      label: fact.label,
      expected: "Irrelevant",
      actual: fact.value,
      anchor: fact.anchor
    }));
  return compactRuntimeComparisonViewModel({
    expectedSourceId: comparison.expectedSourceId,
    actualSourceId: comparison.actualSourceId,
    nodeId: comparison.nodeId,
    confidence: comparison.confidence,
    matches,
    mismatches,
    irrelevant,
    rows: [...mismatches, ...matches, ...irrelevant]
  });
}

export function expectedValueForBinding(binding: NodeEvidenceBinding): string {
  if (binding.expectedValue !== undefined) return valueSummary(binding.expectedValue);
  const comparator = binding.comparator;
  if (comparator.kind === "equals" || comparator.kind === "not_equals") return valueSummary(comparator.value);
  if (comparator.kind === "numeric") return `${comparator.operator} ${comparator.value}`;
  if (comparator.kind === "exists") return "Exists";
  if (comparator.kind === "changed") return "Changed";
  return `Custom ${comparator.comparatorId}`;
}

export function comparatorMatches(comparator: NodeEvidenceBinding["comparator"], actual: unknown): boolean {
  if (comparator.kind === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (comparator.kind === "equals") return valuesEqual(actual, comparator.value);
  if (comparator.kind === "not_equals") return !valuesEqual(actual, comparator.value);
  if (comparator.kind === "numeric") return typeof actual === "number" && numericComparatorMatches(actual, comparator.operator, comparator.value);
  if (comparator.kind === "changed") return actual !== undefined;
  return true;
}

export function numericComparatorMatches(actual: number, operator: NumericComparatorOperator, expected: number): boolean {
  if (operator === ">") return actual > expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  if (operator === "==") return actual === expected;
  return actual !== expected;
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function comparisonConfidence(matches: number, mismatches: number): number | undefined {
  const total = matches + mismatches;
  return total ? matches / total : undefined;
}

export function isNodeStateRuntimeComparison(value: unknown): value is NodeStateRuntimeComparison {
  const record = objectRecord(value);
  return Boolean(
    record
    && stringValue(record.expectedSourceId)
    && stringValue(record.actualSourceId)
    && stringValue(record.nodeId)
    && record.phase === "actual_output"
    && Array.isArray(record.matches)
    && Array.isArray(record.mismatches)
  );
}

export function compactComparisonRow(value: Record<string, unknown>): NodeStateRuntimeComparisonRow {
  return compactObject(value) as unknown as NodeStateRuntimeComparisonRow;
}

export function compactRuntimeComparisonViewModel(value: Record<string, unknown>): NodeStateRuntimeComparisonViewModel {
  return compactObject(value) as unknown as NodeStateRuntimeComparisonViewModel;
}
