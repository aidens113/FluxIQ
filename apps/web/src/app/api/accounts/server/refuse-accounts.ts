import type { AccountsResponse } from "./accounts-response";

/** A refusal with its status, code and the sentence the panel shows. */
export function refuseAccounts(status: number, code: string, error: string): AccountsResponse {
  return { status, body: { ok: false, code, error } };
}
