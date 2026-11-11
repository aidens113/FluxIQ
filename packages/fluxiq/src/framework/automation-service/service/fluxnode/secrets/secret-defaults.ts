import type { JsonValue } from "../../../../../core/index.ts";

/** As deep as the executor resolves a binding, with room for the Flow document around it. */
const MOST_DEPTH = 64;

/**
 * `value` with no default on any state binding to a secret input (`{"$state":{"path":<secret>}}`). The
 * attempt saves such a binding with none (`../../answer-first/flow-run/input-bound-steps.ts`); an export
 * checks again, so even a Flow saved before secrets were declared, or by another path, never hands one
 * out. A copy only where something was dropped.
 */
export function fluxNodeWithoutSecretDefaults(value: JsonValue, secretNames: readonly string[]): JsonValue {
  if (!secretNames.length) return value;
  return walk(value, new Set(secretNames), 0);
}

function walk(value: JsonValue, secrets: ReadonlySet<string>, depth: number): JsonValue {
  if (!value || typeof value !== "object" || depth > MOST_DEPTH) return value;
  if (Array.isArray(value)) {
    const items = value.map((item) => walk(item, secrets, depth + 1));
    return items.some((item, index) => item !== value[index]) ? items : value;
  }
  const state = value["$state"];
  if (state && typeof state === "object" && !Array.isArray(state) && typeof state["path"] === "string" && secrets.has(state["path"]) && "fallback" in state) {
    const { fallback: _dropped, ...kept } = state;
    return { ...value, $state: kept };
  }
  let changed = false;
  const out: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    const next = walk(item, secrets, depth + 1);
    if (next !== item) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}
