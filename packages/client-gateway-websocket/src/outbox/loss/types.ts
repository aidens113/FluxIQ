import type { CLIENT_GATEWAY_OUTBOX_LOSS_REASONS } from "./reasons.ts";

/** Why queued entries were lost (see `CLIENT_GATEWAY_OUTBOX_LOSS_REASONS`). */
export type ClientGatewayOutboxLossReason = (typeof CLIENT_GATEWAY_OUTBOX_LOSS_REASONS)[number];

/**
 * How many queued entries were lost before they could be sent, in all and by
 * reason. A count, never the entries: what was lost is gone.
 */
export type ClientGatewayOutboxLoss = {
  count: number;
  byReason: Partial<Record<ClientGatewayOutboxLossReason, number>>;
};
