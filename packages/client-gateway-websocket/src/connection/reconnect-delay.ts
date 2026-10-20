/**
 * How long to wait before reconnect attempt `attempt` (0 for the first): the
 * base delay doubled once per earlier attempt, never more than the cap.
 */
export function clientGatewayReconnectDelay(attempt: number, bounds: { baseDelayMs: number; maxDelayMs: number }): number {
  return Math.min(bounds.maxDelayMs, bounds.baseDelayMs * 2 ** attempt);
}
