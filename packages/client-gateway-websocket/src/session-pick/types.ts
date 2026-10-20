import type { ClientGatewayCapability, ClientGatewayClientType } from "@fluxiq/contracts/client-gateway";

/** What a host needs of a client session to drive it. */
export type ClientGatewaySessionCriteria = {
  /** The kind of client the host drives. */
  clientType: ClientGatewayClientType;
  /** Whether a declared capability is one the host's actions are carried by. */
  serves(capability: ClientGatewayCapability): boolean;
  /** A further capability id the session must also declare, when named. */
  alsoDeclaring?: string;
};
