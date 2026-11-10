import type { z } from "zod/v4";
import { USD_AMOUNTS } from "./usd-amounts.ts";

/** A name that says US dollars (`addUsd`, `budget_usd`): it must be a `usdAmount`. */
const DOLLAR_NAME = /usd$/iu;

type Definition = { type?: unknown; innerType?: unknown; shape?: unknown; element?: unknown; in?: unknown; out?: unknown };

/**
 * The fields of an object schema that are amounts of money (`usdAmount`), as
 * paths (`addUsd`, `limits.dailyUsd`, `items[].priceUsd`), through optional,
 * nullable, default, readonly, pipe, nested object and array wrappers.
 * Throws a `TypeError` naming a field whose name says dollars but that is not
 * a `usdAmount`, so an amount cannot be added without the mark.
 */
export function programApiMoneyFields(schema: z.ZodObject): string[] {
  const found: string[] = [];
  const definition = definitionOf(schema);
  if (definition !== undefined) walkShape(definition, "", found);
  return found;
}

function walkShape(definition: Definition, prefix: string, found: string[]): void {
  const shape = definition.shape !== null && typeof definition.shape === "object" ? (definition.shape as Record<string, unknown>) : {};
  for (const [field, child] of Object.entries(shape)) {
    const path = `${prefix}${field}`;
    if (marked(child)) {
      found.push(path);
      continue;
    }
    if (DOLLAR_NAME.test(field)) throw new TypeError(`${path}: an amount of US dollars must be a usdAmount, so the calls that spend it say so.`);
    walkInner(child, path, found);
  }
}

// Into the objects and arrays a field holds, past its wrappers.
function walkInner(schema: unknown, path: string, found: string[]): void {
  for (const definition of chain(schema)) {
    if (definition.type === "object") walkShape(definition, `${path}.`, found);
    if (definition.type === "array") {
      const element = definition.element;
      if (marked(element)) found.push(`${path}[]`);
      else walkInner(element, `${path}[]`, found);
    }
  }
}

function marked(schema: unknown): boolean {
  return chain(schema).some((definition) => USD_AMOUNTS.has(definition));
}

// The definition of `schema` and of every schema it wraps.
function chain(schema: unknown): Definition[] {
  const definitions: Definition[] = [];
  const pending: unknown[] = [schema];
  while (pending.length) {
    const definition = definitionOf(pending.pop());
    if (definition === undefined || definitions.includes(definition)) continue;
    definitions.push(definition);
    pending.push(definition.innerType, definition.in, definition.out);
  }
  return definitions;
}

function definitionOf(schema: unknown): Definition | undefined {
  const zod = schema !== null && typeof schema === "object" ? (schema as { _zod?: { def?: unknown } })._zod : undefined;
  return zod?.def !== null && typeof zod?.def === "object" ? (zod.def as Definition) : undefined;
}
