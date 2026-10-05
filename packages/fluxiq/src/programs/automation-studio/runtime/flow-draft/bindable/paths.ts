import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftHoldsBinding, automationStudioFlowDraftStoredBindingKind } from "../binding-forms.ts";

/** Current binding paths whose values already appear in the model-safe argument.
 * Resolved aliases and private runnable identity are never projected or remapped.
 * This describes available arguments; the binding owner still validates an edit.
 */
export function automationStudioFlowDraftBindablePaths(step: { input: JsonObject; ranWith?: JsonObject }): string[] {
  const current = step.ranWith ?? step.input;
  const nested = isObject(current.parameters);
  const shown = nested ? step.input.parameters : step.input;
  const runnable = nested ? current.parameters : current;
  if (!isObject(shown) || !isObject(runnable)) return [];
  const paths: string[] = [];
  collect(shown, runnable, [], paths);
  return paths;
}

function collect(shown: JsonObject, current: JsonObject, prefix: string[], paths: string[]): void {
  for (const [key, value] of Object.entries(shown)) {
    if (!Object.hasOwn(current, key)) continue;
    const candidate = current[key]!;
    const path = [...prefix, key];
    if (same(value, candidate) && value !== null
      && (!automationStudioFlowDraftHoldsBinding(value) || automationStudioFlowDraftStoredBindingKind(value) !== undefined)) paths.push(path.join("."));
    // A binding is one value, not paths into its state path or fallback.
    if (isObject(value) && isObject(candidate) && !Object.hasOwn(value, "$state")
      && !Object.hasOwn(value, "$input") && !Object.hasOwn(value, "$row") && !Object.hasOwn(value, "$step")) collect(value, candidate, path, paths);
  }
}

function same(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]!));
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key]!, right[key]!));
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
