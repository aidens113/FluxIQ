import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { InternalSession } from "./types.ts";

/**
 * Pushes `server.activity` to the paired clients that asked for it: ready
 * sessions that advertised `CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID` and are
 * bound to the activity's project or to no project. Activity is ephemeral, so
 * it bypasses the session's unbounded `outbound` queue and is dropped when a
 * socket cannot take it.
 */
export class ClientGatewayActivityPublisher {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;

  constructor(sessions: ClientGatewaySessionRegistry, transport: ClientGatewayTransport) {
    this.sessions = sessions;
    this.transport = transport;
  }

  /** Returns how many sessions the activity was sent to. */
  publish(activity: ClientGatewayActivity, target: { projectId: string }): number {
    let sent = 0;
    for (const session of this.sessions.list()) {
      if (!acceptsActivity(session, target.projectId)) continue;
      if (this.transport.sendUnqueued(session, this.transport.message("server.activity", activity, session))) sent += 1;
    }
    return sent;
  }
}

function acceptsActivity(session: InternalSession, projectId: string): boolean {
  if (session.status !== "ready") return false;
  if (session.projectId !== null && session.projectId !== undefined && session.projectId !== projectId) return false;
  return session.capabilities.some((capability) => capability.id === CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID);
}
