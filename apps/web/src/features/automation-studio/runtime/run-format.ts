export function compactConditionLabel(condition: any): string {
  if (!condition) return "Always";
  if (condition.signalPath) return `${condition.signalPath} ${condition.operator ?? "matches"}${condition.expected !== undefined ? ` ${String(condition.expected)}` : ""}`;
  if (condition.type && Array.isArray(condition.conditions)) return `${condition.type} (${condition.conditions.length})`;
  return "Condition";
}

export function flowMapFallbackLabel(flowMap: any | null): string {
  if (!flowMap?.fallback) return "-";
  if (flowMap.fallback.kind === "fail") return flowMap.fallback.message ?? "Fail";
  if (flowMap.fallback.kind === "subflow") return `Subflow ${flowMap.fallback.subflowId}`;
  return "Fallback";
}

export function safeJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function formatRuntimeTimestamp(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toLocaleString() : "-";
}

export function formatRuntimeDuration(startedAt: unknown, finishedAt: unknown): string {
  if (typeof startedAt !== "number" || typeof finishedAt !== "number") return "in progress";
  return `${Math.max(0, finishedAt - startedAt)}ms`;
}

export function runtimeAttemptKey(attempt: any, index: number): string {
  return attempt.attemptId ?? `${attempt.nodeId}:${index}`;
}

