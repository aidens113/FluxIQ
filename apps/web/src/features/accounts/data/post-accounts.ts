import type { AccountsOutcome } from "../model";
import { outcomeOfAnswer } from "./outcome-of-answer";

/**
 * Posts one request to an accounts route. The body may carry the caller's
 * proof; it is sent once and kept nowhere. An answer that is not JSON (a
 * proxy's error page) is read by its status alone; a network failure is
 * `failed`.
 */
export async function postAccounts(path: "/api/accounts/invite" | "/api/accounts/member", body: Record<string, unknown>): Promise<AccountsOutcome> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
  } catch {
    return { kind: "failed" };
  }
  const json = response.headers.get("content-type")?.includes("application/json") === true;
  const answer = json ? ((await response.json()) as Parameters<typeof outcomeOfAnswer>[1]) : undefined;
  return outcomeOfAnswer(response.status, answer);
}
