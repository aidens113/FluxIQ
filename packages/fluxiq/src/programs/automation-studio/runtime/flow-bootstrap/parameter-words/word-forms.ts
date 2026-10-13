// The lines a node takes one written word in, read from the node's own schema
// (t514).
//
// A model that writes `state: absent` on a wait step meant the wait's
// condition, which that node takes as `wait: condition=absent`. Where the word
// belongs is not a guess when the node declares it: a scalar parameter lists
// the words it takes as its `options`, and a node may publish the JSON Schema
// its parameters are checked against under `metadata.parameterSchema`, whose
// `enum`s list the words a parameter, or a field of a structured parameter,
// takes. This reads only those declarations. A word nothing declares has no
// form, and the caller then says nothing about one.
//
// Each form is written as a Flow script line: `<parameter>: <word>` for a
// parameter that takes the word itself, and `<parameter>: <field>=<word>` for a
// field of a structured parameter -- the pair form `../authoring/values.ts`
// reads. A parameter the model never writes (`shownToModel: false`) gives none.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

/** Where a node may publish the JSON Schema of its parameters (header). */
const PARAMETER_SCHEMA_KEY = "parameterSchema";

/** Every script line, in declaration order, in which the node takes `word`; empty when it declares none. */
export function automationStudioParameterWordForms(definition: AutomationStudioNodeDefinition, word: string): string[] {
  const written = word.trim().toLowerCase();
  if (!written) return [];
  const schema = objectAt(objectAt(definition.metadata, PARAMETER_SCHEMA_KEY), "properties");
  const forms: string[] = [];
  for (const parameter of definition.parameters) {
    if (parameter.shownToModel === false) continue;
    const option = parameter.options?.find((candidate) => candidate.value.toLowerCase() === written || candidate.label.toLowerCase() === written);
    if (option) forms.push(`${parameter.id}: ${option.value}`);
    const declared = objectAt(schema, parameter.id);
    const own = enumWord(declared, written);
    if (own !== undefined && !option) forms.push(`${parameter.id}: ${own}`);
    for (const [field, fieldSchema] of Object.entries(objectAt(declared, "properties") ?? {})) {
      const taken = enumWord(isObject(fieldSchema) ? fieldSchema : undefined, written);
      if (taken !== undefined) forms.push(`${parameter.id}: ${field}=${taken}`);
    }
  }
  return [...new Set(forms)];
}

/** The declared word a schema's `enum` lists for `written`, compared without case. */
function enumWord(schema: JsonObject | undefined, written: string): string | undefined {
  const values = schema?.enum;
  if (!Array.isArray(values)) return undefined;
  return values.find((value): value is string => typeof value === "string" && value.toLowerCase() === written);
}

function objectAt(value: JsonValue | undefined, key: string): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const found = value[key];
  return isObject(found) ? found : undefined;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
