// What a model is shown about one node parameter: in a catalog entry, whole or
// condensed (`./catalog.ts`), and as the shape a refused parameter accepts in
// the feedback on a plan (`./issue-feedback.ts`). Kept in one place so the two
// can never describe a parameter differently.
//
// A structured parameter's description and example are what a provider
// authors the value from, so a whole entry sends them for object, json and
// array parameters only: the description up to 600 characters, and the
// example only when its JSON fits in 600 bytes whole. A condensed entry sends
// neither, which was every entry's shape before structured text was sent.
//
// A `record-output` parameter is the exception, because its shape is Core's
// own record-set contract and a model that has not seen it writes keys the
// parser refuses. Both forms carry that contract
// (`./record-output-contract.ts`): a whole entry after the node's own words
// and with an example, a condensed one in brief.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "./contracts.ts";
import { automationStudioFlowBootstrapRecordOutputContract } from "./record-output-contract.ts";

/** How much of a definition's text one catalog entry carries. */
export type AutomationStudioFlowBootstrapCatalogEntryForm = "whole" | "condensed";

export type AutomationStudioFlowBootstrapParameterText = AutomationStudioFlowBootstrapCatalogEntry["parameters"][number];

const PARAMETER_DESCRIPTION_CHARACTERS = 600;
const PARAMETER_EXAMPLE_BYTES = 600;

const STRUCTURED_PARAMETER_TYPES: ReadonlySet<AutomationNodeParameter["valueType"]> = new Set(["object", "json", "array"]);

/** One parameter as a catalog entry lists it. */
export function automationStudioFlowBootstrapParameterText(
  definition: AutomationStudioNodeDefinition,
  parameter: AutomationNodeParameter,
  form: AutomationStudioFlowBootstrapCatalogEntryForm
): AutomationStudioFlowBootstrapParameterText {
  const text = parameter.ui?.control === "record-output"
    ? recordOutputText(definition, parameter, form)
    : structuredText(parameter, form);
  return {
    id: parameter.id,
    type: parameter.valueType,
    ...(parameter.required === true ? { required: true as const } : {}),
    ...(parameter.allowStateBinding === false ? { stateBindable: false as const } : {}),
    ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
    ...(parameter.options ? { options: parameter.options.map((option) => option.value) } : {}),
    ...(parameter.constraints ? { constraints: parameter.constraints } : {}),
    ...(text.description !== undefined ? { description: text.description } : {}),
    ...(text.example !== undefined ? { example: text.example } : {})
  };
}

/** Text cut to a number of characters, ending in "..." where it was cut. */
export function boundedCatalogText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return limit > 3 ? `${value.slice(0, limit - 3)}...` : "";
}

type ParameterText = { description?: string; example?: JsonValue };

function structuredText(parameter: AutomationNodeParameter, form: AutomationStudioFlowBootstrapCatalogEntryForm): ParameterText {
  if (form !== "whole" || !STRUCTURED_PARAMETER_TYPES.has(parameter.valueType)) return {};
  const description = parameter.description?.trim() ? boundedCatalogText(parameter.description, PARAMETER_DESCRIPTION_CHARACTERS) : undefined;
  const example = boundedExample(parameter.example);
  return { ...(description !== undefined ? { description } : {}), ...(example !== undefined ? { example } : {}) };
}

// The node's own words come first and give way to the contract when the two
// do not fit, since the contract is what a value is refused against.
function recordOutputText(definition: AutomationStudioNodeDefinition, parameter: AutomationNodeParameter, form: AutomationStudioFlowBootstrapCatalogEntryForm): ParameterText {
  const contract = automationStudioFlowBootstrapRecordOutputContract(definition);
  if (form === "condensed") return { description: contract.condensedText };
  const own = boundedCatalogText(parameter.description?.trim() ?? "", PARAMETER_DESCRIPTION_CHARACTERS - contract.text.length - 1);
  return { description: own ? `${own} ${contract.text}` : contract.text, example: contract.example };
}

// An example is sent whole or not at all: a cut example is not a valid value.
// One that cannot be serialised -- a cycle or a bigint, which JSON.stringify
// reports as a TypeError -- is not sent either; any other failure is not the
// example's and is thrown.
function boundedExample(example: JsonValue | undefined): JsonValue | undefined {
  if (example === undefined) return undefined;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(example);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
  return serialized !== undefined && Buffer.byteLength(serialized, "utf8") <= PARAMETER_EXAMPLE_BYTES
    ? JSON.parse(serialized) as JsonValue
    : undefined;
}
