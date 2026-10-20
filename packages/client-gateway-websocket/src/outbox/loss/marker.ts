import type { ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "@fluxiq/contracts/core";
import { createClientGatewayMessage } from "../../messages.ts";
import { CLIENT_GATEWAY_OUTBOX_LOSS_REASONS } from "./reasons.ts";
import type { ClientGatewayOutboxLoss } from "./types.ts";

/**
 * The `client.error` a flush sends before the surviving entries when queued
 * entries were lost, so the gateway records the gap instead of receiving a
 * history that silently skips. It carries the counts and nothing else: no
 * binding, payload, recording or page data of what was lost.
 */
export function clientGatewayOutboxLossMarker(loss: ClientGatewayOutboxLoss): Extract<ClientGatewayClientMessage, { type: "client.error" }> {
  const byReason: JsonObject = {};
  for (const reason of CLIENT_GATEWAY_OUTBOX_LOSS_REASONS) {
    const count = loss.byReason[reason];
    if (count !== undefined && count > 0) byReason[reason] = count;
  }
  const message = loss.count === 1
    ? "1 queued message was lost before it could be sent."
    : `${loss.count} queued messages were lost before they could be sent.`;
  return createClientGatewayMessage("client.error", {
    code: "client.outbox.entries_lost",
    message,
    metadata: { count: loss.count, byReason }
  });
}
