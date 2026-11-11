// Turns what a developer wrote for a type, a zod schema or a raw JSON Schema, into a
// schema the contracts' parser accepts, or an SdkError saying why not.

import { parseFluxNodeInputs, parseJsonTypeSchema, type JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import type { ZodTypeAny } from "zod";
import { SdkError } from "../errors/index.ts";
import { isZodSchema } from "./is-zod-schema.ts";
import { normalizeTypeSchema } from "./normalize-type-schema.ts";
import { zodToJsonSchema } from "./zod-to-json-schema.ts";

/** A type as a developer writes it: a zod schema, or raw JSON Schema (checked against the contracts subset, with a `pattern` beside a `format` dropped). */
export type TypeSchemaInput = ZodTypeAny | JsonTypeSchema | { [keyword: string]: unknown };

/**
 * The contracts' schema for `input`. `label` ("inputs", "outputs") names it in refusals. `fluxNodeInputs`:
 * it is a FluxNode's inputs, where an input may be a secret (`secret()`); anywhere else a secret is refused.
 */
export function typeSchemaFrom(input: TypeSchemaInput, label: string, options: { fluxNodeInputs?: boolean } = {}): JsonTypeSchema {
  const emitted = isZodSchema(input) ? zodToJsonSchema(input) : input;
  const normalized = normalizeTypeSchema(emitted);
  const parsed = options.fluxNodeInputs === true ? parseFluxNodeInputs(normalized) : parseJsonTypeSchema(normalized);
  if (parsed.ok) return parsed.value;
  const lines = parsed.issues.map((issue) => `${issue.path === "" ? "(root)" : issue.path}: ${issue.message}`);
  throw new SdkError("invalid_schema", `The ${label} type is not one the engine can check:\n  ${lines.join("\n  ")}`, { issues: parsed.issues });
}
