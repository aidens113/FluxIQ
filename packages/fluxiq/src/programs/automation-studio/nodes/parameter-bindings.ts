import type { JsonValue } from "../../../core/index.ts";
import type { AutomationNodeParameterStateBinding } from "./contracts.ts";

/**
 * How far below a parameter value resolution descends. A node that carries a
 * payload -- `builtin.policy.action` holds an output's arguments under its
 * `parameters` object -- puts every one of its real values below the top
 * level, so resolution has to reach them. The bound sits far above any real
 * document; it is here so a pathological or self-referential value costs
 * bounded time instead of exhausting the stack. A binding below it is left
 * untouched rather than resolved.
 */
const MAXIMUM_PARAMETER_VALUE_DEPTH = 16;

type ParameterResolutionScope = {
  state: Record<string, JsonValue>;
  missingPaths: string[];
  /** Values on the current descent path, so a cycle stops instead of repeating. */
  ancestors: Set<object>;
};

type ResolvedParameterValue = { present: true; value: JsonValue } | { present: false };

export function automationNodeStateBinding(path: string, fallback?: JsonValue): AutomationNodeParameterStateBinding {
  return { $state: { path, ...(fallback !== undefined ? { fallback } : {}) } };
}

export function isAutomationNodeParameterStateBinding(value: unknown): value is AutomationNodeParameterStateBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as Record<string, unknown>).$state;
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && typeof (state as Record<string, unknown>).path === "string");
}

/**
 * Resolves every state binding a node's parameter values carry, at the top
 * level and inside the objects and arrays below it. A binding whose path is
 * unavailable takes its retained fallback; without one the path is reported in
 * `missingPaths` and the value is left out, at any depth, so an unresolved
 * binding never degrades into a value the node would act on.
 */
export function resolveAutomationNodeParameterValues(
  parameterValues: Record<string, JsonValue>,
  state: Record<string, JsonValue>
): { values: Record<string, JsonValue>; missingPaths: string[] } {
  const scope: ParameterResolutionScope = { state, missingPaths: [], ancestors: new Set<object>([parameterValues]) };
  const values: Record<string, JsonValue> = {};
  for (const [parameterId, value] of Object.entries(parameterValues)) {
    const resolved = resolveParameterValue(value, scope, 0);
    if (resolved.present) values[parameterId] = resolved.value;
  }
  return { values, missingPaths: scope.missingPaths };
}

function resolveParameterValue(value: JsonValue, scope: ParameterResolutionScope, depth: number): ResolvedParameterValue {
  if (isAutomationNodeParameterStateBinding(value)) {
    // What state supplies is a value, never another binding: a resolved result
    // is not walked again, so state data cannot name a further path to read.
    const resolved = readAutomationStatePath(scope.state, value.$state.path);
    if (resolved.found) return { present: true, value: resolved.value };
    if (value.$state.fallback !== undefined) return { present: true, value: value.$state.fallback };
    scope.missingPaths.push(value.$state.path);
    return { present: false };
  }
  if (!value || typeof value !== "object") return { present: true, value };
  if (depth >= MAXIMUM_PARAMETER_VALUE_DEPTH || scope.ancestors.has(value)) return { present: true, value };
  scope.ancestors.add(value);
  const descended = Array.isArray(value)
    ? resolveParameterArray(value, scope, depth + 1)
    : resolveNestedParameterRecord(value, scope, depth + 1);
  scope.ancestors.delete(value);
  return { present: true, value: descended };
}

function resolveParameterArray(values: JsonValue[], scope: ParameterResolutionScope, depth: number): JsonValue[] {
  let changed = false;
  const resolved = values.map((element) => {
    const item = resolveParameterValue(element, scope, depth);
    // Position is part of an array's shape, so an unresolved element keeps its
    // place instead of renumbering the elements after it. The node still fails:
    // the path is already in `missingPaths`.
    if (!item.present) return element;
    if (item.value !== element) changed = true;
    return item.value;
  });
  return changed ? resolved : values;
}

function resolveNestedParameterRecord(record: Record<string, JsonValue>, scope: ParameterResolutionScope, depth: number): Record<string, JsonValue> {
  let changed = false;
  const resolved: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    const item = resolveParameterValue(value, scope, depth);
    if (!item.present) {
      changed = true;
      continue;
    }
    if (item.value !== value) changed = true;
    resolved[key] = item.value;
  }
  // A subtree that resolved nothing is handed back as it arrived, so resolution
  // never rewrites a payload it did not change.
  return changed ? resolved : record;
}

function readAutomationStatePath(state: Record<string, JsonValue>, path: string): { found: true; value: JsonValue } | { found: false } {
  const normalizedPath = path.trim();
  if (!normalizedPath) return { found: false };
  const candidates: unknown[] = [state, state.state];
  for (const candidate of candidates) {
    const direct = readRecordPath(candidate, normalizedPath);
    if (direct.found) return direct;
    const snapshot = readStateSnapshotPath(candidate, normalizedPath);
    if (snapshot.found) return snapshot;
  }
  return { found: false };
}

function readRecordPath(value: unknown, path: string): { found: true; value: JsonValue } | { found: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { found: false };
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, path)) return jsonValueResult(record[path]);
  let current: unknown = record;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
    current = (current as Record<string, unknown>)[segment];
  }
  return jsonValueResult(current);
}

function readStateSnapshotPath(value: unknown, path: string): { found: true; value: JsonValue } | { found: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { found: false };
  const namespaces = (value as Record<string, unknown>).namespaces;
  if (!namespaces || typeof namespaces !== "object" || Array.isArray(namespaces)) return { found: false };
  const separator = path.indexOf(".");
  if (separator < 1) return { found: false };
  const namespace = (namespaces as Record<string, unknown>)[path.slice(0, separator)];
  if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) return { found: false };
  const namespaceValues = (namespace as Record<string, unknown>).values;
  const stateValue = readRecordPath(namespaceValues, path.slice(separator + 1));
  if (!stateValue.found) return stateValue;
  if (stateValue.value && typeof stateValue.value === "object" && !Array.isArray(stateValue.value) && Object.prototype.hasOwnProperty.call(stateValue.value, "value")) {
    return jsonValueResult((stateValue.value as Record<string, unknown>).value);
  }
  return stateValue;
}

function jsonValueResult(value: unknown): { found: true; value: JsonValue } | { found: false } {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return { found: false };
  return { found: true, value: value as JsonValue };
}
