import { pairedClientModelAccessState, readModelAccessState } from "@fluxiq/contracts/platform";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import type { ClientGatewayEventBus } from "../event-bus.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { InternalSession } from "../types.ts";
import type { ClientGatewayModelAccessAuthority, ClientGatewayModelAccessPushPort, ClientGatewayModelAccessSubject } from "./types.ts";

type DeliveryCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  /** Tells of a session ending or becoming ready again, after which what it was last sent is no longer what it shows. */
  events?: Pick<ClientGatewayEventBus, "subscribe"> | undefined;
  authority?: ClientGatewayModelAccessAuthority | undefined;
};

/** Who a session speaks for: a state worked out for anyone else is never compared with, or sent as, its own. */
type Speaker = { trustedClientId: string; userId: string };

/**
 * One session's lane: whether a read is running, whether another publish came
 * while it ran (`again`), the state last sent and to whom, and whether the
 * current failure to read was audited already.
 */
type DeliveryLane = {
  running: boolean;
  again: boolean;
  sent?: { speaker: Speaker; state: string } | undefined;
  outage: boolean;
};

/**
 * Sends `server.model_access_changed` to each person-paired session whose
 * person's model access changed, so a client shows a key being added, removed
 * or refused when it happens, with no timer on either side.
 *
 * `publish()` says only "model access may have changed". For each ready,
 * connected, person-paired session (`speakerOf`) the
 * installed authority works out that person's `ModelAccessState`; it is put in
 * the paired-client form (no key id) and validated, and sent only when it
 * differs from the last state sent to that session for the same person. A
 * managed host or a channel-scoped stand-in has no person and hears nothing,
 * and nothing is sent while no authority is installed or when it answers null.
 *
 * Each session has one lane: one read at a time, and a publish that arrives
 * while one runs reads once more after it, so the last state read is never
 * older than the last publish. A read that throws, or answers a state that
 * fails validation, sends nothing and is audited by its kind only, once per
 * outage per session; the next publish reads again. When a session ends or
 * becomes ready again, what it was last sent is forgotten, because a client
 * reads its model access afresh once ready, so the next state that differs
 * from what it read is sent even if it equals an older one.
 *
 * The message skips the session's unbounded `outbound` queue and is dropped on
 * a closed socket.
 */
export class ClientGatewayModelAccessDelivery implements ClientGatewayModelAccessPushPort {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private authority: ClientGatewayModelAccessAuthority | undefined;
  private readonly lanes = new WeakMap<InternalSession, DeliveryLane>();

  constructor(collaborators: DeliveryCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.authority = collaborators.authority;
    collaborators.events?.subscribe((event) => {
      if (event.type === "session.disconnected" || event.type === "session.ready") this.forget(event.session.sessionId);
    });
  }

  setAuthority(stateOf: ClientGatewayModelAccessAuthority | undefined): void {
    this.authority = stateOf;
  }

  publish(): number {
    if (!this.authority) return 0;
    let reached = 0;
    for (const session of this.sessions.list()) {
      if (!eligible(session)) continue;
      this.refresh(session);
      reached += 1;
    }
    return reached;
  }

  /** What a session that ended or became ready again was last sent no longer says what it shows. */
  private forget(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const lane = session ? this.lanes.get(session) : undefined;
    if (lane) lane.sent = undefined;
  }

  private refresh(session: InternalSession): void {
    let lane = this.lanes.get(session);
    if (!lane) {
      lane = { running: false, again: false, outage: false };
      this.lanes.set(session, lane);
    }
    if (lane.running) {
      lane.again = true;
      return;
    }
    void this.run(session, lane);
  }

  private async run(session: InternalSession, lane: DeliveryLane): Promise<void> {
    lane.running = true;
    try {
      do {
        lane.again = false;
        try {
          await this.recompute(session, lane);
        } catch (error) {
          // Nothing past the read may escape as an unhandled rejection; it is an outage like a failed read.
          this.failed(session, lane, failureKind(error));
        }
      } while (lane.again && eligible(session) && this.authority);
    } finally {
      lane.again = false;
      lane.running = false;
    }
  }

  private async recompute(session: InternalSession, lane: DeliveryLane): Promise<void> {
    const authority = this.authority;
    const speaker = speakerOf(session);
    if (!authority || !speaker) return;
    const subject: ClientGatewayModelAccessSubject = { sessionId: session.sessionId, userId: speaker.userId, trustedClientId: speaker.trustedClientId };
    let read: Awaited<ReturnType<ClientGatewayModelAccessAuthority>>;
    try {
      read = await authority(subject);
    } catch (error) {
      // The authority's own words can carry private state; only its kind is kept.
      this.failed(session, lane, failureKind(error));
      return;
    }
    // The session left, or now speaks for someone else, while its state was read: none of it is theirs.
    if (!this.live(session, speaker)) return;
    if (read === null) {
      lane.outage = false;
      return;
    }
    const state = readModelAccessState(pairedClientModelAccessState(read));
    if (!state) {
      this.failed(session, lane, "invalid_state");
      return;
    }
    lane.outage = false;
    const text = JSON.stringify(state);
    if (lane.sent && sameSpeaker(lane.sent.speaker, speaker) && lane.sent.state === text) return;
    // Built from the validated state alone, so nothing the authority added beside it reaches the client.
    if (this.transport.sendUnqueued(session, this.transport.message("server.model_access_changed", { modelAccess: state }, session))) lane.sent = { speaker, state: text };
  }

  private failed(session: InternalSession, lane: DeliveryLane, failureKind: string): void {
    if (lane.outage) return;
    lane.outage = true;
    this.audit.record("model_access_push.state_failed", "A paired client's model access could not be read; nothing was sent, and the next change reads it again.", { sessionId: session.sessionId, failureKind });
  }

  private live(session: InternalSession, speaker: Speaker): boolean {
    const now = speakerOf(session);
    return this.sessions.get(session.sessionId) === session && eligible(session) && now !== undefined && sameSpeaker(now, speaker);
  }
}

function eligible(session: InternalSession): boolean {
  return session.status === "ready" && session.disconnectedAt === undefined && speakerOf(session) !== undefined;
}

/**
 * The person a session speaks for, only when a person paired it: trusted,
 * acting for its approver, and neither a managed host nor a channel-scoped
 * stand-in, which have no person whose model access could be read. The same
 * rule as `../project-focus/person-paired.ts`, which that folder's barrel does
 * not export.
 */
function speakerOf(session: InternalSession): Speaker | undefined {
  const { trustedClientId, operatorUserId } = session;
  if (!trustedClientId || !operatorUserId || session.managedHostId !== undefined || session.channelScope !== undefined) return undefined;
  return { trustedClientId, userId: operatorUserId };
}

function sameSpeaker(left: Speaker, right: Speaker): boolean {
  return left.trustedClientId === right.trustedClientId && left.userId === right.userId;
}

function failureKind(error: unknown): string {
  return error instanceof Error ? error.name : "rejection";
}
