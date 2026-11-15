import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import type { ClientGatewayConfig } from "../config.ts";
import type { ClientGatewayCredentialCustodian } from "../credential-custody.ts";
import type { ClientGatewayFacadePorts } from "../facade-ports.ts";
import { clientGatewayCredentialHolder } from "../lifecycle.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTraceTap } from "../trace-tap/index.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "../trusted-clients.ts";
import type { ClientGatewayApprovedTrustInput, ClientGatewayIssuedTrust, ClientGatewayTrustAuthority, ClientGatewayTrustIssuance } from "./types.ts";
import { ClientGatewayTrustIssuanceError } from "./issuance-error.ts";
import { validateApprovedTrustInput, validateTrustApproval } from "./validation.ts";

type TrustIssuerCollaborators = {
  config: ClientGatewayConfig;
  trustedClients: ClientGatewayTrustedClientRegistry;
  authority: ClientGatewayTrustAuthority | undefined;
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  trace: ClientGatewayTraceTap;
  facade: ClientGatewayFacadePorts;
  custody: ClientGatewayCredentialCustodian;
};

/** Server-only ordinary trust issuance before a client socket exists. There is no pairing or managed ticket here. */
export class ClientGatewayTrustIssuer implements ClientGatewayTrustIssuance {
  constructor(private readonly collaborators: TrustIssuerCollaborators) {}

  async issue(rawInput: ClientGatewayApprovedTrustInput): Promise<ClientGatewayIssuedTrust> {
    const input = validateApprovedTrustInput(rawInput);
    const c = this.collaborators;
    const authority = c.authority;
    if (!c.config.enabled || !c.config.trustedClientStore || typeof authority?.validateApproval !== "function" || typeof authority.grantCredential !== "function") throw new ClientGatewayTrustIssuanceError("unavailable");
    const approval = async () => {
      try {
        return validateTrustApproval(input, await authority.validateApproval({ userId: input.approvedByUserId, approvingSessionDigest: input.approvingSessionDigest }));
      } catch (error) {
        if (error instanceof ClientGatewayTrustIssuanceError) throw error;
        throw new ClientGatewayTrustIssuanceError("unavailable");
      }
    };
    let issued: Awaited<ReturnType<ClientGatewayTrustedClientRegistry["issueApproved"]>>;
    try {
      await c.facade.ready();
      issued = await c.trustedClients.issueApproved(input, approval);
    } catch (error) {
      if (error instanceof ClientGatewayTrustIssuanceError) throw error;
      throw new ClientGatewayTrustIssuanceError("persistence_failed");
    }
    try {
      for (const replaced of issued.replaced) await this.retireReplaced(replaced);
      await authority.grantCredential({
        credential: issued.token,
        trustedClientId: issued.trustedClient.trustedClientId,
        userId: issued.trustedClient.approvedByUserId,
        approvingSessionDigest: input.approvingSessionDigest,
        expiresAt: issued.trustedClient.expiresAt
      });
      // Legacy custody remains informational; a strict failure cannot be converted to success by its guarded observer.
      await c.custody.issued({ holder: clientGatewayCredentialHolder(issued.trustedClient), credential: issued.token, approvedBySessionDigest: input.approvingSessionDigest });
      await approval();
      if (c.trustedClients.get(issued.trustedClient.trustedClientId) !== issued.trustedClient || !c.trustedClients.isActive(issued.trustedClient)) throw new ClientGatewayTrustIssuanceError("trust_ended");
      c.audit.recordSecurity("trust.issued", "Authenticated consent created durable client trust before its connection.", { trustedClientId: issued.trustedClient.trustedClientId, clientId: input.clientId, approvedByUserId: input.approvedByUserId });
      return { credential: issued.token, credentialExpiresAt: issued.trustedClient.expiresAt, trustedClientId: issued.trustedClient.trustedClientId };
    } catch (error) {
      try {
        if (c.trustedClients.isActive(issued.trustedClient)) await c.facade.revokeTrustedClient(issued.trustedClient.trustedClientId, "credential delivery or its approval ended before publication");
        if (c.trustedClients.isActive(issued.trustedClient)) throw new ClientGatewayTrustIssuanceError("cleanup_failed");
        // Another issuance may already have revoked it during the strict grant. Its holder must still be forgotten.
        await c.custody.forgotten(issued.trustedClient.trustedClientId);
      } catch {
        throw new ClientGatewayTrustIssuanceError("cleanup_failed");
      }
      if (error instanceof ClientGatewayTrustIssuanceError) throw error;
      throw new ClientGatewayTrustIssuanceError("delivery_failed");
    }
  }

  private async retireReplaced(client: ClientGatewayTrustedClient): Promise<void> {
    const c = this.collaborators;
    const reason = "the same client installation was approved again";
    await c.custody.forgotten(client.trustedClientId);
    for (const session of c.sessions.listReadyByTrustedClient(client.trustedClientId)) {
      c.trace.lifecycle({ sessionId: session.sessionId, clientId: session.clientId }, "trust.revoked", { trustedClientId: client.trustedClientId, reason });
      try {
        await c.transport.send(session.sessionId, c.transport.message("server.disconnect", { reason: "Client trust was replaced." }, session));
      } catch (error) {
        // The notice is best-effort; durable revocation and disconnect still end the old session.
        c.audit.record("trust.disconnect_notice_failed", "A replaced client's socket could not receive its disconnect notice.", { trustedClientId: client.trustedClientId, sessionId: session.sessionId, error: error instanceof Error ? error.name : "non_error" });
      } finally {
        c.facade.disconnect(session.sessionId, "client trust replaced");
      }
    }
    c.audit.record("trust.revoked", "An earlier trust of the same client installation was ended.", { trustedClientId: client.trustedClientId, clientId: client.clientId, reason });
  }
}
