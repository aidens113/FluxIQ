import type { ClientGatewayClientType, ClientGatewaySessionReady, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ConnectUserSummary, ConnectWorkspaceSummary } from "@fluxiq/contracts/platform";
import type { InternalSession } from "../types.ts";

export type ClientGatewaySessionMetadata = { user: ConnectUserSummary; workspace: ConnectWorkspaceSummary };

export type ClientGatewaySessionMetadataProvider = (input: Readonly<{
  trustedClientId: string;
  userId: string;
  clientType: ClientGatewayClientType;
}>) => Promise<ClientGatewaySessionMetadata | null>;

export type ClientGatewaySessionMetadataBinding = Readonly<{
  session: InternalSession;
  client: ClientGatewayTrustedClient;
  trustedClientId: string;
  clientId: string;
  clientType: ClientGatewayClientType;
  userId: string;
  domainId: string | null | undefined;
  managedHost: ClientGatewayTrustedClient["managedHost"];
  managedHostId: string | undefined;
  managedHostProfile: string | undefined;
}>;

export type ClientGatewayResolvedSessionMetadata = {
  tokenHash: string;
  fields: Pick<ClientGatewaySessionReady, "user" | "workspace"> & { credentialExpiresAt: number };
};
