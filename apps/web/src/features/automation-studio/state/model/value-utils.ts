import type { EvidenceAnchor, EvidenceReference, NodeEvidenceBinding, NodeEvidenceRole, NodeStatePhase, NodeStateRuntimeComparison, NodeStateSource, StateFact, StateSnapshot, StateValue, StateVisualFrame } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { BuildNodeStateViewModelInput, NodeEvidenceBindingViewModel, NodeStateRuntimeComparisonRow, NodeStateRuntimeComparisonViewModel, NodeStateViewModel, ResolvedActionVisualTargetViewModel, StateDiffRow, StateFactViewModel, StateOverlayTone, StateOverlayViewModel, StateSourceRecord, StateStructuredRow, StateVisualTone } from "./types";

export function isStateSnapshot(value: unknown): value is StateSnapshot {
  const record = objectRecord(value);
  return Boolean(record && typeof record.timestamp === "number" && record.namespaces && typeof record.namespaces === "object" && !Array.isArray(record.namespaces));
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return isObjectRecord(value) ? value : null;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function readablePath(path: string): string {
  return path.split(".").filter(Boolean).map(readableToken).join(" / ") || "-";
}

export function readableToken(value: unknown): string {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "-";
}

export function valueSummary(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} items` : "[]";
  if (typeof value === "object") {
    const valueRecord = value as Partial<StateValue>;
    if ("value" in valueRecord) return valueSummary(valueRecord.value);
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 3).map(([key, item]) => `${readableToken(key)}: ${valueSummary(item)}`);
    return entries.length ? entries.join("; ") : "{}";
  }
  return String(value);
}

export function shortId(value: string): string {
  return value.length > 14 ? value.slice(0, 8) : value;
}

export function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
