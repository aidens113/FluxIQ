import type { AccountsOutcome } from "../model";

/**
 * What an answer from an accounts route or Identity Access means for the
 * person: done; no access (403 that is not a re-proof); re-prove (a
 * `requiresRecheck` refusal); refused for a reason they can act on (the
 * route's sentence); or failed.
 */
export function outcomeOfAnswer(status: number, body: { ok?: unknown; error?: unknown; code?: unknown; requiresRecheck?: unknown } | undefined): AccountsOutcome {
  if (body?.ok === true && status < 400) return { kind: "done" };
  const message = typeof body?.error === "string" && body.error ? body.error : undefined;
  if (body?.requiresRecheck === true) return { kind: "needs-proof", message: message ?? "Type your password to confirm." };
  if (status === 401) return { kind: "refused", message: "Your session has ended. Sign in again." };
  if (status === 403 && (body?.code === undefined || body.code === "forbidden")) return { kind: "denied" };
  if (message !== undefined && status >= 400 && status < 500) return { kind: "refused", message };
  return { kind: "failed" };
}
