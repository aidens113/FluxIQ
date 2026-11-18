import type { AccountsResponse } from "../../accounts/server";
import { authorizeAuditRoute } from "./authorize-audit-route";
import { assembleAuditActivity } from "./audit-read";
import type { AuditRouteDeps } from "./types";

/** Existing callers retain the actual IAM decision before any audit source is opened. */
export async function readActivity(deps: AuditRouteDeps, cursorText: string | null): Promise<AccountsResponse> {
  const refusal = await authorizeAuditRoute(deps);
  if (refusal) return refusal;
  return assembleAuditActivity(() => deps.activity(), cursorText);
}
