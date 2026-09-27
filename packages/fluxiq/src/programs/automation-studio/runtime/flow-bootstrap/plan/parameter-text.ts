// What a model is shown about one node parameter: in a catalog entry, whole or
// condensed (`./catalog.ts`), and as the shape a refused parameter accepts in
// the feedback on a plan (`./issue-feedback.ts`). Kept in one place so the two
// can never describe a parameter differently.
//
// A structured parameter's description and example are what a provider
// authors the value from, so a whole entry sends them for object, json and
// array parameters only: the description up to the bound below, and the
// example only when its JSON fits in 600 bytes whole. A condensed entry sends
// neither, which was every entry's shape before structured text was sent.
//
// A `record-output` parameter is the exception, because its shape is Core's
// own record-set contract and a model that has not seen it writes keys the
// parser refuses. Both forms carry that contract
// (`./record-output-contract.ts`): a whole entry after the node's own words
// and with an example, a condensed one in brief.
//
// **Whatever a form does not carry in full, it says it did not.** A bound cuts
// in silence: a grammar past the bound loses its last clauses and ends in
// "...", a condensed entry sends no authoring text at all, and both leave a
// model writing a value from a vocabulary it was never shown. Four campaigns
// of the web domain's extraction grammar were spent deleting measured clauses
// to stay inside this bound, and no artifact of any of them recorded that a
// clause had gone. So the account (`automationStudioFlowBootstrapParameterTextAccount`)
// says which parameters' text is incomplete, and `./catalog.ts` carries the
// list to the model in `catalogSelection.withheldParameterText`.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "./contracts.ts";
import { automationStudioFlowBootstrapRecordOutputContract } from "./record-output-contract.ts";

/** How much of a definition's text one catalog entry carries. */
export type AutomationStudioFlowBootstrapCatalogEntryForm = "whole" | "condensed";

export type AutomationStudioFlowBootstrapParameterText = AutomationStudioFlowBootstrapCatalogEntry["parameters"][number];

// 900, and the figure is measured rather than guessed. It was 600, then 700 as
// an experiment: a domain's grammar for `extractList` sat at 596 of 600, so the
// one sentence that could tell a model what a page budget is *for* did not fit.
// The experiment answered yes -- that clause changed what the model wrote -- and
// the grammar then sat at 696 of 700, having paid for two further measured
// clauses by deleting two others.
//
// **What the measurement showed on 2026-09-26.** The bound was being defended
// as though catalog bytes were scarce, and in the path that builds Flows live
// they are not. An evidence-guided build is given `maxInputTokens: 16_000`
// (`runtime/service.ts`), which is a catalog byte budget of 42,087; the whole
// web domain's chosen catalog uses 7,329 of it -- 17 per cent. The 696
// characters of that grammar are 0.05 per cent of a build that spent 441,531
// input tokens. So four campaigns of deletions were paid against a constraint
// that was not binding, while 34,758 bytes of the budget went unspent.
//
// This raises the ceiling and adds nothing: a domain that writes 200 characters
// still costs 200. What it does cost is in the *other* path -- a first-live
// bootstrap is given 4,000 tokens, a catalog budget of about 6,087 of which the
// same domain uses 5,619 -- where a longer description can push a ranked node
// out of the catalog entirely, and can drop a preferred node from its whole form
// to its condensed one, which carries no parameter text at all. A domain
// spending this room should measure both paths, and
// `catalogSelection.withheldParameterText` now says when it has overspent.
const PARAMETER_DESCRIPTION_CHARACTERS = 900;
const PARAMETER_EXAMPLE_BYTES = 600;

const STRUCTURED_PARAMETER_TYPES: ReadonlySet<AutomationNodeParameter["valueType"]> = new Set(["object", "json", "array"]);

/**
 * One parameter as a catalog entry lists it, and whether this form carries its
 * authoring text in full.
 *
 * `withheld` is true when the parameter has authoring text a model would write
 * its value from and this form does not send all of it: a description cut by
 * the character bound, a description the form omits outright, or an example the
 * parameter declares and the form does not send. A scalar parameter is never
 * withheld -- no form has ever sent a scalar's description, and saying so of
 * every number and string in the library would be noise rather than a finding.
 */
export function automationStudioFlowBootstrapParameterTextAccount(
  definition: AutomationStudioNodeDefinition,
  parameter: AutomationNodeParameter,
  form: AutomationStudioFlowBootstrapCatalogEntryForm
): { parameter: AutomationStudioFlowBootstrapParameterText; withheld: boolean } {
  const text = parameter.ui?.control === "record-output"
    ? recordOutputText(definition, parameter, form)
    : structuredText(parameter, form);
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
  parameter: AutomationNodeParameter,
  form: AutomationStudioFlowBootstrapCatalogEntryForm
): AutomationStudioFlowBootstrapParameterText {
  return automationStudioFlowBootstrapParameterTextAccount(definition, parameter, form).parameter;
}

/** Text cut to a number of characters, ending in "..." where it was cut. */
export function boundedCatalogText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return limit > 3 ? `${value.slice(0, limit - 3)}...` : "";
}

type ParameterText = { description?: string; example?: JsonValue };

/**
 * Whether this form left any of a parameter's authoring text behind.
 *
 * Decided by comparing what was sent against the whole of what the parameter
 * has to give, so one rule covers all three cases -- the bound cut it, the
 * condensed form omitted it, the example was too large -- and a fourth case
 * added later cannot slip past by not being enumerated.
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

/** Every character of description this parameter has to give, before any bound. */
function wholeDescription(definition: AutomationStudioNodeDefinition, parameter: AutomationNodeParameter): string | undefined {
  const own = parameter.description?.trim();
  if (parameter.ui?.control !== "record-output") return own ? parameter.description : undefined;
  const contract = automationStudioFlowBootstrapRecordOutputContract(definition).text;
  return own ? `${own} ${contract}` : contract;
}

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
