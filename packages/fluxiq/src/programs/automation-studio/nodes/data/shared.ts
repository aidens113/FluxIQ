import type { JsonValue } from "../../../../core/index.ts";

export function variableName(value: unknown): string {
  return String(value ?? "").trim();
}

export function readVariable(variables: Map<string, JsonValue> | undefined, name: string): JsonValue {
  return variables?.get(name) ?? null;
}

export function writeVariable(variables: Map<string, JsonValue> | undefined, name: string, value: JsonValue): void {
  variables?.set(name, value);
}

/**
 * A value a data node was handed, as JSON, with identity kept wherever nothing
 * needs changing: a value already made of JSON comes back as the very object or
 * array the node was given, and only a part JSON cannot carry is copied.
 *
 * Identity is the point. The saved trace stands a captured row in for a dataset
 * marker by identity, never by value (CD14, `runtime/executor/record-summary.ts`),
 * so a deep copy of a row is no longer that row: the trace keeps the row's own
 * text where a marker belongs, including text a user excluded from the dataset.
 * A For Each over extracted records that remembers each row in a variable is the
 * obvious way to reach that, which is why the variable path keeps references.
 *
 * What copying defended against -- a later node writing into a value this one
 * stored -- no built-in node does: each builds its result rather than mutating
 * its input, as Filter List already does with the rows it keeps.
 */
export function keptJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const kept = keptJsonValue(item);
      if (kept !== item) changed = true;
      return kept;
    });
    return changed ? items : (value as JsonValue);
  }
  if (typeof value === "object") {
    let changed = false;
    const record: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const kept = keptJsonValue(item);
      if (kept !== item) changed = true;
      record[key] = kept;
    }
    return changed ? record : (value as JsonValue);
  }
  return String(value);
}

/**
 * `source` with one path set: the objects along the path are copied and the
 * value itself is kept by reference, as `keptJsonValue` explains. The framework
 * helper `setPathValue` is the same walk over a deep copy of the value, which is
 * what a captured row cannot survive.
 */
export function setKeptPathValue(source: Record<string, JsonValue>, path: unknown, value: unknown): Record<string, JsonValue> {
  const parts = String(path ?? "").split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return source;
  const next = { ...source };
  let cursor: Record<string, JsonValue> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    const child = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } as Record<string, JsonValue> : {};
    cursor[part] = child;
    cursor = child;
  }
  cursor[parts[parts.length - 1]!] = keptJsonValue(value);
  return next;
}
