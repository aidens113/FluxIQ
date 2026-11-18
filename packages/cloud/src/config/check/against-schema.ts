import type { CloudConfigIssue } from "../types.ts";

/** The JSON Schema keywords the config schema uses; anything else is not read. */
export type SchemaNode = {
  readonly type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: SchemaNode;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  /** false refuses unknown names; a node checks every unknown name's value against it. */
  readonly additionalProperties?: boolean | SchemaNode;
  readonly description?: string;
};

/**
 * Checks a parsed JSON value against the subset of JSON Schema the config
 * schema uses, and answers every problem found with its path, so one run
 * lists everything wrong with a file rather than the first thing.
 */
export function checkAgainstSchema(value: unknown, schema: SchemaNode, path = ""): CloudConfigIssue[] {
  const at = path === "" ? "(the file)" : path;
  if (schema.enum !== undefined) {
    return typeof value === "string" && schema.enum.includes(value) ? [] : [{ path: at, message: `must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}` }];
  }
  switch (schema.type) {
    case "object": return checkObject(value, schema, path);
    case "array": return checkArray(value, schema, path);
    case "string": return checkString(value, schema, at);
    case "integer":
    case "number": return checkNumber(value, schema, at);
    case "boolean": return typeof value === "boolean" ? [] : [{ path: at, message: "must be true or false" }];
    default: return [];
  }
}

function checkObject(value: unknown, schema: SchemaNode, path: string): CloudConfigIssue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [{ path: path === "" ? "(the file)" : path, message: "must be an object" }];
  const record = value as Record<string, unknown>;
  const issues: CloudConfigIssue[] = [];
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(record, name)) issues.push({ path: join(path, name), message: "is required" });
  }
  for (const [name, child] of Object.entries(record)) {
    const property = Object.hasOwn(properties, name) ? properties[name] : undefined;
    if (property === undefined) {
      if (schema.additionalProperties === false) issues.push({ path: join(path, name), message: `is not a known setting${suggestion(name, Object.keys(properties))}` });
      else if (typeof schema.additionalProperties === "object") issues.push(...checkAgainstSchema(child, schema.additionalProperties, join(path, name)));
      continue;
    }
    issues.push(...checkAgainstSchema(child, property, join(path, name)));
  }
  return issues;
}

function checkArray(value: unknown, schema: SchemaNode, path: string): CloudConfigIssue[] {
  if (!Array.isArray(value)) return [{ path, message: "must be a list" }];
  const issues: CloudConfigIssue[] = [];
  if (schema.minItems !== undefined && value.length < schema.minItems) issues.push({ path, message: `must list at least ${schema.minItems}` });
  if (schema.items !== undefined) value.forEach((item, index) => issues.push(...checkAgainstSchema(item, schema.items as SchemaNode, `${path}[${index}]`)));
  return issues;
}

function checkString(value: unknown, schema: SchemaNode, at: string): CloudConfigIssue[] {
  if (typeof value !== "string") return [{ path: at, message: "must be text" }];
  if (/[\r\n\0]/u.test(value)) return [{ path: at, message: "must be one line" }];
  if (schema.minLength !== undefined && value.length < schema.minLength) return [{ path: at, message: value === "" ? "must not be empty" : `must be at least ${schema.minLength} characters` }];
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return [{ path: at, message: `must be at most ${schema.maxLength} characters` }];
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) return [{ path: at, message: `${JSON.stringify(value)} is not valid here${schema.description ? ` (${schema.description})` : ""}` }];
  return [];
}

function checkNumber(value: unknown, schema: SchemaNode, at: string): CloudConfigIssue[] {
  if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) return [{ path: at, message: schema.type === "integer" ? "must be a whole number" : "must be a number" }];
  if (schema.minimum !== undefined && value < schema.minimum) return [{ path: at, message: `must be at least ${schema.minimum}` }];
  if (schema.maximum !== undefined && value > schema.maximum) return [{ path: at, message: `must be at most ${schema.maximum}` }];
  return [];
}

function join(path: string, name: string): string {
  return path === "" ? name : `${path}.${name}`;
}

function suggestion(name: string, known: readonly string[]): string {
  const lower = name.toLowerCase();
  const close = known.find((candidate) => candidate.toLowerCase() === lower || candidate.toLowerCase().startsWith(lower.slice(0, 4)));
  return close === undefined ? "" : ` (did you mean "${close}"?)`;
}
