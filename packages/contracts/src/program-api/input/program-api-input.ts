// One program API endpoint's input: the parser its handler reads a payload
// with, and the JSON Schema the panel assistant is shown for the same shape.
// Both come from one zod (v4) object schema, so the two can never disagree.
//
// zod 3.25 ships v4 under `zod/v4`, whose `toJSONSchema` is the converter; no
// dependency is added. Only this subpath loads it, so the root entry and the
// browser bundles that import it do not grow.

import { z } from "zod/v4";
import { programApiMoneyFields } from "./money-fields.ts";

/** A JSON Schema (draft 2020-12) object, frozen. */
export type ProgramApiJsonSchema = Readonly<Record<string, unknown>>;

/** The outcome of reading a payload without throwing. */
export type ProgramApiInputResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** An endpoint's input: read a payload, or describe it as JSON Schema. */
export type ProgramApiInput<T> = {
  /** The payload as `T` (unknown fields dropped); throws a `TypeError` naming each wrong field. */
  parse(payload: unknown): T;
  /** As `parse`, without throwing. */
  read(payload: unknown): ProgramApiInputResult<T>;
  /** What the endpoint accepts, as JSON Schema; computed once, then the same frozen object. */
  jsonSchema(): ProgramApiJsonSchema;
  /**
   * The fields that are amounts of money the call commits (`usdAmount`), as
   * paths; computed once. Throws a `TypeError` naming a field whose name says
   * dollars but that is not a `usdAmount` (`programApiMoneyFields`).
   */
  moneyFields(): readonly string[];
};

/**
 * Wraps a zod object schema as an endpoint input. The schema must describe a
 * JSON object, since a tool's input is one; anything zod cannot express as
 * JSON Schema (a transform, a date) throws when the schema is first asked for.
 */
export function programApiInput<S extends z.ZodObject>(schema: S): ProgramApiInput<z.output<S>> {
  let described: ProgramApiJsonSchema | undefined;
  let money: readonly string[] | undefined;
  const read = (payload: unknown): ProgramApiInputResult<z.output<S>> => {
    const parsed = schema.safeParse(payload ?? {});
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(describeIssue).join("; ") };
  };
  return {
    parse(payload) {
      const result = read(payload);
      if (!result.ok) throw new TypeError(result.error);
      return result.value;
    },
    read,
    jsonSchema() {
      described ??= deepFreeze(withoutDialect(z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "throw" })));
      return described;
    },
    moneyFields() {
      money ??= Object.freeze(programApiMoneyFields(schema));
      return money;
    }
  };
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// The `$schema` dialect line is noise in a tool definition a model reads.
function withoutDialect(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = schema;
  return rest;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
