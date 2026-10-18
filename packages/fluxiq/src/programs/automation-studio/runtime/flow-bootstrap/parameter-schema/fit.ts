// Whether a structured parameter value fits the JSON Schema its node publishes
// for it (lane 3, `run-mvcvzwk1-c1d869e4`). Plan validation refuses each misfit
// (`../plan/validation.ts`), which every submission is held to.
//
// A node may publish the JSON Schema its parameters are checked against under
// `metadata.parameterSchema` (`../parameter-words/word-forms.ts` reads the same
// declaration for its words). Validation used to check only a parameter's
// declared `valueType`, so `scroll: {"until": "stopsGrowing"}` was an object
// where an object belongs and was accepted, although the scroll's schema
// requires `mode` and declares no `until`. The run then dispatched a scroll the
// page could not read, 40 times a trial. This reads the declaration and refuses
// the value at submit, naming the field and what the schema allows there, so
// the builder corrects it before any trial runs.
//
// The domain's schema is the only knowledge here; nothing below knows any
// action. Read as JSON Schema reads it: `type` (one or a list), `enum`,
// `const`, and for an object `required`, `properties` and
// `additionalProperties`; for an array `items`. An object's properties are
// closed only where its schema says `additionalProperties: false`, as JSON
// Schema says -- a recorded element carries signals its schema does not list,
// and a domain closes exactly the requests whose keys it owns. A keyword this
// does not read is no constraint. A state binding anywhere inside the value is
// resolved at run time and fits wherever it sits.
//
// Each refusal is Core's own sentence and quotes only identifiers: the
// parameter's id, a field name the model wrote when it is an identifier, and
// the names and words the schema declares. Never a value, which can hold a
// secret.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

/** Where a node publishes the JSON Schema of its parameters. */
const PARAMETER_SCHEMA_KEY = "parameterSchema";
/** A name a sentence may quote: identifier characters only. */
const NAME = /^[A-Za-z0-9_.:-]{1,200}$/u;
/** How many misfits one parameter is refused with; the rest follow once these are fixed. */
const MAX_MISFITS = 5;
/** How deep a value is followed: deeper than any schema a domain writes, and bounded against a cyclic one. */
const MAX_DEPTH = 16;

type Misfit =
  | { kind: "missing"; field: string; within: string; valid: string[] }
  | { kind: "unknown"; field: string; within: string; valid: string[] }
  | { kind: "enum"; field: string; valid: string[] }
  | { kind: "type"; field: string; types: string[] };

/**
 * Where `value` does not fit the schema the node publishes for `parameterId`:
 * each misfit's field (the parameter id, then the path inside it), Core's
 * sentence for it, and the field names or words the schema allows there.
 * Empty when it fits or when the node publishes no schema for the parameter.
 * Validation refuses each as `bootstrap.parameter_schema_mismatch`
 * (`../plan/validation.ts`).
 */
export function automationStudioParameterSchemaMisfits(input: {
  definition: AutomationStudioNodeDefinition;
  parameterId: string;
  value: JsonValue;
}): { field: string; message: string; valid?: string[] }[] {
  const schema = objectAt(objectAt(input.definition.metadata, PARAMETER_SCHEMA_KEY), "properties")?.[input.parameterId];
  if (!isObject(schema)) return [];
  const misfits: Misfit[] = [];
  collect(input.value, schema, input.parameterId, misfits, 0);
  return misfits.slice(0, MAX_MISFITS).map((misfit) => ({
    field: misfit.field,
    message: sentence(misfit),
    ...("valid" in misfit && misfit.valid.length ? { valid: misfit.valid } : {})
  }));
}

function collect(value: JsonValue, schema: JsonObject, field: string, misfits: Misfit[], depth: number): void {
  if (depth > MAX_DEPTH || misfits.length >= MAX_MISFITS || isAutomationNodeParameterStateBinding(value)) return;
  const types = declaredTypes(schema.type);
  if (types.length && !types.some((type) => ofType(value, type))) {
    misfits.push({ kind: "type", field, types });
    return;
  }
  const allowed = Array.isArray(schema.enum) ? schema.enum : "const" in schema ? [schema.const as JsonValue] : undefined;
  if (allowed && !allowed.some((candidate) => same(candidate, value))) {
    misfits.push({ kind: "enum", field, valid: allowed.filter((word): word is string => typeof word === "string") });
    return;
  }
  if (Array.isArray(value)) {
    if (isObject(schema.items)) for (const [index, item] of value.entries()) collect(item, schema.items, `${field}.${index}`, misfits, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  const properties = isObject(schema.properties) ? schema.properties : {};
  const names = Object.keys(properties);
  const required = Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
  for (const name of required) {
    if (value[name] === undefined) misfits.push({ kind: "missing", field: `${field}.${name}`, within: field, valid: names });
  }
  const extra = schema.additionalProperties;
  for (const [name, item] of Object.entries(value)) {
    const declared = properties[name];
    if (isObject(declared)) collect(item, declared, `${field}.${name}`, misfits, depth + 1);
    else if (extra === false) misfits.push({ kind: "unknown", field: `${field}.${name}`, within: field, valid: names });
    else if (isObject(extra)) collect(item, extra, `${field}.${name}`, misfits, depth + 1);
  }
}

/** Core's sentence for one misfit, quoting only identifiers (header). */
function sentence(misfit: Misfit): string {
  if (misfit.kind === "type") return `The step's ${quoted(misfit.field)} must be ${misfit.types.map(article).join(" or ")}, and the value written there is not.`;
  if (misfit.kind === "enum") {
    const words = misfit.valid.filter((word) => NAME.test(word));
    return `The step's ${quoted(misfit.field)} takes only ${words.length ? list(words, "or") : "the words its node declares"}, and the value written there is none of them.`;
  }
  const fields = misfit.valid.filter((name) => NAME.test(name));
  const takes = fields.length ? ` The fields ${quoted(misfit.within)} takes are ${list(fields, "and")}.` : "";
  const name = misfit.field.slice(misfit.within.length + 1);
  if (misfit.kind === "missing") return `The step's ${quoted(misfit.within)} lacks its required field ${quoted(name)}.${takes} Write it with ${quoted(name)}.`;
  return `The step's ${quoted(misfit.within)} takes no field ${NAME.test(name) ? quoted(name) : "of the name written"}.${takes} Write only those.`;
}

function declaredTypes(type: JsonValue | undefined): string[] {
  const listed = Array.isArray(type) ? type : type === undefined ? [] : [type];
  return listed.filter((name): name is string => typeof name === "string" && KNOWN_TYPES.has(name));
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

function ofType(value: JsonValue, type: string): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  return value === null;
}

function article(type: string): string {
  if (type === "null") return "null";
  return /^[aeiou]/u.test(type) ? `an ${type}` : `a ${type}`;
}

function same(left: JsonValue, right: JsonValue): boolean {
  return left === right || (typeof left === "object" && typeof right === "object" && JSON.stringify(left) === JSON.stringify(right));
}

function quoted(name: string): string {
  return NAME.test(name) ? JSON.stringify(name) : "this field";
}

function list(names: readonly string[], joiner: "and" | "or"): string {
  const shown = names.map((name) => JSON.stringify(name));
  return shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} ${joiner} ${shown[shown.length - 1]}`;
}

function objectAt(value: JsonValue | undefined, key: string): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const found = value[key];
  return isObject(found) ? found : undefined;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
