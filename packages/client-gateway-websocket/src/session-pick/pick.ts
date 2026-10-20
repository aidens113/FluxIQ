// The session a host drives: the one it asked for, only when that one is
// eligible; otherwise the only eligible session. Two eligible sessions and no
// request is a choice the host must make, never a guess.

import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import { clientGatewaySessionEligible } from "./eligible.ts";
import type { ClientGatewaySessionCriteria } from "./types.ts";

export function pickClientGatewaySession(
  sessions: readonly ClientGatewaySession[],
  criteria: ClientGatewaySessionCriteria & { requestedSessionId?: string | undefined }
): ClientGatewaySession | undefined {
  const eligible = sessions.filter((session) => clientGatewaySessionEligible(session, criteria));
  if (criteria.requestedSessionId !== undefined) return eligible.find((session) => session.sessionId === criteria.requestedSessionId);
  return eligible.length === 1 ? eligible[0] : undefined;
}
