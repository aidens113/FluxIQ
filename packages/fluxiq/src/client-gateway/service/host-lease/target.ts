/** Server-resolved destination; undefined domain is unbound, null is explicitly global. */
export type ClientGatewayHostLeaseTarget = {
  readonly sessionId: string;
  readonly domainId: string | null | undefined;
  readonly channelScope?: string | undefined;
};
