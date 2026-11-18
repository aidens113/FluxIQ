import type { ClientGatewayRevocationReason } from "../../platform/index.ts";
import type { ClientGatewayClientType } from "./client-type.ts";
import type { ClientGatewayManagedHost } from "./managed-host.ts";

export type ClientGatewayTrustedClient = {
  trustedClientId: string;
  clientId: string;
  /** Installation approved by the authenticated connect flow; absent on legacy pairing records. */
  clientInstallId?: string;
  /** Private audit binding to the approving platform session digest, never a raw session or public view field. */
  approvingSessionDigest?: string;
  clientType: ClientGatewayClientType;
  name: string;
  tokenHash: string;
  /** The credential before this one, until the new one is confirmed in use, within `previousValidUntil`: the reply carrying the new one can be lost. */
  previousTokenHash?: string;
  previousValidUntil?: number;
  /** Signs this client's credentials, so Core can tell one it issued from one merely naming this client. Never leaves Core. */
  reuseKey?: string;
  /** When this client last moved on from a credential: a request sent with the old one may still be arriving. */
  lastMovedOnAt?: number;
  approvedByUserId: string;
  /**
   * The domain the client declared (`client.hello` `metadata.domainId`) when
   * the person approved it, or null for none. A later connection declaring
   * another domain is not resumed and must be approved again. Absent on trust
   * minted before the domain was bound, which therefore needs a new approval.
   */
  domainId?: string | null;
  /** The managed host this trust was enrolled for (`ClientGatewayClientHello.enrolmentTicket`); absent for trust a person approved. */
  managedHost?: ClientGatewayManagedHost;
  approvedAt: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt?: number;
  revocationReason?: string;
  /**
   * What the client is told its trust ended for (`server.revoked`), kept with
   * `revokedAt` when a person or Core ended it from outside the client. Its live
   * sockets are told at once, and a later hello with its credential is told
   * again and closed instead of offered pairing. Absent when the client ended
   * the trust itself, when the trust never reached it, or when a newer approval
   * of the same client took over: such a client is not told, and pairs again.
   */
  revokedFor?: ClientGatewayRevocationReason;
};

export type ClientGatewayTrustedClientView = Omit<ClientGatewayTrustedClient, "tokenHash" | "previousTokenHash" | "reuseKey" | "approvingSessionDigest"> & {
  status: "active" | "expired" | "revoked";
};
