import type { InternalSession } from "../types.ts";

/**
 * A session a person paired: trusted, acting for its approver, and neither a
 * managed host nor a channel-scoped stand-in. Only such a session may choose
 * its project (`./focus.ts`), and only its activity waits on its person's
 * current access (`./activity-delivery.ts`): the others have no person whose
 * access could be asked.
 */
export function personPaired(session: InternalSession): boolean {
  return session.trustedClientId !== undefined
    && typeof session.operatorUserId === "string" && session.operatorUserId !== ""
    && session.managedHostId === undefined
    && session.channelScope === undefined;
}
