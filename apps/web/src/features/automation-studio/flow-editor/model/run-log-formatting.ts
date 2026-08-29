import type { JsonObject } from "../../../programs/program-api";

export function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}

export function parseJsonObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as JsonObject } : { ok: false, error: "JSON must be an object" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function flattenRunLogs(runs: any[]): Array<{ atMs: number; target: string; loop: string; status: string; message: string; type: string }> {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: run.metadata?.message ?? "-", type: run.targetType ?? "run" }];
    return executions.map((execution: any) => ({ atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}
