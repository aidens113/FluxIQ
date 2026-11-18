import type { ConnectAuthorizeRequest, ConnectTokenResponse } from "fluxiq/platform/profile";
import { connectRequestParams } from "../../model";

export const ORIGIN = "https://app.example.test";
export const RAW_COOKIE = "synthetic-actual-panel-cookie";
export const SYNTHETIC_CODE = "c".repeat(43);
export const AUTHORIZE_REQUEST: ConnectAuthorizeRequest = {
  client_id: "fluxiq-browser-extension",
  redirect_uri: `${ORIGIN}/connect/done`,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  state: "synthetic-state-0123456789",
  client_install_id: "synthetic-install-id",
  client_label: "Synthetic browser"
};

export const TOKEN_RESPONSE: ConnectTokenResponse = {
  credential: "synthetic-credential-01234567890123456789",
  credentialExpiresAt: 2_000_000,
  connectedClientId: "client.synthetic",
  user: { userId: "user.synthetic", displayName: "Synthetic User", email: "synthetic@example.test" },
  workspace: { workspaceId: "workspace.synthetic", name: "Synthetic workspace" },
  gatewayUrl: "wss://app.example.test/gateway"
};

export const TOKEN_REQUEST = { grant_type: "authorization_code", code: SYNTHETIC_CODE, code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", redirect_uri: AUTHORIZE_REQUEST.redirect_uri, client_id: AUTHORIZE_REQUEST.client_id, client_install_id: AUTHORIZE_REQUEST.client_install_id };

export function authorizeParams(): URLSearchParams {
  return connectRequestParams(AUTHORIZE_REQUEST);
}

export function publicRequest(body: unknown = TOKEN_REQUEST, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/connect/token`, { method: "POST", headers: { "content-type": "application/json", "fluxiq-client": "browser-extension", ...headers }, body: JSON.stringify(body) });
}
