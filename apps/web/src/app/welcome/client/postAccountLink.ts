export type AccountLinkAnswer = { ok: true; continueUrl: string | null } | { ok: false; code: string };

/** Posts JSON to an account-link route; a network failure is the code `unreachable`. */
export async function postAccountLink(url: string, body: Record<string, string>): Promise<AccountLinkAnswer> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const answer = (await response.json()) as { ok?: boolean; code?: string; continueUrl?: string };
    if (response.ok && answer.ok === true) return { ok: true, continueUrl: answer.continueUrl ?? null };
    return { ok: false, code: answer.code ?? "failed" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}
