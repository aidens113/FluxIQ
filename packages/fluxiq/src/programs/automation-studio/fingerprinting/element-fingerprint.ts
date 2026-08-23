import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { StateBounds, StateSnapshot, StateValue, StateVisualLayer } from "../model/state.ts";

export type ElementFingerprint = {
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
  statePath?: string | { namespace: string; path: string };
  url?: string;
  classNames?: string[];
  bounds?: StateBounds;
  attributes?: Record<string, string>;
  metadata?: JsonObject;
};

export type ElementFingerprintCandidate = ElementFingerprint & {
  candidateId: string;
  visualFrameId?: string;
  visualLayerId?: string;
  isVisibleOnViewport?: boolean;
};

export type ElementFingerprintContribution = {
  signalPath: string;
  score: number;
  weight: number;
  reason: string;
  metadata?: JsonObject;
};

export type ElementFingerprintScore = {
  candidateId: string;
  totalScore: number;
  normalizedScore: number;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  positiveContributions: ElementFingerprintContribution[];
  negativeContributions: ElementFingerprintContribution[];
  candidate: ElementFingerprintCandidate;
  metadata?: JsonObject;
};

export type ElementFingerprintWeights = {
  visibleText: number;
  accessibleName: number;
  label: number;
  id: number;
  testId: number;
  automationId: number;
  entityId: number;
  statePath: number;
  role: number;
  tagName: number;
  entityKind: number;
  selector: number;
  queryPath: number;
  xpath: number;
  url: number;
  classNames: number;
  bounds: number;
  attributes: number;
  visibility: number;
};

export type ElementFingerprintScoringOptions = {
  weights?: Partial<ElementFingerprintWeights>;
  minimumNormalizedScore?: number;
  metadata?: JsonObject;
};

export type AutomationStudioElementMatcher = {
  readonly weights: ElementFingerprintWeights;
  scoreCandidate(fingerprint: ElementFingerprint, candidate: ElementFingerprintCandidate, options?: ElementFingerprintScoringOptions): ElementFingerprintScore;
  scoreCandidates(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options?: ElementFingerprintScoringOptions): ElementFingerprintScore[];
  bestCandidate(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options?: ElementFingerprintScoringOptions): ElementFingerprintScore | null;
  candidatesFromStateSnapshot(snapshot: StateSnapshot, options?: { includeHidden?: boolean }): ElementFingerprintCandidate[];
};

export const DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS: ElementFingerprintWeights = {
  visibleText: 24,
  accessibleName: 24,
  label: 20,
  id: 26,
  testId: 28,
  automationId: 28,
  entityId: 24,
  statePath: 22,
  role: 10,
  tagName: 7,
  entityKind: 8,
  selector: 14,
  queryPath: 13,
  xpath: 11,
  url: 10,
  classNames: 5,
  bounds: 8,
  attributes: 6,
  visibility: 4
};

export function createAutomationStudioElementMatcher(options: { weights?: Partial<ElementFingerprintWeights> } = {}): AutomationStudioElementMatcher {
  const weights = { ...DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS, ...(options.weights ?? {}) };
  return {
    weights,
    scoreCandidate: (fingerprint, candidate, scoringOptions) => scoreElementFingerprintCandidate(fingerprint, candidate, { weights, ...scoringOptions }),
    scoreCandidates: (fingerprint, candidates, scoringOptions) => scoreElementFingerprintCandidates(fingerprint, candidates, { weights, ...scoringOptions }),
    bestCandidate: (fingerprint, candidates, scoringOptions) => bestElementFingerprintCandidate(fingerprint, candidates, { weights, ...scoringOptions }),
    candidatesFromStateSnapshot
  };
}

export function scoreElementFingerprintCandidates(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore[] {
  const minimum = options.minimumNormalizedScore ?? 0;
  return candidates
    .map((candidate) => scoreElementFingerprintCandidate(fingerprint, candidate, options))
    .filter((score) => score.normalizedScore >= minimum)
    .sort((left, right) => right.totalScore - left.totalScore || right.normalizedScore - left.normalizedScore || left.candidateId.localeCompare(right.candidateId));
}

export function bestElementFingerprintCandidate(fingerprint: ElementFingerprint, candidates: ElementFingerprintCandidate[], options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore | null {
  return scoreElementFingerprintCandidates(fingerprint, candidates, options)[0] ?? null;
}

export function scoreElementFingerprintCandidate(fingerprint: ElementFingerprint, candidate: ElementFingerprintCandidate, options: ElementFingerprintScoringOptions = {}): ElementFingerprintScore {
  const weights = { ...DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS, ...(options.weights ?? {}) };
  const positiveContributions: ElementFingerprintContribution[] = [];
  const negativeContributions: ElementFingerprintContribution[] = [];
  const matchedSignals: string[] = [];
  const failedSignals: string[] = [];
  let possibleScore = 0;

  const contribute = (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => {
    const weight = weights[signalPath];
    possibleScore += weight;
    const score = round(weight * similarity);
    const contribution: ElementFingerprintContribution = { signalPath, score, weight, reason, ...(metadata ? { metadata } : {}) };
    if (score >= 0) {
      positiveContributions.push(contribution);
      if (similarity >= 0.78) matchedSignals.push(signalPath);
    } else {
      negativeContributions.push(contribution);
      failedSignals.push(signalPath);
    }
  };

  compareTextSignal("visibleText", fingerprint.visibleText, candidate.visibleText, weights.visibleText, contribute);
  compareTextSignal("accessibleName", fingerprint.accessibleName, candidate.accessibleName, weights.accessibleName, contribute);
  compareTextSignal("label", fingerprint.label, candidate.label, weights.label, contribute);
  compareExactSignal("id", fingerprint.id, candidate.id, contribute);
  compareExactSignal("testId", fingerprint.testId, candidate.testId, contribute);
  compareExactSignal("automationId", fingerprint.automationId, candidate.automationId, contribute);
  compareExactSignal("entityId", fingerprint.entityId, candidate.entityId, contribute);
  compareExactSignal("statePath", statePathKey(fingerprint.statePath), statePathKey(candidate.statePath), contribute);
  compareLooseSignal("role", fingerprint.role, candidate.role, contribute);
  compareLooseSignal("tagName", fingerprint.tagName, candidate.tagName, contribute);
  compareLooseSignal("entityKind", fingerprint.entityKind, candidate.entityKind, contribute);
  comparePathSignal("selector", fingerprint.selector, candidate.selector, contribute);
  comparePathSignal("queryPath", fingerprint.queryPath, candidate.queryPath, contribute);
  comparePathSignal("xpath", fingerprint.xpath, candidate.xpath, contribute);
  compareUrlSignal(fingerprint.url, candidate.url, contribute);
  compareClassNames(fingerprint.classNames, candidate.classNames, contribute);
  compareAttributes(fingerprint.attributes, candidate.attributes, contribute);
  compareBounds(fingerprint.bounds, candidate.bounds, contribute);
  if (candidate.isVisibleOnViewport === true) contribute("visibility", 1, "candidate is visible on the viewport");

  const totalScore = round([...positiveContributions, ...negativeContributions].reduce((sum, item) => sum + item.score, 0));
  const normalizedScore = possibleScore > 0 ? clamp(round(totalScore / possibleScore), -1, 1) : 0;
  const strongMatches = matchedSignals.filter((signal) => ["visibleText", "accessibleName", "label", "id", "testId", "automationId", "entityId", "statePath"].includes(signal)).length;
  const confidence = clamp(round(Math.max(0, normalizedScore) * (0.82 + Math.min(strongMatches, 3) * 0.06)), 0, 1);
  return { candidateId: candidate.candidateId, totalScore, normalizedScore, confidence, matchedSignals, failedSignals, positiveContributions, negativeContributions, candidate, ...(options.metadata ? { metadata: options.metadata } : {}) };
}

export function candidatesFromStateSnapshot(snapshot: StateSnapshot, options: { includeHidden?: boolean } = {}): ElementFingerprintCandidate[] {
  const candidates = new Map<string, ElementFingerprintCandidate>();
  for (const frame of snapshot.presentation?.visualFrames ?? []) {
    for (const layer of frame.layers) {
      if (!options.includeHidden && "isVisibleOnViewport" in layer && layer.isVisibleOnViewport === false) continue;
      const candidate = candidateFromVisualLayer(layer, frame.id, snapshot.id);
      if (candidate) candidates.set(candidate.candidateId, candidate);
    }
  }
  for (const [namespace, stateNamespace] of Object.entries(snapshot.namespaces)) {
    for (const [path, value] of Object.entries(stateNamespace.values)) {
      const candidate = candidateFromStateValue(namespace, path, value, snapshot.id);
      if (candidate && !candidates.has(candidate.candidateId)) candidates.set(candidate.candidateId, candidate);
    }
  }
  return [...candidates.values()];
}

function candidateFromVisualLayer(layer: StateVisualLayer, visualFrameId: string, stateSnapshotId: string | undefined): ElementFingerprintCandidate | null {
  if (layer.kind === "image") return null;
  const metadata = layer.metadata ?? {};
  const anchor = "anchor" in layer ? layer.anchor : undefined;
  const entityId = readString(metadata.entityId) ?? (anchor?.type === "entity" ? anchor.entityId : undefined) ?? (anchor?.type === "element" ? anchor.elementId : undefined);
  const candidateId = entityId ?? readString(metadata.id) ?? readString(metadata.testId) ?? readString(metadata.automationId) ?? ("statePath" in layer ? layer.statePath : undefined) ?? `${visualFrameId}:${layer.id}`;
  return compactCandidate({
    candidateId,
    visualFrameId,
    visualLayerId: layer.id,
    visibleText: layer.kind === "text" ? layer.content : readString(metadata.visibleText),
    accessibleName: readString(metadata.accessibleName) ?? readString(metadata.ariaLabel),
    label: "label" in layer ? layer.label : readString(metadata.label),
    id: readString(metadata.id),
    testId: readString(metadata.testId) ?? readString(metadata.dataTestId),
    automationId: readString(metadata.automationId),
    entityId,
    entityKind: readString(metadata.entityKind) ?? (anchor?.type === "entity" ? anchor.entityKind : undefined),
    tagName: readString(metadata.tagName),
    role: readString(metadata.role),
    selector: readString(metadata.selector),
    xpath: readString(metadata.xpath),
    queryPath: readString(metadata.queryPath),
    statePath: "statePath" in layer ? layer.statePath : undefined,
    url: readString(metadata.url),
    classNames: readStringArray(metadata.classNames),
    bounds: "bounds" in layer ? layer.bounds : undefined,
    attributes: readAttributes(metadata.attributes),
    isVisibleOnViewport: "isVisibleOnViewport" in layer ? layer.isVisibleOnViewport : undefined,
    metadata: { ...metadata, ...(stateSnapshotId ? { stateSnapshotId } : {}) }
  });
}

function candidateFromStateValue(namespace: string, path: string, value: StateValue, stateSnapshotId: string | undefined): ElementFingerprintCandidate | null {
  if (value.sensitive) return null;
  const metadata = value.metadata ?? {};
  const presentation = value.presentation;
  const statePath = { namespace, path };
  const label = presentation?.label ?? readString(metadata.label);
  const entityId = readString(metadata.entityId) ?? (presentation?.anchor?.type === "entity" ? presentation.anchor.entityId : undefined) ?? (presentation?.anchor?.type === "element" ? presentation.anchor.elementId : undefined);
  const visibleText = typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean" ? String(value.value) : readString(metadata.visibleText);
  if (!entityId && !label && !visibleText && !readString(metadata.selector) && !readString(metadata.xpath)) return null;
  return compactCandidate({
    candidateId: entityId ?? `${namespace}.${path}`,
    visibleText,
    accessibleName: readString(metadata.accessibleName) ?? readString(metadata.ariaLabel),
    label,
    id: readString(metadata.id),
    testId: readString(metadata.testId) ?? readString(metadata.dataTestId),
    automationId: readString(metadata.automationId),
    entityId,
    entityKind: readString(metadata.entityKind),
    tagName: readString(metadata.tagName),
    role: value.semanticRole ?? readString(metadata.role),
    selector: readString(metadata.selector),
    xpath: readString(metadata.xpath),
    queryPath: readString(metadata.queryPath),
    statePath,
    url: readString(metadata.url),
    classNames: readStringArray(metadata.classNames),
    attributes: readAttributes(metadata.attributes),
    metadata: { ...metadata, ...(stateSnapshotId ? { stateSnapshotId } : {}) }
  });
}

function compareTextSignal(signalPath: "visibleText" | "accessibleName" | "label", expected: string | undefined, actual: string | undefined, _weight: number, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!hasText(expected)) return;
  if (!hasText(actual)) { contribute(signalPath, -0.45, "candidate is missing text"); return; }
  const similarity = textSimilarity(expected, actual);
  contribute(signalPath, similarity >= 0.35 ? similarity : -0.55, similarity >= 0.92 ? "text matched exactly" : "text compared by normalized overlap", { expected: normalizeText(expected), actual: normalizeText(actual) });
}

function compareExactSignal(signalPath: "id" | "testId" | "automationId" | "entityId" | "statePath", expected: string | undefined, actual: string | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!hasText(expected)) return;
  if (!hasText(actual)) { contribute(signalPath, -0.55, "candidate is missing stable identifier"); return; }
  contribute(signalPath, normalizeCase(expected) === normalizeCase(actual) ? 1 : -0.8, "stable identifier comparison", { expected, actual });
}

function compareLooseSignal(signalPath: "role" | "tagName" | "entityKind", expected: string | undefined, actual: string | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!hasText(expected)) return;
  if (!hasText(actual)) { contribute(signalPath, -0.25, "candidate is missing semantic signal"); return; }
  contribute(signalPath, normalizeCase(expected) === normalizeCase(actual) ? 1 : -0.35, "semantic signal comparison", { expected, actual });
}

function comparePathSignal(signalPath: "selector" | "queryPath" | "xpath", expected: string | undefined, actual: string | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!hasText(expected)) return;
  if (!hasText(actual)) { contribute(signalPath, -0.25, "candidate is missing structural path"); return; }
  const similarity = pathSimilarity(expected, actual);
  contribute(signalPath, similarity >= 0.5 ? similarity : -0.3, "structural path comparison", { expected, actual });
}

function compareUrlSignal(expected: string | undefined, actual: string | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!hasText(expected)) return;
  if (!hasText(actual)) { contribute("url", -0.15, "candidate is missing URL context"); return; }
  contribute("url", urlSimilarity(expected, actual), "URL context comparison", { expected, actual });
}

function compareClassNames(expected: string[] | undefined, actual: string[] | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!expected?.length) return;
  if (!actual?.length) { contribute("classNames", -0.1, "candidate is missing class names"); return; }
  const overlap = jaccard(expected.map(normalizeCase), actual.map(normalizeCase));
  contribute("classNames", overlap >= 0.2 ? overlap : -0.1, "class name overlap", { expected: expected.join(" "), actual: actual.join(" ") });
}

function compareAttributes(expected: Record<string, string> | undefined, actual: Record<string, string> | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  const entries = Object.entries(expected ?? {}).filter(([, value]) => hasText(value));
  if (!entries.length) return;
  if (!actual) { contribute("attributes", -0.2, "candidate is missing attributes"); return; }
  const matches = entries.filter(([key, value]) => normalizeCase(actual[key]) === normalizeCase(value)).length;
  contribute("attributes", matches / entries.length, "attribute comparison", { matched: matches, expected: entries.length });
}

function compareBounds(expected: StateBounds | undefined, actual: StateBounds | undefined, contribute: (signalPath: keyof ElementFingerprintWeights, similarity: number, reason: string, metadata?: JsonObject) => void): void {
  if (!expected) return;
  if (!actual) { contribute("bounds", -0.15, "candidate is missing bounds"); return; }
  const expectedCenter = center(expected);
  const actualCenter = center(actual);
  const diagonal = Math.max(Math.hypot(expected.width, expected.height), 1);
  const distance = Math.hypot(expectedCenter.x - actualCenter.x, expectedCenter.y - actualCenter.y);
  const sizeRatio = Math.min(area(expected), area(actual)) / Math.max(area(expected), area(actual), 1);
  const similarity = clamp((1 - Math.min(distance / diagonal, 1)) * 0.7 + sizeRatio * 0.3, 0, 1);
  contribute("bounds", similarity, "bounds proximity comparison", { distance: round(distance), sizeRatio: round(sizeRatio) });
}

function textSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (normalizedLeft === normalizedRight) return 1;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.82;
  return jaccard(normalizedLeft.split(" "), normalizedRight.split(" "));
}

function pathSimilarity(left: string, right: string): number {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  if (normalizedLeft === normalizedRight) return 1;
  const leftParts = normalizedLeft.split(/[\s>/.[\]()=:]+/).filter(Boolean).map(normalizeCase);
  const rightParts = normalizedRight.split(/[\s>/.[\]()=:]+/).filter(Boolean).map(normalizeCase);
  return jaccard(leftParts, rightParts);
}

function urlSimilarity(left: string, right: string): number {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (leftUrl.origin !== rightUrl.origin) return -0.2;
    return leftUrl.pathname === rightUrl.pathname ? 1 : 0.55;
  } catch {
    return normalizeCase(left) === normalizeCase(right) ? 1 : -0.1;
  }
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left.filter(Boolean));
  const rightSet = new Set(right.filter(Boolean));
  if (!leftSet.size || !rightSet.size) return 0;
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  return intersection / new Set([...leftSet, ...rightSet]).size;
}

function center(bounds: StateBounds): { x: number; y: number } { return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }; }
function area(bounds: StateBounds): number { return Math.max(bounds.width, 0) * Math.max(bounds.height, 0); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function round(value: number): number { return Math.round(value * 1_000) / 1_000; }
function hasText(value: string | undefined): value is string { return typeof value === "string" && value.trim().length > 0; }
function normalizeCase(value: string | undefined): string { return normalizeText(value ?? ""); }
function normalizeText(value: string): string { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
function statePathKey(value: ElementFingerprint["statePath"]): string | undefined { return typeof value === "string" ? value : value ? `${value.namespace}.${value.path}` : undefined; }

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: JsonValue | undefined): string[] | undefined {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" && item.trim() ? [item] : []);
  if (typeof value === "string" && value.trim()) return value.split(/\s+/).filter(Boolean);
  return undefined;
}

function readAttributes(value: JsonValue | undefined): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[key, item] as const] : []);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function compactCandidate(value: Record<string, unknown>): ElementFingerprintCandidate {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as ElementFingerprintCandidate;
}
