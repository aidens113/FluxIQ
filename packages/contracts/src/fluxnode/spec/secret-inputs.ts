// Which of a FluxNode's inputs are secrets (`JSON_TYPE_SECRET_FORMAT`), and their values in one run's
// inputs: what Core withholds from every model, saved Flow, export, step file, trace, event and result.

import type { JsonObject } from "../../core.ts";
import { JSON_TYPE_SECRET_FORMAT, type JsonTypeSchema } from "../type-schema/index.ts";

/**
 * The secret inputs' names, in declaration order (`names`), and the text each holds in `inputs`
 * (`values`, by name; an input not given, or given as anything but non-empty text, holds none).
 */
export function fluxNodeSecretInputs(inputs: JsonTypeSchema | undefined, given: JsonObject = {}): { names: string[]; values: Record<string, string> } {
  const properties = inputs?.properties ?? {};
  const names = Object.keys(properties).filter((name) => properties[name]?.format === JSON_TYPE_SECRET_FORMAT);
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = Object.hasOwn(given, name) ? given[name] : undefined;
    if (typeof value === "string" && value !== "") values[name] = value;
  }
  return { names, values };
}
