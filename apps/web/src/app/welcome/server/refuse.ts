import type { AccountLinkResponse } from "./accountLinkResponse";

/** A refusal with its HTTP status; the body carries a code only, never the request. */
export function refuse(status: number, code: string): AccountLinkResponse {
  return { status, body: { ok: false, code } };
}
