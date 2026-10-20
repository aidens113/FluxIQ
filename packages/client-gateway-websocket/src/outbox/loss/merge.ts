import { CLIENT_GATEWAY_OUTBOX_LOSS_REASONS } from "./reasons.ts";
import type { ClientGatewayOutboxLoss, ClientGatewayOutboxLossReason } from "./types.ts";

/**
 * Adds losses together, reason by reason, and answers `undefined` when
 * nothing was lost. `undefined` arguments count as no loss.
 */
export function clientGatewayOutboxLossMerge(...losses: Array<ClientGatewayOutboxLoss | undefined>): ClientGatewayOutboxLoss | undefined {
  const byReason: Partial<Record<ClientGatewayOutboxLossReason, number>> = {};
  let count = 0;
  for (const reason of CLIENT_GATEWAY_OUTBOX_LOSS_REASONS) {
    let total = 0;
    for (const loss of losses) total += loss?.byReason[reason] ?? 0;
    if (total > 0) {
      byReason[reason] = total;
      count += total;
    }
  }
  return count > 0 ? { count, byReason } : undefined;
}
