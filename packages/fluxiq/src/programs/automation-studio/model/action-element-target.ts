import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { StateBounds, StatePath } from "./state.ts";

export type AutomationStudioElementTargetSource = "recording" | "runtime" | "mapper" | "operator" | "inferred";

export type AutomationStudioElementTargetFingerprint = {
  visibleText?: string;
  accessibleName?: string;
  label?: string;
  id?: string;
  testId?: string;
  automationId?: string;
  entityId?: string;
  entityKind?: string;
  tagName?: string;
  role?: string;
  selector?: string;
  xpath?: string;
  queryPath?: string;
  statePath?: string | StatePath;
  url?: string;
  classNames?: string[];
  bounds?: StateBounds;
  attributes?: Record<string, string>;
  metadata?: JsonObject;
};

export type AutomationStudioElementTargetCandidate = AutomationStudioElementTargetFingerprint & {
  candidateId: string;
  visualFrameId?: string;
  visualLayerId?: string;
  isVisibleOnViewport?: boolean;
};

export type AutomationStudioElementTargetSelection = {
  candidateId: string;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  metadata?: JsonObject;
};

export type AutomationStudioElementTarget = {
  kind: "element";
  fingerprint: AutomationStudioElementTargetFingerprint;
  candidates?: AutomationStudioElementTargetCandidate[];
  selectedCandidate?: AutomationStudioElementTargetSelection;
  source?: AutomationStudioElementTargetSource;
  metadata?: JsonObject;
};

export type AutomationStudioElementTargetValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
};

export type AutomationStudioElementTargetValidationResult = {
  ok: boolean;
  issues: AutomationStudioElementTargetValidationIssue[];
};

export function isAutomationStudioElementTarget(value: unknown): value is AutomationStudioElementTarget {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).kind === "element"
    && Boolean((value as Record<string, unknown>).fingerprint)
    && typeof (value as Record<string, unknown>).fingerprint === "object"
    && !Array.isArray((value as Record<string, unknown>).fingerprint);
}

export function normalizeAutomationStudioElementTarget(value: unknown, options: { source?: AutomationStudioElementTargetSource } = {}): AutomationStudioElementTarget | null {
  if (isAutomationStudioElementTarget(value)) return sanitizeElementTarget(value, options.source);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const target = isObject(input.target) ? input.target : input;
  if (isAutomationStudioElementTarget(target)) return sanitizeElementTarget(target, options.source);
  const fingerprint = normalizeFingerprint(target);
  if (!hasFingerprintSignal(fingerprint)) return null;
  return compactElementTarget({
    kind: "element",
    fingerprint,
    ...(options.source ? { source: options.source } : {})
  });
}

export function validateAutomationStudioElementTarget(target: AutomationStudioElementTarget, path = "target"): AutomationStudioElementTargetValidationResult {
  const issues: AutomationStudioElementTargetValidationIssue[] = [];
  if (target.kind !== "element") issue(issues, "error", "element_target.invalid_kind", "Element target kind must be element.", `${path}.kind`);
  if (!hasFingerprintSignal(target.fingerprint)) issue(issues, "error", "element_target.empty_fingerprint", "Element target fingerprint must include at least one identifying signal.", `${path}.fingerprint`);
  validateFingerprint(target.fingerprint, issues, `${path}.fingerprint`);
  for (const [index, candidate] of (target.candidates ?? []).entries()) {
    if (!candidate.candidateId?.trim()) issue(issues, "error", "element_target.candidate_missing_id", "Element target candidate must include a candidateId.", `${path}.candidates.${index}.candidateId`);
    validateFingerprint(candidate, issues, `${path}.candidates.${index}`);
  }
  const selected = target.selectedCandidate;
  if (selected) {
    if (!selected.candidateId.trim()) issue(issues, "error", "element_target.selection_missing_id", "Selected element candidate must include a candidateId.", `${path}.selectedCandidate.candidateId`);
    if (!Number.isFinite(selected.confidence) || selected.confidence < 0 || selected.confidence > 1) issue(issues, "error", "element_target.selection_invalid_confidence", "Selected element confidence must be between 0 and 1.", `${path}.selectedCandidate.confidence`);
  }
  if (target.source && !["recording", "runtime", "mapper", "operator", "inferred"].includes(target.source)) issue(issues, "error", "element_target.invalid_source", "Element target source is not recognized.", `${path}.source`);
  return { ok: issues.every((item) => item.severity !== "error"), issues };
}

function sanitizeElementTarget(target: AutomationStudioElementTarget, source: AutomationStudioElementTargetSource | undefined): AutomationStudioElementTarget {
  return compactElementTarget({
    kind: "element",
    fingerprint: normalizeFingerprint(target.fingerprint),
    candidates: target.candidates?.map((candidate) => compactCandidate({ ...normalizeFingerprint(candidate), candidateId: safeString(candidate.candidateId), visualFrameId: safeString(candidate.visualFrameId), visualLayerId: safeString(candidate.visualLayerId), isVisibleOnViewport: typeof candidate.isVisibleOnViewport === "boolean" ? candidate.isVisibleOnViewport : undefined })).filter((candidate) => candidate.candidateId),
    selectedCandidate: target.selectedCandidate ? compactSelection(target.selectedCandidate) : undefined,
    source: source ?? target.source,
    metadata: sanitizeJsonObject(target.metadata)
  });
}

function normalizeFingerprint(value: unknown): AutomationStudioElementTargetFingerprint {
  if (!isObject(value)) return {};
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const visualTarget = isObject(value.visualTarget) ? value.visualTarget : {};
  return compactFingerprint({
    visibleText: safeString(value.visibleText) ?? safeString(metadata.visibleText) ?? safeString(value.text),
    accessibleName: safeString(value.accessibleName) ?? safeString(metadata.accessibleName) ?? safeString(metadata.ariaLabel),
    label: safeString(value.label) ?? safeString(metadata.label),
    id: safeString(value.id) ?? safeString(value.elementId) ?? safeString(metadata.id),
    testId: safeString(value.testId) ?? safeString(value.dataTestId) ?? safeString(metadata.testId) ?? safeString(metadata.dataTestId),
    automationId: safeString(value.automationId) ?? safeString(metadata.automationId),
    entityId: safeString(value.entityId) ?? safeString(metadata.entityId) ?? safeString(visualTarget.entityId),
    entityKind: safeString(value.entityKind) ?? safeString(metadata.entityKind) ?? safeString(visualTarget.entityKind),
    tagName: safeString(value.tagName) ?? safeString(metadata.tagName),
    role: safeString(value.role) ?? safeString(metadata.role),
    selector: safeString(value.selector) ?? safeString(metadata.selector),
    xpath: safeString(value.xpath) ?? safeString(metadata.xpath),
    queryPath: safeString(value.queryPath) ?? safeString(metadata.queryPath),
    statePath: readStatePath(value.statePath) ?? readStatePath(metadata.statePath) ?? readStatePath(visualTarget.statePath),
    url: safeString(value.url) ?? safeString(metadata.url),
    classNames: readStringArray(value.classNames) ?? readStringArray(metadata.classNames),
    bounds: readBounds(value.bounds) ?? readBounds(metadata.bounds),
    attributes: sanitizeAttributes(value.attributes) ?? sanitizeAttributes(metadata.attributes),
    metadata: sanitizeJsonObject(metadata, promotedFingerprintMetadataKeys)
  });
}

function validateFingerprint(fingerprint: AutomationStudioElementTargetFingerprint, issues: AutomationStudioElementTargetValidationIssue[], path: string): void {
  for (const key of ["visibleText", "accessibleName", "label", "id", "testId", "automationId", "entityId", "entityKind", "tagName", "role", "selector", "xpath", "queryPath", "url"] as const) {
    const value = fingerprint[key];
    if (value !== undefined && !value.trim()) issue(issues, "warning", "element_target.empty_signal", `Element target ${key} is empty and should be omitted.`, `${path}.${key}`);
  }
  if (fingerprint.bounds) {
    for (const key of ["x", "y", "width", "height"] as const) {
      if (!Number.isFinite(fingerprint.bounds[key])) issue(issues, "error", "element_target.invalid_bounds", "Element target bounds must be finite.", `${path}.bounds.${key}`);
    }
    if (fingerprint.bounds.width <= 0 || fingerprint.bounds.height <= 0) issue(issues, "error", "element_target.invalid_bounds", "Element target bounds width and height must be positive.", `${path}.bounds`);
  }
  if (fingerprint.statePath && typeof fingerprint.statePath !== "string") {
    if (!fingerprint.statePath.namespace.trim()) issue(issues, "error", "element_target.invalid_state_path", "Element target statePath namespace cannot be empty.", `${path}.statePath.namespace`);
    if (!fingerprint.statePath.path.trim()) issue(issues, "error", "element_target.invalid_state_path", "Element target statePath path cannot be empty.", `${path}.statePath.path`);
  }
  if (fingerprint.attributes && Object.keys(fingerprint.attributes).some(isSensitiveKey)) issue(issues, "error", "element_target.sensitive_attribute", "Element target attributes cannot include sensitive keys.", `${path}.attributes`);
  if (fingerprint.metadata && Object.keys(fingerprint.metadata).some(isSensitiveKey)) issue(issues, "error", "element_target.sensitive_metadata", "Element target metadata cannot include sensitive keys.", `${path}.metadata`);
}

function hasFingerprintSignal(fingerprint: AutomationStudioElementTargetFingerprint): boolean {
  return Boolean(fingerprint.visibleText || fingerprint.accessibleName || fingerprint.label || fingerprint.id || fingerprint.testId || fingerprint.automationId || fingerprint.entityId || fingerprint.statePath || fingerprint.selector || fingerprint.xpath || fingerprint.queryPath || fingerprint.bounds);
}

function compactSelection(selection: AutomationStudioElementTargetSelection): AutomationStudioElementTargetSelection | undefined {
  if (!safeString(selection.candidateId)) return undefined;
  return compactSelectionObject({
    candidateId: safeString(selection.candidateId),
    confidence: Number.isFinite(selection.confidence) ? Math.max(0, Math.min(1, selection.confidence)) : 0,
    matchedSignals: selection.matchedSignals.filter((item) => item.trim()),
    failedSignals: selection.failedSignals.filter((item) => item.trim()),
    metadata: sanitizeJsonObject(selection.metadata)
  });
}

function readStatePath(value: unknown): AutomationStudioElementTargetFingerprint["statePath"] | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isObject(value)) return undefined;
  const namespace = safeString(value.namespace);
  const path = safeString(value.path);
  return namespace && path ? { namespace, path } : undefined;
}

function readBounds(value: unknown): StateBounds | undefined {
  if (!isObject(value)) return undefined;
  const bounds = { x: Number(value.x), y: Number(value.y), width: Number(value.width), height: Number(value.height) };
  return Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0 ? bounds : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.flatMap((item) => safeString(item) ? [safeString(item)!] : []);
    return values.length ? values : undefined;
  }
  if (typeof value === "string" && value.trim()) return value.split(/\s+/).filter(Boolean);
  return undefined;
}

function sanitizeAttributes(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (isSensitiveKey(key) || typeof item !== "string" || !item.trim()) return [];
    return [[key, truncate(item)] as const];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sanitizeJsonObject(value: unknown, omitKeys: ReadonlySet<string> = new Set()): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (omitKeys.has(key) || isSensitiveKey(key)) return [];
    const sanitized = sanitizeJsonValue(item);
    return sanitized === undefined ? [] : [[key, sanitized] as const];
  });
  return entries.length ? Object.fromEntries(entries) as JsonObject : undefined;
}

function sanitizeJsonValue(value: unknown): JsonValue | undefined {
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.flatMap((item) => {
    const sanitized = sanitizeJsonValue(item);
    return sanitized === undefined ? [] : [sanitized];
  });
  return sanitizeJsonObject(value);
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? truncate(value.trim()) : undefined;
}

function truncate(value: string, max = 1_000): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /password|passwd|passcode|secret|token|credential|authorization|cookie|session|csrf/i.test(key);
}

const promotedFingerprintMetadataKeys = new Set(["visibleText", "accessibleName", "ariaLabel", "label", "id", "testId", "dataTestId", "automationId", "entityId", "entityKind", "tagName", "role", "selector", "xpath", "queryPath", "statePath", "url", "classNames", "bounds", "attributes"]);

function issue(issues: AutomationStudioElementTargetValidationIssue[], severity: "error" | "warning", code: string, message: string, path: string): void {
  issues.push({ severity, code, message, path });
}

function compactFingerprint(value: Record<string, unknown>): AutomationStudioElementTargetFingerprint {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as AutomationStudioElementTargetFingerprint;
}

function compactCandidate(value: Record<string, unknown>): AutomationStudioElementTargetCandidate {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as AutomationStudioElementTargetCandidate;
}

function compactElementTarget(value: Record<string, unknown>): AutomationStudioElementTarget {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as AutomationStudioElementTarget;
}

function compactSelectionObject(value: Record<string, unknown>): AutomationStudioElementTargetSelection {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as AutomationStudioElementTargetSelection;
}
