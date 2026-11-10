// The run-state paths a value reads: every state binding inside it, at any depth.
import type { JsonValue } from "../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../../components/automation/index.ts";

/** How deep a value is searched: as deep as the executor resolves a binding. */
const MAXIMUM_DEPTH = 16;

/** Every state path the value binds, in the order they are written. */
export function outlineBindingPaths(value: JsonValue | undefined, depth = 0): string[] {
  if (value === undefined || value === null || typeof value !== "object" || depth > MAXIMUM_DEPTH) return [];
  if (isAutomationNodeParameterStateBinding(value)) return [value.$state.path];
  const items = Array.isArray(value) ? value : Object.values(value);
  return items.flatMap((item) => outlineBindingPaths(item, depth + 1));
}
