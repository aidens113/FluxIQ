import type { ClientGatewayConversationChanged } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayConversationPushPort, ClientGatewayConversationReadAuthority, InternalSession } from "../types.ts";
import { ClientGatewayProjectAccessDecisions, type ClientGatewayProjectAccessAskedFor, type ClientGatewayProjectAccessVerdict } from "./access-decisions.ts";
import { personPaired } from "./person-paired.ts";

type DeliveryCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  authority?: ClientGatewayConversationReadAuthority | undefined;
};

/** One change of a project's chat, as it is sent: its id and project, nothing else. */
type ProjectConversationChange = { conversationId: string; projectId: string };
/** One session's changes in the order they came, and whether a drain is running. */
type DeliveryLane = { pending: ProjectConversationChange[]; draining: boolean };
/** What one project came to: as decided, or `undecided` when the authority could not be asked (it threw). */
type Verdict = ClientGatewayProjectAccessVerdict | "undecided";

/**
 * Sends `server.conversation_changed` to each session a person paired whose
 * person may read the chat that changed, so a client's chat reads it again on
 * the push instead of on a timer.
 *
 * Which chats: every project chat the person may read, wherever the session
 * is focused, because a paired client reads any project of its bound domain
 * (the web extension's thread list spans every project). A project's chat is
 * decided as `get-conversation` decides it for that person on the
 * paired-client channel, by the authority the host installs
 * (`ClientGatewayConversationReadAuthority`); identity and IAM live above the
 * gateway. A person's panel thread (`projectId: null`) is never sent: no paired
 * client may read one (the panel assistant's endpoints refuse the
 * paired-client channel), so no decision could allow it.
 *
 * Who: only person-paired sessions (`./person-paired.ts`). A managed host or a
 * channel-scoped stand-in has no person whose access could be asked, and no
 * chat to show, so it hears none. Nothing is sent while no authority is
 * installed, or for a project the authority could not decide (audited by kind
 * only): an outage sends nothing rather than guessing.
 *
 * A decision is asked once per session and project and then reused
 * (`./access-decisions.ts`) until the host installs the authority again
 * (`setAuthority`), which it does whenever the person's identity, the
 * registry's decisions or the project catalogue changes. A decision whose
 * question was still running when access changed is void and asked again, and
 * one made for whoever the session spoke for before is never reused for it.
 *
 * The message names the chat and its project and carries no content, skips the
 * session's unbounded `outbound` queue and is dropped on a closed socket: it is
 * a hint, and a client reads its chats again once its session is ready. Each
 * session has one lane, drained in publish order; changes that waited on one
 * question are decided together, and a change already waiting is not queued
 * twice.
 */
export class ClientGatewayConversationChangeDelivery implements ClientGatewayConversationPushPort {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private authority: ClientGatewayConversationReadAuthority | undefined;
  private readonly lanes = new WeakMap<InternalSession, DeliveryLane>();
  private readonly decisions = new ClientGatewayProjectAccessDecisions();

  constructor(collaborators: DeliveryCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.authority = collaborators.authority;
  }

  /** Replaces the authority and voids every decision reused so far; undefined sends nothing. */
  setAuthority(authority: ClientGatewayConversationReadAuthority | undefined): void {
    this.authority = authority;
    this.decisions.voidAll();
  }

  /** Returns how many sessions the change was sent to, or queued for behind their person's access check. */
  publish(change: ClientGatewayConversationChanged): number {
    const { conversationId, projectId } = change;
    if (typeof projectId !== "string" || projectId === "" || typeof conversationId !== "string" || conversationId === "") return 0;
    if (!this.authority) return 0;
    let reached = 0;
    for (const session of this.sessions.list()) {
      if (session.status !== "ready" || session.disconnectedAt !== undefined || !personPaired(session)) continue;
      this.deliver(session, { conversationId, projectId });
      reached += 1;
    }
    return reached;
  }

  private deliver(session: InternalSession, change: ProjectConversationChange): void {
    const lane = this.lane(session);
    if (lane.pending.length === 0 && !lane.draining) {
      const known = this.decisions.known(session, change.projectId, askedFor(session));
      if (known === "allowed") {
        this.send(session, change);
        return;
      }
      if (known === "denied") return;
    }
    if (lane.pending.some((waiting) => waiting.projectId === change.projectId && waiting.conversationId === change.conversationId)) return;
    lane.pending.push(change);
    if (!lane.draining) void this.drain(session, lane);
  }

  private lane(session: InternalSession): DeliveryLane {
    let lane = this.lanes.get(session);
    if (!lane) {
      lane = { pending: [], draining: false };
      this.lanes.set(session, lane);
    }
    return lane;
  }

  private async drain(session: InternalSession, lane: DeliveryLane): Promise<void> {
    lane.draining = true;
    try {
      while (lane.pending.length > 0) {
        const batch = lane.pending.splice(0);
        const asked = askedFor(session);
        const verdicts = await this.decide(session, batch, asked);
        // The session left, or now speaks for someone else: nothing decided for it is sent.
        if (!this.live(session, asked)) {
          lane.pending.length = 0;
          return;
        }
        for (const change of batch) if (verdicts.get(change.projectId) === "allowed") this.send(session, change);
      }
    } catch (error) {
      // A change is a hint; a failure drops what was waiting and is audited by kind only.
      lane.pending.length = 0;
      this.audit.record("conversation_push.delivery_failed", "A paired client could not be told its chats changed; what was waiting was dropped.", { sessionId: session.sessionId, failureKind: failureKind(error) });
    } finally {
      lane.draining = false;
    }
  }

  /** Each project of `batch`: as already decided, else asked now. */
  private async decide(session: InternalSession, batch: readonly ProjectConversationChange[], asked: ClientGatewayProjectAccessAskedFor): Promise<Map<string, Verdict>> {
    const verdicts = new Map<string, Verdict>();
    const unknown: string[] = [];
    for (const projectId of new Set(batch.map((change) => change.projectId))) {
      const known = this.decisions.known(session, projectId, asked);
      if (known) verdicts.set(projectId, known);
      else unknown.push(projectId);
    }
    if (unknown.length > 0) for (const [projectId, verdict] of await this.ask(session, unknown, asked)) verdicts.set(projectId, verdict);
    return verdicts;
  }

  /** Asks the authority about `projects`, again while access changed during the question, and keeps what it decided. */
  private async ask(session: InternalSession, projects: readonly string[], asked: ClientGatewayProjectAccessAskedFor): Promise<Map<string, Verdict>> {
    for (;;) {
      const mark = this.decisions.mark();
      const authority = this.authority;
      if (!authority) return new Map(projects.map((projectId) => [projectId, "undecided" as const]));
      const answers = await Promise.all(projects.map(async (projectId) => [projectId, await this.question(authority, session, projectId)] as const));
      if (mark !== this.decisions.mark()) continue;
      for (const [projectId, verdict] of answers) if (verdict !== "undecided") this.decisions.keep(session, projectId, verdict, { mark, askedFor: asked });
      return new Map(answers);
    }
  }

  private async question(authority: ClientGatewayConversationReadAuthority, session: InternalSession, projectId: string): Promise<Verdict> {
    try {
      return await authority({ session: this.sessions.toPublic(session), projectId, domainId: declaredDomainId(session.metadata) }) === true ? "allowed" : "denied";
    } catch (error) {
      // The authority's own words can carry private state; only its kind is kept.
      this.audit.record("conversation_push.check_failed", "A paired client's access to a project's chats could not be checked; that change was not sent.", { sessionId: session.sessionId, projectId, failureKind: failureKind(error) });
      return "undecided";
    }
  }

  private live(session: InternalSession, asked: ClientGatewayProjectAccessAskedFor): boolean {
    return this.sessions.get(session.sessionId) === session
      && session.status === "ready"
      && session.disconnectedAt === undefined
      && session.trustedClientId === asked.trustedClientId
      && session.operatorUserId === asked.operatorUserId;
  }

  // Built from the two fields alone, so nothing a caller passed beside them reaches the client.
  private send(session: InternalSession, change: ProjectConversationChange): void {
    this.transport.sendUnqueued(session, this.transport.message("server.conversation_changed", { conversationId: change.conversationId, projectId: change.projectId }, session));
  }
}

/** Who `session` speaks for now; a decision made for anyone else is not reused for it. */
function askedFor(session: InternalSession): ClientGatewayProjectAccessAskedFor {
  return { trustedClientId: session.trustedClientId, operatorUserId: session.operatorUserId };
}

function failureKind(error: unknown): string {
  return error instanceof Error ? error.name : "rejection";
}
