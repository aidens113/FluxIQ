// A value a step is given, in the words a person reads it in: a fixed value as
// itself, an input as its {chip}, a field of the row a loop is on, or "what an
// earlier step gives" for a step's output.
import type { JsonValue } from "../../../../core/index.ts";
import { automationNodeOutputReference, isAutomationNodeParameterStateBinding } from "../../../../components/automation/index.ts";

/** The most of a fixed text the words quote. */
const QUOTED = 60;

/** The value in words. */
export function outlineValueWords(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "nothing";
  if (isAutomationNodeParameterStateBinding(value)) return pathWords(value.$state.path);
  if (typeof value === "string") return `“${value.length > QUOTED ? `${value.slice(0, QUOTED - 3)}...` : value}”`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length === 1 ? "a list of 1" : `a list of ${value.length}`;
  return "a set of values";
}

function pathWords(path: string): string {
  if (automationNodeOutputReference(path)) return "what an earlier step gives";
  if (path === "item") return "the item";
  if (path.startsWith("item.")) return `the item's ${path.slice("item.".length)}`;
  return `{${path}}`;
}
