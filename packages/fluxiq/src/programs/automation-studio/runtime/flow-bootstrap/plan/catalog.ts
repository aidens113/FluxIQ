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
// catalog, and every Flow creation in that context was refused. The nodes it
// prefers come next, whole or else condensed, and then the rest, whole.
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry, AutomationStudioFlowBootstrapContext } from "./contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } from "./output-schema.ts";
import {
  automationStudioFlowBootstrapParameterText,
  boundedCatalogText,
  type AutomationStudioFlowBootstrapCatalogEntryForm
} from "./parameter-text.ts";
import { rankBootstrapDefinitions } from "./ranking.ts";

export function buildAutomationStudioFlowBootstrapContext(input: {
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  instructionText?: string;
  maxCatalogBytes?: number;
  maxCatalogEntries?: number;
  /** Where the Flow starts, when the build was told (`../start-location.ts`). Carried into the context unread. */
  startLocation?: string;
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
  const append = (definition: AutomationStudioNodeDefinition, form: AutomationStudioFlowBootstrapCatalogEntryForm): boolean => {
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
  // condensed when it does not fit whole, but never essential, so one that does
  // not fit either way fails nothing. A scraping instruction prefers the list
  // extraction this way, and dropping it outright near the budget left the
  // model a catalog with nothing to scrape with.
  for (const definition of selection.preferred) {
    if (!append(definition, "whole")) append(definition, "condensed");
  }
  for (const definition of selection.ranked) append(definition, "whole");
  const nodeCatalog = [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
    nodeCatalog,
    // Placed before the catalog's own fields for a reader, and carried whatever
    // the catalog budget did: where the Flow starts is not a node, so the
    // byte budget that decides which nodes fit has nothing to say about it.
    ...(input.startLocation === undefined ? {} : { startLocation: input.startLocation }),
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
 * the node by, up to 240 characters, and each parameter's authoring text
 * (`./parameter-text.ts`).
 *
 * A condensed entry is what a required node is reserved as: its description up
 * to 80 characters and no parameter authoring text but a record output's
 * contract in brief. Its ports, parameter ids, types, defaults, options,
 * constraints and output action are unchanged, so a plan built from it
 * validates the same way.
 *
 * A description cut short ends in "...". Everything sent counts against the
 * catalog byte budget.
 */
const CATALOG_TEXT_LIMITS = {
  labelCharacters: 100,
  descriptionCharacters: 240,
  condensedDescriptionCharacters: 80
} as const;

function catalogEntryBytes(entry: AutomationStudioFlowBootstrapCatalogEntry): number {
  return Buffer.byteLength(JSON.stringify(entry), "utf8");
}

function compactDefinition(definition: AutomationStudioNodeDefinition, form: AutomationStudioFlowBootstrapCatalogEntryForm): AutomationStudioFlowBootstrapCatalogEntry {
  const descriptionCharacters = form === "whole"
    ? CATALOG_TEXT_LIMITS.descriptionCharacters
    : CATALOG_TEXT_LIMITS.condensedDescriptionCharacters;
  return {
    id: definition.id,
    version: definition.version,
    label: definition.label.slice(0, CATALOG_TEXT_LIMITS.labelCharacters),
    description: boundedCatalogText(definition.description, descriptionCharacters),
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: definition.parameters.map((parameter) => automationStudioFlowBootstrapParameterText(definition, parameter, form)),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
}
