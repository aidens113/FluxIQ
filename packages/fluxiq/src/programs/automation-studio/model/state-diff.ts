import type { StateDelta, StateSnapshot, StateValue } from "./state";

export type StateDiffOptions = {
  includeStable?: boolean;
};

export function diffStateSnapshots(previous: StateSnapshot, current: StateSnapshot, options: StateDiffOptions = {}): StateDelta[] {
  const deltas: StateDelta[] = [];
  const namespaces = new Set([...Object.keys(previous.namespaces), ...Object.keys(current.namespaces)]);
  for (const namespace of [...namespaces].sort()) {
    const previousValues = previous.namespaces[namespace]?.values ?? {};
    const currentValues = current.namespaces[namespace]?.values ?? {};
    const paths = new Set([...Object.keys(previousValues), ...Object.keys(currentValues)]);
    for (const path of [...paths].sort()) {
      const before = previousValues[path];
      const after = currentValues[path];
      const change = classifyStateChange(before, after);
      if (change === "stable" && !options.includeStable) continue;
      deltas.push({
        namespace,
        path,
        ...(before !== undefined ? { previous: before } : {}),
        ...(after !== undefined ? { current: after } : {}),
        change,
        confidence: Math.min(before?.confidence ?? 1, after?.confidence ?? 1)
      });
    }
  }
  return deltas;
}

export function applyStateDeltas(snapshot: StateSnapshot, deltas: StateDelta[], timestamp = Date.now()): StateSnapshot {
  const next: StateSnapshot = structuredClone({ ...snapshot, timestamp });
  for (const delta of deltas) {
    const namespace = next.namespaces[delta.namespace] ?? {
      schemaId: delta.namespace,
      schemaVersion: "0.1",
      values: {}
    };
    next.namespaces[delta.namespace] = namespace;
    if (delta.change === "removed") delete namespace.values[delta.path];
    else if (delta.current) namespace.values[delta.path] = structuredClone(delta.current);
  }
  return next;
}

export function summarizeStateDeltas(deltas: StateDelta[]): Record<StateDelta["change"], number> {
  const summary = {
    added: 0,
    removed: 0,
    changed: 0,
    increased: 0,
    decreased: 0,
    became_true: 0,
    became_false: 0,
    stable: 0
  };
  for (const delta of deltas) summary[delta.change] += 1;
  return summary;
}

function classifyStateChange(previous: StateValue | undefined, current: StateValue | undefined): StateDelta["change"] {
  if (!previous && current) return "added";
  if (previous && !current) return "removed";
  if (!previous || !current) return "stable";
  if (JSON.stringify(previous.value) === JSON.stringify(current.value) && previous.type === current.type) return "stable";
  if (typeof previous.value === "number" && typeof current.value === "number") {
    if (current.value > previous.value) return "increased";
    if (current.value < previous.value) return "decreased";
  }
  if (previous.value !== true && current.value === true) return "became_true";
  if (previous.value !== false && current.value === false) return "became_false";
  return "changed";
}
