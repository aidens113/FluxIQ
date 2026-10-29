import type { SetupAnswer } from "./SetupAnswer";

/** Posts the setup form; a network failure is the code `unreachable`. */
export async function postSetup(body: Record<string, string>): Promise<SetupAnswer> {
  try {
    const response = await fetch("/setup/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const answer = (await response.json()) as { ok?: boolean; code?: string; redirectTo?: string; fields?: string[]; retryAfterMs?: number };
    if (response.ok && answer.ok === true) return { ok: true, redirectTo: answer.redirectTo ?? "/" };
    const refused: Extract<SetupAnswer, { ok: false }> = { ok: false, code: answer.code ?? "failed", fields: Array.isArray(answer.fields) ? answer.fields : [] };
    if (typeof answer.retryAfterMs === "number") refused.retryAfterMs = answer.retryAfterMs;
    return refused;
  } catch {
    return { ok: false, code: "unreachable", fields: [] };
  }
}
