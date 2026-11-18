import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayProjectActivityDelivery } from "./project-focus/index.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { InternalSession } from "./types.ts";

/** What decides a person-paired session's activity against its person's current access (`./project-focus/activity-delivery.ts`). */
type ActivityAccessGate = Pick<ClientGatewayProjectActivityDelivery, "governs" | "deliver">;

/**
 * Pushes `server.activity` to the paired clients that asked for it: ready
 * sessions that advertised `CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID` and are
 * bound to the activity's project or to no project. Activity is ephemeral, so
 * it bypasses the session's unbounded `outbound` queue and is dropped when a
 * socket cannot take it.
 *
 * A session a person paired is handed to `gate`, which sends it only while
 * that person may read the project, decided once and reused until access
 * changes; the others (managed hosts, channel-scoped stand-ins) have no person
 * to ask and are sent at once, as is every session when no gate or authority
 * is installed.
 */
export class ClientGatewayActivityPublisher {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly gate: ActivityAccessGate | undefined;

  constructor(sessions: ClientGatewaySessionRegistry, transport: ClientGatewayTransport, gate?: ActivityAccessGate) {
    this.sessions = sessions;
    this.transport = transport;
    this.gate = gate;
  }

  /** Returns how many sessions the activity was sent to, or queued for behind their access check. */
  publish(activity: ClientGatewayActivity, target: { projectId: string }): number {
    let sent = 0;
    for (const session of this.sessions.list()) {
      if (!acceptsActivity(session, target.projectId)) continue;
      if (this.gate?.governs(session)) {
        this.gate.deliver(session, activity, target.projectId);
        sent += 1;
        continue;
      }
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
