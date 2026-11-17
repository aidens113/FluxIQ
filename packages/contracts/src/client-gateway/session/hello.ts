import type { ClientGatewayCapability } from "./capability.ts";
import type { ClientGatewayClientType } from "./client-type.ts";
import type { ClientGatewayHelloMetadata } from "./hello-metadata.ts";

/**
 * `token` is the client's credential: under gateway 0.2 the connected-client
 * credential from the connect flow (`ConnectTokenResponse.credential`), under
 * 0.1 a trusted-client token.
 *
 * `enrolmentTicket` is a one-time ticket the engine minted in its own process
 * for a managed host it launched. A hello carrying one is enrolled without a
 * person's approval, or refused with an `enrolment.*` code and closed; it never
 * falls back to pairing. It is a credential: sent only by a client with no
 * token, at most once, and never logged.
 */
export type ClientGatewayClientHello = {
  clientId?: string;
  clientType: ClientGatewayClientType;
  name?: string;
  version?: string;
  token?: string;
  enrolmentTicket?: string;
  capabilities?: ClientGatewayCapability[];
  metadata?: ClientGatewayHelloMetadata;
};
