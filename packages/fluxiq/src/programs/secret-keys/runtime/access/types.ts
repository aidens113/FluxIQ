import type { SecretKeySummary } from "../../types.ts";

/** Trusted in-process references; a user id alone is never an authenticated principal. */
export type SecretKeyUsePrincipal =
  | { kind: "session"; userId: string; sessionId: string; purpose?: "workspace-assistant" }
  | { kind: "client"; userId: string; trustedClientId: string; purpose?: "workspace-assistant" }
  | { kind: "standing"; userId: string; authorizationId: string; projectId: string; flowId: string; purpose: "loop_verification" | "repair" };

/** Rechecked at mint and consumption against current identity, tenant and IAM authority. */
export type SecretKeyUseAuthority = (input: { principal: SecretKeyUsePrincipal; key: SecretKeySummary }) => Promise<{ ownerUserId: string; expiresAtMs: number } | null>;

export type SecretKeyUseAuthorization = { id: string; principal: SecretKeyUsePrincipal; ttlMs?: number };
