import type { ClientGatewayClientHello, ClientGatewayPeer, ClientGatewayService } from "../../../client-gateway/index.ts";

/** An authority-owned tenant lease. The transport consumes release exactly once. */
export type ClientGatewayRouteLease = {
  gateway: ClientGatewayService;
  release(): void | Promise<void>;
};

/** Metadata in hello is untrusted; only the server's resolver chooses authority. */
export type ClientGatewayResolver = (input: {
  hello: ClientGatewayClientHello;
  peer: ClientGatewayPeer;
  origin: string | null;
  signal: AbortSignal;
}) => Promise<ClientGatewayRouteLease | null>;
