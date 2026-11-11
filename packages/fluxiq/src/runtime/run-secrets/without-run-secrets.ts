import { FLUXIQ_RUNTIME_WITHHELD_VALUE } from "../contracts.ts";
import { fluxiqRuntimeTextWithholding } from "../text-withholding.ts";
import { automationStudioRunSecrets } from "./read.ts";

/** How deep the walk goes before it withholds a subtree whole: far past any model request's nesting. */
const MOST_DEPTH = 64;

/**
 * `value` with every occurrence of the current run's secrets inside any string, at any depth and in
 * keys too, replaced by `[withheld]` (`fluxiqRuntimeTextWithholding`, the rule saved command attempts
 * and traces share). Every other value and the shape are kept; a part with nothing withheld comes back
 * by identity, and outside a run with secrets, so does `value`. What a model is sent passes through it
 * (`../llm/harness/run.ts`), so no request ever carries a secret, whatever the page or a tool echoed.
 */
export function automationStudioWithoutRunSecrets<T>(value: T): T {
  const secrets = automationStudioRunSecrets();
  if (!secrets) return value;
  return withheld(value, fluxiqRuntimeTextWithholding(Object.values(secrets)), 0, new WeakMap()) as T;
}

function withheld(value: unknown, text: (text: string) => string, depth: number, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (depth >= MOST_DEPTH) return FLUXIQ_RUNTIME_WITHHELD_VALUE;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    let changed = false;
    for (const item of value) {
      const next = withheld(item, text, depth + 1, seen);
      if (next !== item) changed = true;
      out.push(next);
    }
    if (!changed) seen.set(value, value);
    return changed ? out : value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  let changed = false;
  for (const [key, item] of Object.entries(value)) {
    const name = text(key);
    const next = withheld(item, text, depth + 1, seen);
    if (name !== key || next !== item) changed = true;
    out[name] = next;
  }
  if (!changed) seen.set(value, value);
  return changed ? out : value;
}
