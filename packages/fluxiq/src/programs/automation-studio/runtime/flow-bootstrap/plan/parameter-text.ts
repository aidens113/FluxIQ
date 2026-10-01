// What a model is shown about one node parameter: in a catalog entry
// (`./catalog.ts`), and as the shape a refused parameter accepts in the
// feedback on a plan (`./issue-feedback.ts`). Kept in one place so the two can
// never describe a parameter differently.
//
// A structured parameter's description and example are what a provider
// authors the value from, so they are sent for object, json and array
// parameters: the description whole, and the example whole. A scalar
// parameter's description is not sent; its type, default, options and
// constraints say what it takes.
//
// A `record-output` parameter is the exception, because its shape is Core's
// own record-set contract and a model that has not seen it writes keys the
// parser refuses. It carries that contract (`./record-output-contract.ts`)
// after the node's own words, with an example.
//
// **Nothing is cut** (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER
// OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION"). Until then a
// description stopped at 900 characters, an example over 600 bytes was left
// out, and a condensed form sent no authoring text at all. The account still
// says which parameters' text a model was not given -- now only an example that
// cannot be written as JSON -- and `./catalog.ts` carries that list to the model
// in `catalogSelection.withheldParameterText`.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "./contracts.ts";
import { automationStudioFlowBootstrapRecordOutputContract } from "./record-output-contract.ts";

export type AutomationStudioFlowBootstrapParameterText = AutomationStudioFlowBootstrapCatalogEntry["parameters"][number];

const STRUCTURED_PARAMETER_TYPES: ReadonlySet<AutomationNodeParameter["valueType"]> = new Set(["object", "json", "array"]);

/**
 * One parameter as a catalog entry lists it, and whether any of its authoring
 * text could not be carried.
 *
 * `withheld` is true when the parameter has authoring text a model would write
 * its value from and the entry does not carry all of it. A scalar parameter is
 * never withheld -- no entry has ever sent a scalar's description, and saying so
 * of every number and string in the library would be noise rather than a
 * finding.
 */
export function automationStudioFlowBootstrapParameterTextAccount(
  definition: AutomationStudioNodeDefinition,
  parameter: AutomationNodeParameter
): { parameter: AutomationStudioFlowBootstrapParameterText; withheld: boolean } {
  const text = parameter.ui?.control === "record-output"
    ? recordOutputText(definition, parameter)
    : structuredText(parameter);
  return {
    parameter: {
      id: parameter.id,
      type: parameter.valueType,
      ...(parameter.required === true ? { required: true as const } : {}),
      ...(parameter.allowStateBinding === false ? { stateBindable: false as const } : {}),
      ...(parameter.defaultValue !== undefined ? { defaultValue: parameter.defaultValue } : {}),
      ...(parameter.options ? { options: parameter.options.map((option) => option.value) } : {}),
      ...(parameter.constraints ? { constraints: parameter.constraints } : {}),
      ...(text.description !== undefined ? { description: text.description } : {}),
      ...(text.example !== undefined ? { example: text.example } : {})
    },
    withheld: withholdsText(definition, parameter, text)
  };
}

/** One parameter as a catalog entry lists it. */
export function automationStudioFlowBootstrapParameterText(
  definition: AutomationStudioNodeDefinition,
  parameter: AutomationNodeParameter
): AutomationStudioFlowBootstrapParameterText {
  return automationStudioFlowBootstrapParameterTextAccount(definition, parameter).parameter;
}

type ParameterText = { description?: string; example?: JsonValue };

/**
 * Whether the entry left any of a parameter's authoring text behind, decided by
 * comparing what was sent against the whole of what the parameter has to give.
 */
function withholdsText(
  definition: AutomationStudioNodeDefinition,
  parameter: AutomationNodeParameter,
  sent: ParameterText
): boolean {
  if (parameter.ui?.control !== "record-output" && !STRUCTURED_PARAMETER_TYPES.has(parameter.valueType)) return false;
  const whole = wholeDescription(definition, parameter);
  if (whole !== undefined && sent.description !== whole) return true;
  return parameter.example !== undefined && sent.example === undefined;
}

/** Every character of description this parameter has to give. */
function wholeDescription(definition: AutomationStudioNodeDefinition, parameter: AutomationNodeParameter): string | undefined {
  const own = parameter.description?.trim();
  if (parameter.ui?.control !== "record-output") return own ? parameter.description : undefined;
  const contract = automationStudioFlowBootstrapRecordOutputContract(definition).text;
  return own ? `${own} ${contract}` : contract;
}

function structuredText(parameter: AutomationNodeParameter): ParameterText {
  if (!STRUCTURED_PARAMETER_TYPES.has(parameter.valueType)) return {};
  const description = parameter.description?.trim() ? parameter.description : undefined;
  const example = jsonExample(parameter.example);
  return { ...(description !== undefined ? { description } : {}), ...(example !== undefined ? { example } : {}) };
}

// The node's own words first, then the contract a value is refused against.
function recordOutputText(definition: AutomationStudioNodeDefinition, parameter: AutomationNodeParameter): ParameterText {
  const contract = automationStudioFlowBootstrapRecordOutputContract(definition);
  const own = parameter.description?.trim() ?? "";
  return { description: own ? `${own} ${contract.text}` : contract.text, example: contract.example };
}

// An example is sent whole. One that cannot be serialised -- a cycle or a
// bigint, which JSON.stringify reports as a TypeError -- is not sent; any other
// failure is not the example's and is thrown.
function jsonExample(example: JsonValue | undefined): JsonValue | undefined {
  if (example === undefined) return undefined;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(example);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
  return serialized !== undefined ? JSON.parse(serialized) as JsonValue : undefined;
}
