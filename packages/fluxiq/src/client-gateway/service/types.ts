import type {
  ClientGatewayActionResult,
  ClientGatewayPairingChallenge,
  ClientGatewayServerMessage,
  ClientGatewaySession,
  ClientGatewaySocket,
  ClientGatewayTrustedClient,
  ClientGatewayTrustedClientView
} from "@fluxiq/contracts/client-gateway";

/** Durable store the gateway reads trusted clients from and writes them back to. */
export type ClientGatewayTrustedClientStore = {
  load(): Promise<ClientGatewayTrustedClient[]>;
  save(clients: ClientGatewayTrustedClient[]): Promise<void>;
};

/** Construction options for `ClientGatewayService`. */
export type ClientGatewayServiceOptions = {
  enabled?: boolean;
  publicUrl?: string;
  pairingTtlMs?: number;
  commandTimeoutMs?: number;
  trustedClientTtlMs?: number;
  trustedClientStore?: ClientGatewayTrustedClientStore;
  createToken?: () => string;
  now?: () => number;
};

/**
 * A session as the gateway holds it: the public session plus the transport
 * socket, its queued outbound messages, and any pairing awaiting approval.
 * Never leaves the service — `ClientGatewaySessionRegistry.toPublic` strips it.
 */
export type InternalSession = ClientGatewaySession & {
  socket?: ClientGatewaySocket;
  outbound: ClientGatewayServerMessage[];
  pendingPairingCode?: string;
};

/** An action command dispatched to a client and still awaiting its result. */
export type PendingCommand = {
  sessionId: string;
  resolve(result: ClientGatewayActionResult): void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ClientGatewayItemKind = "sessions" | "pairings" | "trustedClients";
export type ClientGatewaySummaryItem = ClientGatewaySession | ClientGatewayPairingChallenge | ClientGatewayTrustedClientView;
export type ClientGatewaySummaryPage = { items: ClientGatewaySummaryItem[]; total: number; limit: number; lastId: string | null; hasMore: boolean };
