// Building the context a Bootstrap call receives: the output schema plus a
// byte-bounded node catalog, ranked by the instruction and compacted so each
// entry carries only what a provider needs to select and wire a node.
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry, AutomationStudioFlowBootstrapContext } from "./contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } from "./output-schema.ts";
import { rankBootstrapDefinitions } from "./ranking.ts";

export function buildAutomationStudioFlowBootstrapContext(input: {
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  instructionText?: string;
  maxCatalogBytes?: number;
  maxCatalogEntries?: number;
}): AutomationStudioFlowBootstrapContext {
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  const definitions = registry.list(input.resolution).sort((left, right) => left.id.localeCompare(right.id));
  const byteBudget = Math.max(0, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes,
    Math.trunc(input.maxCatalogBytes ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes)
  ));
  const selection = rankBootstrapDefinitions(definitions, input.instructionText ?? "");
  const maxCatalogEntries = Math.max(1, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries,
    Math.trunc(input.maxCatalogEntries ?? AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries)
  ));
  const nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[] = [];
  const selectedIds = new Set<string>();
  const missingRequiredTerms: string[] = [];
  let usedBytes = 2;
  const append = (definition: AutomationStudioNodeDefinition): boolean => {
    if (selectedIds.has(definition.id)) return true;
    const entry = compactDefinition(definition);
    const entryBytes = Buffer.byteLength(JSON.stringify(entry), "utf8") + (nodeCatalog.length ? 1 : 0);
    if (nodeCatalog.length >= maxCatalogEntries
      || usedBytes + entryBytes > byteBudget) return false;
    nodeCatalog.push(entry);
    selectedIds.add(definition.id);
    usedBytes += entryBytes;
    return true;
  };
  for (const required of selection.required) {
    if (!required.definition || !append(required.definition)) missingRequiredTerms.push(required.term);
  }
  for (const definition of selection.ranked) append(definition);
  nodeCatalog.sort((left, right) => left.id.localeCompare(right.id));
  return {
    outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
    nodeCatalog,
    catalogTruncated: nodeCatalog.length < definitions.length,
    catalogSelection: {
      byteBudget,
      usedBytes,
      requiredTerms: selection.required.map((item) => item.term),
      missingRequiredTerms
    }
  };
}

function compactDefinition(definition: AutomationStudioNodeDefinition): AutomationStudioFlowBootstrapCatalogEntry {
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label.slice(0, 100),
    description: definition.description.slice(0, 80),
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: definition.parameters.map((parameter) => ({
      id: parameter.id,
      type: parameter.valueType,
      ...(parameter.required === true ? { required: true as const } : {}),
      ...(parameter.allowStateBinding === false ? { stateBindable: false as const } : {}),
      ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
      ...(parameter.options ? { options: parameter.options.map((option) => option.value) } : {}),
      ...(parameter.constraints ? { constraints: parameter.constraints } : {})
    })),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
}
