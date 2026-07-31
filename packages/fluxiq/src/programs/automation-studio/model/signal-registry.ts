import type { StatePathSchema, StateSnapshot, StateValue, StateValueType } from "./state";
import type { ComparatorDefinition, SignalDefinition, SignalRegistry } from "./signals";

export type SignalRegistryBuildOptions = {
  registryId: string;
  metadata?: SignalRegistry["metadata"];
};

export function buildSignalRegistryFromSchemas(schemas: StatePathSchema[], options: SignalRegistryBuildOptions): SignalRegistry {
  return {
    schemaVersion: "0.1",
    registryId: options.registryId,
    definitions: schemas.map(signalDefinitionFromSchema),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {})
  };
}

export function discoverSignalDefinitions(snapshot: StateSnapshot, registryId = "registry.discovered"): SignalRegistry {
  const definitions: SignalDefinition[] = [];
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    for (const [path, state] of Object.entries(stateNamespace.values)) {
      definitions.push({
        path: `${namespace}.${path}`,
        namespace,
        type: state.type,
        comparator: comparatorForStateType(state.type),
        defaultWeight: state.comparable === false ? 0.25 : 0.6,
        volatility: state.volatility ?? "normal",
        persistence: "snapshot",
        tags: [namespace, state.type],
        derived: false,
        ...(state.semanticRole !== undefined ? { description: state.semanticRole } : {}),
        ...(state.sensitive !== undefined ? { sensitive: state.sensitive } : {}),
        metadata: { statePath: path }
      });
    }
  }
  return { schemaVersion: "0.1", registryId, definitions };
}

export function signalDefinitionFromSchema(schema: StatePathSchema): SignalDefinition {
  const metadata = {
    ...(schema.metadata ?? {}),
    statePath: schema.path
  };
  return {
    path: `${schema.namespace}.${schema.path}`,
    namespace: schema.namespace,
    type: schema.type,
    comparator: comparatorForStateType(schema.type),
    defaultWeight: schema.permissions?.readable === false ? 0 : 0.6,
    volatility: schema.volatility ?? "normal",
    persistence: schema.persistence ?? "snapshot",
    tags: [schema.namespace, schema.type],
    ...(schema.description !== undefined ? { description: schema.description } : {}),
    ...(schema.permissions?.privileged !== undefined ? { sensitive: schema.permissions.privileged } : {}),
    metadata: schema.label !== undefined ? { ...metadata, label: schema.label } : metadata
  };
}

export function comparatorForStateType(type: StateValueType): ComparatorDefinition {
  switch (type) {
    case "number":
    case "integer": return { kind: "numeric", tolerance: 0 };
    case "json":
    case "point":
    case "rectangle":
    case "entity_ref":
    case "entity_ref_list": return { kind: "semantic" };
    case "unknown": return { kind: "custom", customComparatorId: "host.unknown" };
    default: return { kind: "exact" };
  }
}

export function signalValueFromSnapshot(snapshot: StateSnapshot, signal: Pick<SignalDefinition, "namespace" | "path">): StateValue | undefined {
  const metadataPath = signal.path.startsWith(`${signal.namespace}.`) ? signal.path.slice(signal.namespace.length + 1) : signal.path;
  return snapshot.namespaces[signal.namespace]?.values[metadataPath];
}
