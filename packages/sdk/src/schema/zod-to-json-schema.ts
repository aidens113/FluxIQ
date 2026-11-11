// Converts a zod (v3) schema to the JSON Schema the contracts' subset reads. It writes
// what zod says (a `regex` check is a `pattern`, `.email()` a `format`) and leaves the
// decision about `pattern` to `normalizeTypeSchema`. Anything zod can say that the
// subset cannot (transforms, tuples, dates, exclusive float bounds) is refused here
// with the path and what to write instead, never dropped.

import type { ZodTypeAny } from "zod";
import { SECRET_MARK } from "./secret-mark.ts";
import { unsupportedType } from "./unsupported.ts";

type Def = { typeName?: string; [key: string]: unknown };
type Json = { [key: string]: unknown };

const STRING_FORMATS: Readonly<Record<string, string>> = Object.freeze({ email: "email", url: "uri", datetime: "date-time", date: "date", uuid: "uuid", cuid: "cuid", cuid2: "cuid2", ulid: "ulid", ip: "ip", time: "time", duration: "duration" });
const IGNORED_STRING_CHECKS = new Set(["trim", "toLowerCase", "toUpperCase"]);

/** The JSON Schema for a zod schema. `path` is the JSON Pointer used in refusals. */
export function zodToJsonSchema(schema: ZodTypeAny, path = ""): Json {
  const def = schema._def as Def;
  switch (def.typeName) {
    case "ZodString":
      return convertString(def, path);
    case "ZodNumber":
      return convertNumber(def, path);
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodAny":
    case "ZodUnknown":
      return {};
    case "ZodLiteral":
      return { const: def.value };
    case "ZodEnum":
      return { type: "string", enum: [...(def.values as string[])] };
    case "ZodNativeEnum":
      return convertNativeEnum(def.values as Record<string, string | number>);
    case "ZodArray":
      return convertArray(def, path);
    case "ZodObject":
      return convertObject(def, path);
    case "ZodRecord":
      return { type: "object", additionalProperties: zodToJsonSchema(def.valueType as ZodTypeAny, `${path}/additionalProperties`) };
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return { anyOf: unionOptions(def).map((option, index) => zodToJsonSchema(option, `${path}/anyOf/${index}`)) };
    case "ZodOptional":
    case "ZodReadonly":
    case "ZodCatch":
      return zodToJsonSchema(def.innerType as ZodTypeAny, path);
    case "ZodDefault":
      return { ...zodToJsonSchema(def.innerType as ZodTypeAny, path), default: (def.defaultValue as () => unknown)() };
    case "ZodNullable":
      return allowNull(zodToJsonSchema(def.innerType as ZodTypeAny, path));
    case "ZodBranded":
      return zodToJsonSchema(def.type as ZodTypeAny, path);
    case "ZodPipeline":
      return zodToJsonSchema(def.in as ZodTypeAny, path);
    case "ZodEffects":
      return convertEffects(def, path);
    case "ZodDate":
      return unsupportedType(path, "a Date is not a JSON value.", 'Use z.string().datetime() (format "date-time") or z.string().date().');
    case "ZodTuple":
      return unsupportedType(path, "a tuple is not supported.", "Use z.array(...) of one type, or an object with named fields.");
    case "ZodIntersection":
      return unsupportedType(path, "an intersection is not supported.", "Write one z.object({...}) with every field, or use .extend().");
    case "ZodLazy":
      return unsupportedType(path, "a recursive (lazy) type is not supported.", "Declare a fixed depth of nested objects.");
    case "ZodBigInt":
      return unsupportedType(path, "a bigint is not a JSON value.", "Use z.number().int() or a string.");
    default:
      return unsupportedType(path, `${String(def.typeName)} is not supported.`);
  }
}

function convertString(def: Def, path: string): Json {
  const out: Json = { type: "string" };
  let hasRegex = false;
  for (const check of def.checks as Array<{ kind: string; value?: number; regex?: RegExp }>) {
    if (check.kind === "min") out.minLength = check.value;
    else if (check.kind === "max") out.maxLength = check.value;
    else if (check.kind === "length") {
      out.minLength = check.value;
      out.maxLength = check.value;
    } else if (check.kind === "regex") {
      hasRegex = true;
      out.pattern = check.regex?.source;
    } else if (check.kind in STRING_FORMATS) out.format = STRING_FORMATS[check.kind];
    else if (!IGNORED_STRING_CHECKS.has(check.kind)) unsupportedType(path, `the string check ".${check.kind}()" is not supported.`, "Use .min(), .max(), or a format: .email(), .url(), .datetime(), .date().");
  }
  if (hasRegex && out.format !== undefined) unsupportedType(path, `a regex beside the "${String(out.format)}" format would be dropped, since a format carries its own rule.`, "Keep the format, or drop the regex.");
  // `secret()` (`./secret.ts`): a secret is any text, so another format beside it would say two things.
  if ((def as { [SECRET_MARK]?: boolean })[SECRET_MARK] === true) {
    if (out.format !== undefined) unsupportedType(path, `a secret cannot also be held to the "${String(out.format)}" format.`, "Drop the format check from the secret.");
    if (hasRegex) unsupportedType(path, "a secret cannot carry a regex.", "Use .min() or .max() on it instead.");
    out.format = "secret";
  }
  return out;
}

function convertNumber(def: Def, path: string): Json {
  const checks = def.checks as Array<{ kind: string; value?: number; inclusive?: boolean }>;
  const integer = checks.some((check) => check.kind === "int");
  const out: Json = { type: integer ? "integer" : "number" };
  for (const check of checks) {
    if (check.kind === "min" || check.kind === "max") {
      let bound = check.value as number;
      if (check.inclusive === false) {
        if (!integer) unsupportedType(path, "an exclusive bound (.gt(), .lt(), .positive(), .negative()) on a non-integer is not supported.", "Use .min() or .max(), which are inclusive.");
        bound += check.kind === "min" ? 1 : -1;
      }
      out[check.kind === "min" ? "minimum" : "maximum"] = bound;
    } else if (check.kind === "multipleOf") unsupportedType(path, ".multipleOf() is not supported.", "Use .int() or drop it.");
  }
  return out;
}

function convertNativeEnum(values: Record<string, string | number>): Json {
  const members = Object.entries(values).filter(([key]) => typeof values[values[key] as string] !== "number" || !/^[0-9]+$/u.test(key));
  const list = members.map(([, value]) => value);
  const kinds = new Set(list.map((value) => typeof value));
  return kinds.size === 1 ? { type: kinds.has("number") ? "number" : "string", enum: list } : { enum: list };
}

function convertArray(def: Def, path: string): Json {
  const out: Json = { type: "array", items: zodToJsonSchema(def.type as ZodTypeAny, `${path}/items`) };
  const least = (def.minLength as { value: number } | null)?.value;
  const most = (def.maxLength as { value: number } | null)?.value;
  const exact = (def.exactLength as { value: number } | null)?.value;
  if (exact !== undefined) {
    out.minItems = exact;
    out.maxItems = exact;
  }
  if (least !== undefined) out.minItems = least;
  if (most !== undefined) out.maxItems = most;
  return out;
}

function convertObject(def: Def, path: string): Json {
  const shape = (def.shape as () => Record<string, ZodTypeAny>)();
  const properties: Json = {};
  const required: string[] = [];
  for (const [name, member] of Object.entries(shape)) {
    properties[name] = zodToJsonSchema(member, `${path}/properties/${name}`);
    if (!member.isOptional()) required.push(name);
  }
  const out: Json = { type: "object", properties };
  if (required.length > 0) out.required = required;
  const catchall = def.catchall as ZodTypeAny | undefined;
  if (catchall !== undefined && (catchall._def as Def).typeName !== "ZodNever") out.additionalProperties = zodToJsonSchema(catchall, `${path}/additionalProperties`);
  else if (def.unknownKeys === "strict") out.additionalProperties = false;
  return out;
}

function convertEffects(def: Def, path: string): Json {
  const effect = def.effect as { type: string };
  if (effect.type !== "refinement") unsupportedType(path, `a ${effect.type} (.transform() or z.preprocess()) changes the value, so it has no JSON type.`, "Declare the type the engine returns; reshape the result in your own code.");
  return zodToJsonSchema(def.schema as ZodTypeAny, path);
}

function unionOptions(def: Def): ZodTypeAny[] {
  const options = def.options;
  return Array.isArray(options) ? (options as ZodTypeAny[]) : [...(options as Map<unknown, ZodTypeAny>).values()];
}

function allowNull(schema: Json): Json {
  const type = schema.type;
  const composed = ["anyOf", "oneOf", "enum", "const"].some((keyword) => keyword in schema);
  if (typeof type === "string" && !composed) return { ...schema, type: [type, "null"] };
  if (Array.isArray(type) && !composed) return { ...schema, type: [...(type as string[]), "null"] };
  return { anyOf: [schema, { type: "null" }] };
}
