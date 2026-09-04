import type { JsonValue } from "../../../core/index.ts";
import type { AutomationNodeParameterStateBinding } from "./contracts.ts";

export function automationNodeStateBinding(path: string, fallback?: JsonValue): AutomationNodeParameterStateBinding {
  return { $state: { path, ...(fallback !== undefined ? { fallback } : {}) } };
}

export function isAutomationNodeParameterStateBinding(value: unknown): value is AutomationNodeParameterStateBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as Record<string, unknown>).$state;
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && typeof (state as Record<string, unknown>).path === "string");
}

export function resolveAutomationNodeParameterValues(
  parameterValues: Record<string, JsonValue>,
  state: Record<string, JsonValue>
): { values: Record<string, JsonValue>; missingPaths: string[] } {
  const values: Record<string, JsonValue> = {};
  const missingPaths: string[] = [];
  for (const [parameterId, value] of Object.entries(parameterValues)) {
    if (!isAutomationNodeParameterStateBinding(value)) {
      values[parameterId] = value;
      continue;
    }
    const resolved = readAutomationStatePath(state, value.$state.path);
    if (resolved.found) values[parameterId] = resolved.value;
    else if (value.$state.fallback !== undefined) values[parameterId] = value.$state.fallback;
    else missingPaths.push(value.$state.path);
  }
  return { values, missingPaths };
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
