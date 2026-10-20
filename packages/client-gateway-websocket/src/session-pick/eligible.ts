// The one rule for which client session a host may drive. Core refuses a
// command to a session that is not `ready` (`requireReady`), so a looser rule
// would only pick sessions that then fail; a session already recording belongs
// to the person recording, and a disconnected one cannot be reached.

import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewaySessionCriteria } from "./types.ts";

/** Whether a host may drive `session`: ready, connected, the client type, idle, serving a capability, and declaring `alsoDeclaring` when named. */
export function clientGatewaySessionEligible(session: ClientGatewaySession, criteria: ClientGatewaySessionCriteria): boolean {
  return session.status === "ready" &&
    session.disconnectedAt === undefined &&
    session.clientType === criteria.clientType &&
    !session.activeRecordingId &&
    session.capabilities.some((capability) => criteria.serves(capability)) &&
    (criteria.alsoDeclaring === undefined || session.capabilities.some((capability) => capability.id === criteria.alsoDeclaring));
}
