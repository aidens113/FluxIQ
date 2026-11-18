import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTrustedClientStore } from "../../../client-gateway/index.ts";

/** Server-owned routing binding, revealed only after credential proof. */
export type ClientTrustBinding = { workspaceId: string } & Pick<ClientGatewayTrustedClient,
  "trustedClientId" | "approvedByUserId" | "clientId" | "clientType" | "domainId" | "managedHost">;

/** This is proof and routing data, never a platform identity/membership or live-session authorization grant. */
export type ClientTrustCredentialProof =
  | { status: "current" | "previous"; binding: ClientTrustBinding }
  | { status: "obsolete"; binding: ClientTrustBinding; reuse: "revoke" | "request-in-flight" }
  | { status: "inactive"; binding: ClientTrustBinding; reason: "revoked" | "expired" }
  | { status: "invalid"; reason: "unknown" | "forged" };

export type ClientTrustRepository = {
  /** One independent writer snapshot. Load before save; stale generations reject instead of replacing newer authority. */
  scopedStore(workspaceId: string): ClientGatewayTrustedClientStore;
  lookupCredential(token: string, options?: { request?: boolean }): Promise<ClientTrustCredentialProof>;
  /** Current ordinary clients across all workspaces. A trusted issuer may exclude its own replacement installation. */
  countActiveForUser(userId: string, replacement?: { workspaceId: string; clientId: string; clientInstallId: string }): Promise<number>;
  /** The same current ordinary clients as their routing bindings (never a credential), so each can be revoked in its own workspace. */
  listActiveForUser(userId: string): Promise<ClientTrustBinding[]>;
  close(): Promise<void>;
};
