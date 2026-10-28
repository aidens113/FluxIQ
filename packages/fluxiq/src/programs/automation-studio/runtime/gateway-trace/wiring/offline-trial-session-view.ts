// The live session's public view a build's offline-first trial falls back on
// (trace plan P6, t769, core-design section 6): the matcher attaches with it
// only when the source trace recorded no `session.claimed` view. Since P3 every
// live trial trace records one, so this serves only traces older than that.
//
// It is the project's one live client that takes actions: ready (paired and
// connected), not attached under a channel scope (an offline trial's own
// matcher session), bound to the build's project, and declaring an `action`
// capability. Exactly one is mapped through the same two steps a recorded
// `session.claimed` goes through -- `clientGatewayTraceSessionView` as the tap
// records it, then `readClientGatewayTraceHello` as a replay reads it back --
// so the fallback never differs from what a recording would have held. None
// or several gives no view: which client the trace stood for is not known, so
// the trial is refused and runs live.

import { readClientGatewayTraceHello, type ClientGatewayClientHello, type ClientGatewaySession } from "../../../../../client-gateway/index.ts";
// The gateway's internal tap is not on the public barrel; its sub-barrel is, as `service/command-ledger/` is for the bridge.
import { clientGatewayTraceSessionView } from "../../../../../client-gateway/service/trace-tap/index.ts";
import type { AutomationStudioGatewayTraceSessionGateway } from "./types.ts";

/** The public view of `projectId`'s one live action session, as a recorded `session.claimed` reads back; undefined for none or several. */
export function automationStudioOfflineTrialSessionView(gateway: AutomationStudioGatewayTraceSessionGateway, projectId: string): ClientGatewayClientHello | undefined {
  const live = gateway.snapshot().sessions.filter((session) => takesProjectActions(session, projectId) && !gateway.isScopedSession(session.sessionId));
  const only = live.length === 1 ? live[0] : undefined;
  return only === undefined ? undefined : readClientGatewayTraceHello(clientGatewayTraceSessionView(only));
}

function takesProjectActions(session: ClientGatewaySession, projectId: string): boolean {
  return session.status === "ready"
    && session.disconnectedAt === undefined
    && session.projectId === projectId
    && session.capabilities.some((capability) => capability.kind === "action");
}
