import { FLUXIQ_CONNECT_CLIENT_ID, connectTokenRequestSchema } from "@fluxiq/contracts/platform";
import type { ConnectTokenRequest } from "@fluxiq/contracts/platform";
import type { ConnectExchangeResult } from "../model/index.ts";

/** Only fixed error names are returned; never echo the submitted code, verifier or unexpected fields. */
export function parseConnectTokenRequest(input: unknown): { ok: true; request: ConnectTokenRequest } | Extract<ConnectExchangeResult, { ok: false }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: { error: "invalid_request" } };
  if ("client_id" in input && input.client_id !== FLUXIQ_CONNECT_CLIENT_ID) return { ok: false, error: { error: "invalid_client" } };
  if ("grant_type" in input && input.grant_type !== "authorization_code") return { ok: false, error: { error: "unsupported_grant_type" } };
  const result = connectTokenRequestSchema.safeParse(input);
  if (!result.success) return { ok: false, error: { error: "invalid_request" } };
  return { ok: true, request: result.data };
}
