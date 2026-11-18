import type { ConnectAuthorizeRequest } from "fluxiq/platform/profile";

export type ConnectConsentView =
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "login"; signUpUrl: string | null }
  | { kind: "refused"; message: string }
  | { kind: "consent"; request: ConnectAuthorizeRequest; evidence: string; user: { displayName: string; email: string }; workspace: { name: string } };
