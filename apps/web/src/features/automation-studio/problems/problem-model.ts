export const PROBLEMS_PAGE_SIZE = 100;
export const MAX_PROBLEM_INPUTS_SCANNED = 20_000;
export const MAX_NORMALIZED_PROBLEMS = 5_000;

export type AutomationProblemSeverity = "error" | "warning" | "info";

export type AutomationProblemSource = Readonly<Record<string, unknown>> & {
  id?: unknown; code?: unknown; severity?: unknown; blocking?: unknown;
  label?: unknown; message?: unknown; source?: unknown; viewId?: unknown;
  flowId?: unknown; subflowId?: unknown; artifactId?: unknown; nodeId?: unknown;
  edgeId?: unknown; routeId?: unknown; fieldId?: unknown; artifactLabel?: unknown;
  subflowLabel?: unknown; flowLabel?: unknown; artifactKind?: unknown;
};

export type AutomationProblemViewItem = {
  problemKey: string; code: string; label: string; message: string;
  severity: AutomationProblemSeverity; blocking: boolean; scopeLabel: string;
  scopeIds: readonly string[]; source: AutomationProblemSource;
};

export type AutomationProblemCollection = {
  items: readonly AutomationProblemViewItem[];
  inputCount: number;
  scannedCount: number;
  truncated: boolean;
};

export type AutomationProblemFilter = "all" | AutomationProblemSeverity;
export type AutomationProblemScope = "project" | "current";
export type AutomationProblemPage = {
  items: readonly AutomationProblemViewItem[];
  filteredCount: number;
  offset: number;
  counts: Readonly<Record<AutomationProblemSeverity, number>>;
};

const severityValues = ["error", "warning", "info"] as const;

export function collectAutomationProblems(
  problems: readonly AutomationProblemSource[],
  options: { maxInputs?: number; maxProblems?: number } = {}
): AutomationProblemCollection {
  const maxInputs = positiveLimit(options.maxInputs, MAX_PROBLEM_INPUTS_SCANNED);
  const maxProblems = positiveLimit(options.maxProblems, MAX_NORMALIZED_PROBLEMS);
  const buckets = new Map<AutomationProblemSeverity, Map<string, AutomationProblemViewItem>>(
    severityValues.map((severity) => [severity, new Map()])
  );
  const scannedCount = Math.min(problems.length, maxInputs);

  for (let index = 0; index < scannedCount; index += 1) {
    const source = problems[index];
    if (!source || typeof source !== "object") continue;
    const item = normalizeAutomationProblem(source);
    const bucket = buckets.get(item.severity)!;
    if (!bucket.has(item.problemKey) && bucket.size < maxProblems) bucket.set(item.problemKey, item);
  }

  const items = severityValues
    .flatMap((severity) => [...buckets.get(severity)!.values()])
    .sort(compareProblems)
    .slice(0, maxProblems);
  return {
    items,
    inputCount: problems.length,
    scannedCount,
    truncated: scannedCount < problems.length || bucketsSize(buckets) > items.length
  };
}

export function normalizeAutomationProblems(problems: readonly AutomationProblemSource[]): AutomationProblemViewItem[] {
  return [...collectAutomationProblems(problems).items];
}

export function automationProblemsForScope(
  problems: readonly AutomationProblemViewItem[],
  currentObjectId?: string | null
): AutomationProblemViewItem[] {
  return currentObjectId ? problems.filter((problem) => problem.scopeIds.includes(currentObjectId)) : [...problems];
}

export function pageAutomationProblems(
  problems: readonly AutomationProblemViewItem[],
  options: {
    currentObjectId?: string | null;
    filter: AutomationProblemFilter;
    query?: string;
    scope: AutomationProblemScope;
    offset: number;
    pageSize?: number;
  }
): AutomationProblemPage {
  const scoped = options.scope === "current" ? automationProblemsForScope(problems, options.currentObjectId) : [...problems];
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const searched = query ? scoped.filter((problem) => problemSearchText(problem).includes(query)) : scoped;
  const counts = {
    error: searched.filter((problem) => problem.severity === "error").length,
    warning: searched.filter((problem) => problem.severity === "warning").length,
    info: searched.filter((problem) => problem.severity === "info").length
  };
  const filtered = options.filter === "all" ? searched : searched.filter((problem) => problem.severity === options.filter);
  const pageSize = positiveLimit(options.pageSize, PROBLEMS_PAGE_SIZE);
  const maxOffset = filtered.length ? Math.floor((filtered.length - 1) / pageSize) * pageSize : 0;
  const offset = Math.min(Math.max(0, Math.trunc(options.offset)), maxOffset);
  return { items: filtered.slice(offset, offset + pageSize), filteredCount: filtered.length, offset, counts };
}

export function normalizedProblemSeverity(value: unknown): AutomationProblemSeverity {
  const severity = String(value ?? "error").toLowerCase();
  if (severity === "warning" || severity === "warn") return "warning";
  if (severity === "info" || severity === "notice") return "info";
  return "error";
}

export function problemSeverityRank(value: unknown): number {
  const severity = normalizedProblemSeverity(value);
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function normalizeAutomationProblem(source: AutomationProblemSource): AutomationProblemViewItem {
  const severity = normalizedProblemSeverity(source.severity);
  const code = textValue(source.code) || textValue(source.id) || "problem.unknown";
  const scopeIds = [source.flowId, source.subflowId, source.artifactId, source.nodeId, source.edgeId, source.routeId, source.fieldId]
    .map(textValue).filter(Boolean);
  const scopeLabel = textValue(source.artifactLabel) || textValue(source.subflowLabel) || textValue(source.flowLabel)
    || textValue(source.artifactId) || textValue(source.artifactKind) || textValue(source.source) || "Project";
  const label = textValue(source.label) || code;
  const message = textValue(source.message) || "No explanation was provided.";
  return {
    problemKey: [code, ...scopeIds, message].join("|"),
    code, label, message, severity,
    blocking: source.blocking === true || severity === "error",
    scopeLabel, scopeIds, source
  };
}

function compareProblems(left: AutomationProblemViewItem, right: AutomationProblemViewItem): number {
  return problemSeverityRank(left.severity) - problemSeverityRank(right.severity)
    || left.scopeLabel.localeCompare(right.scopeLabel)
    || left.code.localeCompare(right.code)
    || left.problemKey.localeCompare(right.problemKey);
}

function problemSearchText(problem: AutomationProblemViewItem): string {
  return [problem.label, problem.message, problem.code, problem.scopeLabel].join(" ").toLocaleLowerCase();
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function bucketsSize(buckets: ReadonlyMap<AutomationProblemSeverity, ReadonlyMap<string, AutomationProblemViewItem>>): number {
  let count = 0;
  for (const bucket of buckets.values()) count += bucket.size;
  return count;
}
