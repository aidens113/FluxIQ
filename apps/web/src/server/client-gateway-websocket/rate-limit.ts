import { TokenBucket } from "./token-bucket.ts";
import type { ClientGatewayTransportLimits } from "./transport-limits.ts";

/** A socket's message bucket from the limits, or null when no rate is set. A burst left unset is one second's worth. */
export function createSocketRateLimit(limits: Pick<ClientGatewayTransportLimits, "messagesPerSecond" | "messageBurst">): TokenBucket | null {
  if (limits.messagesPerSecond === null) return null;
  return new TokenBucket(limits.messagesPerSecond, limits.messageBurst ?? limits.messagesPerSecond);
}
