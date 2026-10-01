// Building the context a Bootstrap call receives: the output schema plus the
// node catalog -- every node the resolution offers, in catalog order (by id),
// each entry whole.
//
// **Nothing is ranked, cut or left out** (user, 2026-09-30: "Remove ANY AND ALL
// LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION OR
// USE ANY RANKING ALGORITHM"). Until then the catalog was ranked against the
// instruction and filled to a byte budget (as little as 4,000 tokens for a first
// live bootstrap) and an entry cap (64 for an evidence-guided build), with a
// node's label cut at 100 characters, its description at 240, and a condensed
// form for a required node that did not fit whole. The only bound on the
// request is now the model's context window, which refuses an oversized request
// loudly before it is sent and never trims it (`../../llm/harness/run.ts`).
//
// The instruction is still read for one thing: a capability it asks for that
// no offered node provides (`./required-terms.ts`), which no catalog could
// supply and which refuses the build before a provider is called.
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "../../../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry, AutomationStudioFlowBootstrapContext } from "./contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA, automationStudioFlowBootstrapOutputSchema } from "./output-schema.ts";
import { automationStudioFlowBootstrapParameterTextAccount } from "./parameter-text.ts";
import { automationStudioFlowBootstrapRequiredTerms } from "./required-terms.ts";
import type { AutomationStudioFlowBootstrapSizeLimits } from "./size-limits.ts";

export function buildAutomationStudioFlowBootstrapContext(input: {
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  instructionText?: string;
  /** Where the Flow starts, when the build was told (`../start-location.ts`). Carried into the context unread. */
  startLocation?: string;
  /**
   * The Flow's size bounds (`./size-limits.ts`), which the output schema's
   * node and edge counts are. Omitted, the schema is the default-size constant.
   * A size other than the default is also carried as `maxNodesPerSubflow`, so
   * a provider adapter holding only the request sizes the schema it checks and
   * the plan it parses the same way (`automationStudioFlowBootstrapSizeLimitsOfContext`).
   */
  size?: AutomationStudioFlowBootstrapSizeLimits;
}): AutomationStudioFlowBootstrapContext {
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  const definitions = registry.list(input.resolution).sort((left, right) => left.id.localeCompare(right.id));
  const compacted = definitions.map(catalogEntry);
  const nodeCatalog = compacted.map((item) => item.entry);
  const withheldParameterText = compacted.flatMap((item) => item.withheld.map((parameterId) => `${item.entry.id}.${parameterId}`));
  const required = automationStudioFlowBootstrapRequiredTerms(definitions, input.instructionText ?? "");
  return {
    outputSchema: input.size ? automationStudioFlowBootstrapOutputSchema(input.size) : AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
    ...(input.size && input.size.maxNodesPerSubflow !== AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue ? { maxNodesPerSubflow: input.size.maxNodesPerSubflow } : {}),
    nodeCatalog,
    // Placed before the catalog's own fields for a reader. Where the Flow
    // starts is not a node, and is carried whatever the catalog holds.
    ...(input.startLocation === undefined ? {} : { startLocation: input.startLocation }),
    // Every offered node is in the catalog, so it is never truncated. Kept so
    // the request reads as it always did to a provider and to its pre-flight.
    catalogTruncated: false,
    catalogSelection: {
      usedBytes: Buffer.byteLength(JSON.stringify(nodeCatalog), "utf8"),
      requiredTerms: required.map((item) => item.term),
      missingRequiredTerms: required.filter((item) => !item.provided).map((item) => item.term),
      ...(withheldParameterText.length ? { withheldParameterText } : {})
    }
  };
}

/** One entry, with the parameters whose authoring text it could not carry (an example that is not JSON). */
type CatalogEntryAccount = { entry: AutomationStudioFlowBootstrapCatalogEntry; withheld: string[] };

/**
 * A definition as the catalog lists it: its label and description whole, every
 * parameter with its authoring text whole (`./parameter-text.ts`), its ports,
 * capabilities and output action.
 */
function catalogEntry(definition: AutomationStudioNodeDefinition): CatalogEntryAccount {
  const parameters = definition.parameters.map((parameter) => automationStudioFlowBootstrapParameterTextAccount(definition, parameter));
  const entry: AutomationStudioFlowBootstrapCatalogEntry = {
    id: definition.id,
    version: definition.version,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    capabilities: Object.entries(definition.capabilities).filter(([, enabled]) => enabled === true).map(([key]) => key).sort(),
    inputs: definition.inputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.required === true ? { required: true as const } : {}), ...(port.multiple === true ? { multiple: true as const } : {}) })),
    outputs: definition.outputs.map((port) => ({ id: port.id, type: port.valueType, ...(port.multiple === true ? { multiple: true as const } : {}) })),
    parameters: parameters.map((account) => account.parameter),
    ...(definition.outputAction ? { outputAction: {
      required: true as const,
      ...(definition.outputAction.fixedOutputId ? { fixed: definition.outputAction.fixedOutputId } : {}),
      ...(definition.outputAction.allowedOutputIds ? { allowed: definition.outputAction.allowedOutputIds } : {})
    } } : {})
  };
  return { entry, withheld: parameters.filter((account) => account.withheld).map((account) => account.parameter.id) };
}
