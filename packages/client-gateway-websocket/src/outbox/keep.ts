import { clientGatewayOutboxLossMerge, type ClientGatewayOutboxLoss, type ClientGatewayOutboxLossReason } from "./loss/index.ts";
import type { ClientGatewayOutboxEntry } from "./types.ts";

/**
 * The newest entries that fit both limits, in queue order, and the loss of the
 * rest. An entry alone over `byteBudget` is never kept (`byte_budget`); then
 * the oldest past `limit` go (`count_limit`); then the oldest until the total
 * fits `byteBudget` (`byte_budget`). Every entry must carry its `bytes`.
 */
export function clientGatewayOutboxKeep(
  entries: readonly (ClientGatewayOutboxEntry & { bytes: number })[],
  limits: { limit: number; byteBudget: number }
): { kept: ClientGatewayOutboxEntry[]; loss: ClientGatewayOutboxLoss | undefined } {
  const fitting = entries.filter((entry) => entry.bytes <= limits.byteBudget);
  let start = Math.max(0, fitting.length - limits.limit);
  const countDropped = start;
  let total = 0;
  for (let index = start; index < fitting.length; index += 1) total += fitting[index]!.bytes;
  while (total > limits.byteBudget) {
    total -= fitting[start]!.bytes;
    start += 1;
  }
  const loss = clientGatewayOutboxLossMerge(
    lossOf("byte_budget", entries.length - fitting.length + (start - countDropped)),
    lossOf("count_limit", countDropped)
  );
  return { kept: fitting.slice(start), loss };
}

function lossOf(reason: ClientGatewayOutboxLossReason, count: number): ClientGatewayOutboxLoss | undefined {
  return count > 0 ? { count, byReason: { [reason]: count } } : undefined;
}
