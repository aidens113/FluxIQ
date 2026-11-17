import type { ClientGatewayConversationChanged } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewayEventBus } from "../event-bus.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayConversationPushPort, ClientGatewayConversationReadAuthority, ClientGatewayTimer, InternalSession } from "../types.ts";
import { ClientGatewayProjectAccessDecisions, type ClientGatewayProjectAccessAskedFor, type ClientGatewayProjectAccessVerdict } from "./access-decisions.ts";
import { personPaired } from "./person-paired.ts";

/** Starts one wait before an undecided change is asked again; cancelled when it no longer has anyone to wait for. */
export type ClientGatewayConversationRetryTimer = (delayMs: number, fire: () => void) => ClientGatewayTimer;

type DeliveryCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  /** Tells of a session ending or becoming ready again, which ends what it waited for. */
  events?: Pick<ClientGatewayEventBus, "subscribe"> | undefined;
  authority?: ClientGatewayConversationReadAuthority | undefined;
  /** The clock a retry waits on. Unset: `setTimeout`. */
  startRetry?: ClientGatewayConversationRetryTimer | undefined;
};

/** One change of a project's chat, as it is sent: its id and project, nothing else. */
type ProjectConversationChange = { conversationId: string; projectId: string };

/**
 * One session's changes in the order they came, and whether a drain is
 * running. While changes wait on an answer that could not be made, `retry`
 * is the wait before they are asked again, `waitingFor` who they were asked
 * for, `nextWaitMs` the wait after it, and `outage` whether this outage was
 * audited already.
 */
type DeliveryLane = {
  pending: ProjectConversationChange[];
  draining: boolean;
  retry?: ClientGatewayTimer | undefined;
  waitingFor?: ClientGatewayProjectAccessAskedFor | undefined;
  nextWaitMs: number;
  outage: boolean;
};

/** What one project came to: as decided, or `undecided` when the authority could not be asked (it threw). */
type Verdict = ClientGatewayProjectAccessVerdict | "undecided";

/** The first wait before an undecided change is asked again; each later one doubles, up to the ceiling. */
const FIRST_RETRY_WAIT_MS = 1_000;
const RETRY_WAIT_CEILING_MS = 30_000;

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
 * installed.
 *
 * A decision is asked once per session and project and then reused
 * (`./access-decisions.ts`) until the host installs the authority again
 * (`setAuthority`), which it does whenever the person's identity, the
 * registry's decisions or the project catalogue changes. A decision whose
 * question was still running when access changed is void and asked again, and
 * one made for whoever the session spoke for before is never reused for it.
 *
 * A change is sent only once a decision allows it, and discarded only on a
 * denial or when its session goes away or speaks for someone else. A client
 * keeps no timer of its own, so a change is never dropped for an answer that
 * could not be made (the authority threw: an outage, not a denial) or a drain
 * that failed: it stays in its session's lane and is asked again after a wait
 * that starts at one second and doubles to thirty, back to one once every
 * waiting change is decided. Each outage is audited once per session, by kind
 * only. No wait runs while nothing is undecided, and a session that ends or
 * becomes ready again while waiting has its wait cancelled at once.
 *
 * The message names the chat and its project and carries no content, skips the
 * session's unbounded `outbound` queue and is dropped on a closed socket: a
 * client reads its chats again once its session is ready. Each session has one
 * lane, drained in publish order; changes that waited on one question are
 * decided together, and a change already waiting is not queued twice.
 */
export class ClientGatewayConversationChangeDelivery implements ClientGatewayConversationPushPort {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly startRetry: ClientGatewayConversationRetryTimer;
  private authority: ClientGatewayConversationReadAuthority | undefined;
  private readonly lanes = new WeakMap<InternalSession, DeliveryLane>();
  private readonly decisions = new ClientGatewayProjectAccessDecisions();
  /** The kind of each question's failure in the drain under way, per session, for its one audit row. */
  private readonly failures = new WeakMap<InternalSession, Map<string, string>>();

  constructor(collaborators: DeliveryCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.authority = collaborators.authority;
    this.startRetry = collaborators.startRetry ?? startRealRetry;
    collaborators.events?.subscribe((event) => {
      if (event.type === "session.disconnected" || event.type === "session.ready") this.sessionChanged(event.session.sessionId);
    });
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

  /** A session ended or became ready again: what it waited on for someone it no longer speaks for, or after it left, is discarded with its wait. */
  sessionChanged(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const lane = session ? this.lanes.get(session) : undefined;
    if (!session || !lane?.waitingFor || lane.draining) return;
    if (!this.live(session, lane.waitingFor)) this.discard(lane);
  }

  private deliver(session: InternalSession, change: ProjectConversationChange): void {
    const lane = this.lane(session);
    // Waiting for someone the session no longer speaks for: none of it is theirs to hear.
    if (lane.waitingFor && !lane.draining && !sameSpeaker(lane.waitingFor, askedFor(session))) this.discard(lane);
    const idle = lane.pending.length === 0 && !lane.draining;
    if (idle || lane.retry) {
      // Decided already: applied now, even while undecided changes wait on their retry.
      const known = this.decisions.known(session, change.projectId, askedFor(session));
      if (known === "allowed") {
        this.send(session, change);
        return;
      }
      if (known === "denied") return;
    }
    if (lane.pending.some((waiting) => sameChange(waiting, change))) return;
    lane.pending.push(change);
    // A change undecided so far waits for the retry already set, asked with what waited before it.
    if (!lane.draining && !lane.retry) void this.drain(session, lane);
  }

  private lane(session: InternalSession): DeliveryLane {
    let lane = this.lanes.get(session);
    if (!lane) {
      lane = { pending: [], draining: false, nextWaitMs: FIRST_RETRY_WAIT_MS, outage: false };
      this.lanes.set(session, lane);
    }
    return lane;
  }

  private async drain(session: InternalSession, lane: DeliveryLane): Promise<void> {
    lane.draining = true;
    // What this drain holds and has not yet sent or settled, so a failure anywhere keeps exactly that.
    let current: ProjectConversationChange[] = [];
    let undecided: ProjectConversationChange[] = [];
    let asked = askedFor(session);
    try {
      while (lane.pending.length > 0) {
        current = lane.pending.splice(0);
        undecided = [];
        asked = askedFor(session);
        this.failures.delete(session);
        const verdicts = await this.decide(session, current, asked);
        // The session left, or now speaks for someone else: nothing decided for it is sent.
        if (!this.live(session, asked)) {
          current = [];
          this.discard(lane);
          return;
        }
        let failure: { projectId: string; failureKind: string } | undefined;
        while (current.length > 0) {
          const change = current[0]!;
          const verdict = verdicts.get(change.projectId);
          if (verdict === "allowed") this.send(session, change);
          else if (verdict !== "denied") {
            undecided.push(change);
            failure ??= { projectId: change.projectId, failureKind: this.failures.get(session)?.get(change.projectId) ?? "rejection" };
          }
          current.shift();
        }
        if (failure) {
          this.wait(session, lane, undecided, asked, { type: "conversation_push.check_failed", ...failure });
          return;
        }
        // Every waiting change was decided: the outage, if any, is over.
        lane.nextWaitMs = FIRST_RETRY_WAIT_MS;
        lane.outage = false;
        lane.waitingFor = undefined;
      }
    } catch (error) {
      // Not settled, so not dropped: what was waiting is asked again after the wait.
      this.wait(session, lane, [...undecided, ...current], asked, { type: "conversation_push.delivery_failed", failureKind: failureKind(error) });
    } finally {
      this.failures.delete(session);
      lane.draining = false;
    }
  }

  /**
   * Puts `undecided` back at the head of the lane (ahead of what arrived while
   * it was asked, without a second copy of any change) and asks again after
   * the lane's next wait, auditing the outage once.
   */
  private wait(session: InternalSession, lane: DeliveryLane, undecided: readonly ProjectConversationChange[], asked: ClientGatewayProjectAccessAskedFor, failure: { type: string; projectId?: string; failureKind: string }): void {
    lane.pending = [...undecided, ...lane.pending.filter((arrived) => !undecided.some((waiting) => sameChange(waiting, arrived)))];
    lane.waitingFor = { ...asked };
    if (!lane.outage) {
      lane.outage = true;
      const { type, ...metadata } = failure;
      this.audit.record(type, "A paired client could not yet be told one of its chats changed; the change waits and is asked again.", { sessionId: session.sessionId, ...metadata });
    }
    const delayMs = lane.nextWaitMs;
    lane.nextWaitMs = Math.min(delayMs * 2, RETRY_WAIT_CEILING_MS);
    lane.retry = this.startRetry(delayMs, () => {
      lane.retry = undefined;
      if (!lane.waitingFor || !this.live(session, lane.waitingFor)) {
        this.discard(lane);
        return;
      }
      void this.drain(session, lane);
    });
  }

  /** Drops everything the lane waits on, and its wait; a later change starts it afresh. */
  private discard(lane: DeliveryLane): void {
    lane.retry?.cancel();
    lane.retry = undefined;
    lane.pending.length = 0;
    lane.waitingFor = undefined;
    lane.nextWaitMs = FIRST_RETRY_WAIT_MS;
    lane.outage = false;
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
      let kinds = this.failures.get(session);
      if (!kinds) {
        kinds = new Map();
        this.failures.set(session, kinds);
      }
      kinds.set(projectId, failureKind(error));
      return "undecided";
    }
  }

  private live(session: InternalSession, asked: ClientGatewayProjectAccessAskedFor): boolean {
    return this.sessions.get(session.sessionId) === session
      && session.status === "ready"
      && session.disconnectedAt === undefined
      && sameSpeaker(askedFor(session), asked);
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

function sameSpeaker(left: ClientGatewayProjectAccessAskedFor, right: ClientGatewayProjectAccessAskedFor): boolean {
  return left.trustedClientId === right.trustedClientId && left.operatorUserId === right.operatorUserId;
}

function sameChange(left: ProjectConversationChange, right: ProjectConversationChange): boolean {
  return left.projectId === right.projectId && left.conversationId === right.conversationId;
}

function failureKind(error: unknown): string {
  return error instanceof Error ? error.name : "rejection";
}

/** A wait on the real clock. */
function startRealRetry(delayMs: number, fire: () => void): ClientGatewayTimer {
  const handle = setTimeout(fire, delayMs);
  return { cancel: () => clearTimeout(handle) };
}
