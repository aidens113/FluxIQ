import type { FluxNodeIssue } from "@fluxiq/contracts/fluxnode";

/** The part of a zod schema this API uses: what it parses and the issues it gives when it refuses. */
export type FluxNodeBodySchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: Array<string | number>; code: string; message: string }> } };
};

/** A parse that never throws: the value, or each issue at its JSON Pointer. */
export function parseFluxNodeBody<T>(schema: FluxNodeBodySchema<T>, value: unknown): { ok: true; value: T } | { ok: false; issues: FluxNodeIssue[] } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.slice(0, 200).map((issue): FluxNodeIssue => ({
    path: issue.path.length === 0 ? "" : `/${issue.path.map((step) => String(step).replace(/~/gu, "~0").replace(/\//gu, "~1")).join("/")}`,
    code: issue.code,
    message: issue.message === "" ? "The value is not valid." : issue.message
  }));
  return { ok: false, issues };
}
