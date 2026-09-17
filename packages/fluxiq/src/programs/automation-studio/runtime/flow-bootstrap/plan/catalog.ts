// Building the context a Bootstrap call receives: the output schema plus a
// byte-bounded node catalog, ranked by the instruction and compacted so each
// entry carries only what a provider needs to select, wire and parameterize a
// node.
//
// The nodes an instruction requires are reserved first, each in its condensed
// form, and only then sent whole while the budget allows. A Flow cannot be
// created without them, so the text that helps a provider author a value must
// never be what leaves one out: on 2026-09-16 the web domain's longer
// parameter descriptions pushed the required end node out of a 3,000-token
// catalog, and every Flow creation in that context was refused.
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
  // Keyed by definition id. The catalog's JSON is "[", the entries joined by
  // ",", then "]", which is what usedBytes counts.
  const selected = new Map<string, AutomationStudioFlowBootstrapCatalogEntry>();
  const missingRequiredTerms: string[] = [];
  let usedBytes = 2;
  const append = (definition: AutomationStudioNodeDefinition, form: CatalogEntryForm): boolean => {
    if (selected.has(definition.id)) return true;
    const entry = compactDefinition(definition, form);
    const addedBytes = catalogEntryBytes(entry) + (selected.size ? 1 : 0);
    if (selected.size >= maxCatalogEntries
      || usedBytes + addedBytes > byteBudget) return false;
    selected.set(definition.id, entry);
    usedBytes += addedBytes;
    return true;
  };
  const reserved: AutomationStudioNodeDefinition[] = [];
  for (const required of selection.required) {
    if (!required.definition || !append(required.definition, "condensed")) missingRequiredTerms.push(required.term);
    else reserved.push(required.definition);
  }
  // A condensed entry is the whole entry with text taken out, so sending it
  // whole never costs fewer bytes. One whose growth does not fit stays
  // condensed, and a later, smaller one may still grow.
  for (const definition of reserved) {
    const whole = compactDefinition(definition, "whole");
    const growth = catalogEntryBytes(whole) - catalogEntryBytes(selected.get(definition.id)!);
    if (usedBytes + growth > byteBudget) continue;
    selected.set(definition.id, whole);
    usedBytes += growth;
  }
  // Preferred for a declared tag the instruction used: placed before the rest,
  // but never essential, so one that does not fit fails nothing.
  for (const definition of selection.preferred) append(definition, "whole");
  for (const definition of selection.ranked) append(definition, "whole");
  const nodeCatalog = [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
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
 * A whole entry keeps a node's description, which is what a provider chooses
 * the node by, up to 240 characters. A structured parameter's description and
 * example are what the provider authors the value from, so a whole entry sends
 * them for object, json and array parameters only: the description up to 600
 * characters, and the example only when its JSON fits in 600 bytes whole.
 *
 * A condensed entry is what a required node is reserved as: its description up
 * to 80 characters and no parameter description or example, which was every
 * entry's shape before structured text was sent. Its ports, parameter ids,
 * types, defaults, options, constraints and output action are unchanged, so a
 * plan built from it validates the same way.
 *
 * A description cut short ends in "...". Everything sent counts against the
 * catalog byte budget.
 */
const CATALOG_TEXT_LIMITS = {
  labelCharacters: 100,
  descriptionCharacters: 240,
  condensedDescriptionCharacters: 80,
  parameterDescriptionCharacters: 600,
  parameterExampleBytes: 600
} as const;

type CatalogEntryForm = "whole" | "condensed";

const STRUCTURED_PARAMETER_TYPES: ReadonlySet<AutomationNodeParameter["valueType"]> = new Set(["object", "json", "array"]);

function catalogEntryBytes(entry: AutomationStudioFlowBootstrapCatalogEntry): number {
  return Buffer.byteLength(JSON.stringify(entry), "utf8");
}

function compactDefinition(definition: AutomationStudioNodeDefinition, form: CatalogEntryForm): AutomationStudioFlowBootstrapCatalogEntry {
  const descriptionCharacters = form === "whole"
    ? CATALOG_TEXT_LIMITS.descriptionCharacters
    : CATALOG_TEXT_LIMITS.condensedDescriptionCharacters;
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label.slice(0, CATALOG_TEXT_LIMITS.labelCharacters),
    description: boundedText(definition.description, descriptionCharacters),
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: definition.parameters.map((parameter) => compactParameter(parameter, form)),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
}

function compactParameter(parameter: AutomationNodeParameter, form: CatalogEntryForm): AutomationStudioFlowBootstrapCatalogEntry["parameters"][number] {
  const structured = form === "whole" && STRUCTURED_PARAMETER_TYPES.has(parameter.valueType);
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
