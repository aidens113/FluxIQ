// Building the context a Bootstrap call receives: the output schema plus a
// byte-bounded node catalog, ranked by the instruction and compacted so each
// entry carries only what a provider needs to select, wire and parameterize a
// node.
import type { JsonValue } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationNodeParameter, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
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
  // Preferred for a declared tag the instruction used: placed before the rest,
  // but never essential, so one that does not fit fails nothing.
  for (const definition of selection.preferred) append(definition);
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

/**
 * How much of a definition's text one catalog entry carries.
 *
 * A node's description is what a provider chooses the node by, so it is kept
 * whole up to 240 characters. A structured parameter's description and example
 * are what the provider authors the value from, so they are sent for object,
 * json and array parameters only: the description up to 600 characters, and the
 * example only when its JSON fits in 600 bytes whole. A description cut short
 * ends in "...". Everything sent still counts against the catalog byte budget,
 * so a longer entry can leave a lower-ranked one out.
 */
const CATALOG_TEXT_LIMITS = {
  labelCharacters: 100,
  descriptionCharacters: 240,
  parameterDescriptionCharacters: 600,
  parameterExampleBytes: 600
} as const;

const STRUCTURED_PARAMETER_TYPES: ReadonlySet<AutomationNodeParameter["valueType"]> = new Set(["object", "json", "array"]);

function compactDefinition(definition: AutomationStudioNodeDefinition): AutomationStudioFlowBootstrapCatalogEntry {
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label.slice(0, CATALOG_TEXT_LIMITS.labelCharacters),
    description: boundedText(definition.description, CATALOG_TEXT_LIMITS.descriptionCharacters),
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: definition.parameters.map(compactParameter),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
}

function compactParameter(parameter: AutomationNodeParameter): AutomationStudioFlowBootstrapCatalogEntry["parameters"][number] {
  const structured = STRUCTURED_PARAMETER_TYPES.has(parameter.valueType);
  const description = structured && parameter.description?.trim()
    ? boundedText(parameter.description, CATALOG_TEXT_LIMITS.parameterDescriptionCharacters)
    : undefined;
  const example = structured ? boundedExample(parameter.example) : undefined;
  return {
    id: parameter.id,
    type: parameter.valueType,
    ...(parameter.required === true ? { required: true as const } : {}),
    ...(parameter.allowStateBinding === false ? { stateBindable: false as const } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.options ? { options: parameter.options.map((option) => option.value) } : {}),
    ...(parameter.constraints ? { constraints: parameter.constraints } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(example !== undefined ? { example } : {})
  };
}

function boundedText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

// An example is sent whole or not at all: a cut example is not a valid value.
function boundedExample(example: JsonValue | undefined): JsonValue | undefined {
  if (example === undefined) return undefined;
  try {
    const serialized = JSON.stringify(example);
    return serialized !== undefined && Buffer.byteLength(serialized, "utf8") <= CATALOG_TEXT_LIMITS.parameterExampleBytes
      ? JSON.parse(serialized) as JsonValue
      : undefined;
  } catch {
    return undefined;
  }
}
