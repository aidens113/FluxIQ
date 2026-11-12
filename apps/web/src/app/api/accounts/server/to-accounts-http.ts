import { NextResponse } from "next/server";
import type { AccountsResponse } from "./accounts-response";

/** The HTTP response for a handler's answer, never cached. */
export function toAccountsHttp(answer: AccountsResponse): NextResponse {
  return NextResponse.json(answer.body, { status: answer.status, headers: { ...answer.headers, "cache-control": "no-store" } });
}
