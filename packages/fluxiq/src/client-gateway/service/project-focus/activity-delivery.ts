import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayProjectFocusAuthority, InternalSession } from "../types.ts";
import { ClientGatewayProjectAccessDecisions, type ClientGatewayProjectAccessAskedFor, type ClientGatewayProjectAccessVerdict } from "./access-decisions.ts";
import { personPaired } from "./person-paired.ts";

type DeliveryCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  /** The authority installed now (`ClientGatewayProjectFocus.setAuthority`), read on every question. */
  authority: () => ClientGatewayProjectFocusAuthority | undefined;
};

/** One activity waiting on its session's decision, or (no `activity`) a re-check of the session's own project after access changed. */
type QueuedItem = { projectId: string; activity?: ClientGatewayActivity };
/** One session's items in the order they came, and whether a drain is running. */
type DeliveryLane = { pending: QueuedItem[]; draining: boolean };
/** What one project came to: as decided, or `undecided` when the authority could not be asked (it threw). */
type Verdict = ClientGatewayProjectAccessVerdict | "undecided";

const ACCESS_ENDED_WORDS = "The person who paired this browser can no longer open this project here, or it was deleted, so its live activity stopped.";

/**
 * Delivers `server.activity` to a session a person paired only while that
 * person may read the activity's project, as the focus authority
 * (`ClientGatewayProjectFocusAuthority`, the same question a focus asks)
 * decides it.
 *
 * A decision is asked once per session and project and then reused
 * (`./access-decisions.ts`), because it changes only when what it is decided
 * from changes: the person's identity, policies, membership or sharing, or the
 * project itself. The host installs the authority again whenever one of those
 * changes (`accessChanged`, called by `ClientGatewayProjectFocus.setAuthority`),
 * which voids every reused decision and re-decides each session's own project
 * at once, so access that ended takes effect at the change, not at the next
 * event or on a timer. A decision whose question was still running when
 * access changed is void too and asked again.
 *
 * Each session has one lane, drained in publish order: while anything waits
 * on it, a later event waits behind it even when its own project is decided.
 * What waited during one question is decided together, one question per
 * project not yet decided.
 *
 * When the project refused is the session's own (focused, or bound at pairing),
 * its access has ended: the session moves where a `client.focus_project` of
 * null would take it (its pairing's project, or none when that is the one
 * lost), is told with `server.project_access_ended`, and this is audited. A
 * refused project the session never chose (a session bound to none hears every
 * project) is only not delivered. An authority that cannot decide delivers
 * nothing, moves nothing and is audited: an outage must not end anyone's access.
 */
export class ClientGatewayProjectActivityDelivery {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly authority: () => ClientGatewayProjectFocusAuthority | undefined;
  private readonly lanes = new WeakMap<InternalSession, DeliveryLane>();
  private readonly decisions = new ClientGatewayProjectAccessDecisions();

  constructor(collaborators: DeliveryCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.authority = collaborators.authority;
  }

  /** Whether `session`'s activity waits on its person's access: a person-paired session, once an authority is installed. */
  governs(session: InternalSession): boolean {
    return personPaired(session) && this.authority() !== undefined;
  }

  /** Sends `activity` of `projectId` to `session` once its person may read that project, at once when that is already decided and nothing waits before it. */
  deliver(session: InternalSession, activity: ClientGatewayActivity, projectId: string): void {
    const lane = this.lane(session);
    if (lane.pending.length === 0 && !lane.draining) {
      const known = this.decisions.known(session, projectId, askedFor(session));
      if (known === "allowed") {
        this.send(session, { activity, projectId });
        return;
      }
      if (known === "denied") return;
    }
    this.enqueue(session, lane, { activity, projectId });
  }

  /**
   * What decisions were made from changed: every reused decision is void, and
   * each person-paired session bound to a project has that project decided
   * again now, so one its person lost ends here.
   */
  accessChanged(): void {
    this.decisions.voidAll();
    for (const session of this.sessions.list()) {
      const own = session.projectId;
      if (session.status !== "ready" || own === null || own === undefined || !this.governs(session)) continue;
      this.enqueue(session, this.lane(session), { projectId: own });
    }
  }

  /** The mark a focus reads before it asks, so its answer is kept (`focusAllowed`) only if access did not change meanwhile. */
  decisionMark(): number {
    return this.decisions.mark();
  }

  /** Keeps a focus's allowed answer for `projectId`, asked at `mark`, so that project's first activity is not asked again. */
  focusAllowed(session: InternalSession, projectId: string, mark: number): void {
    this.decisions.keep(session, projectId, "allowed", { mark, askedFor: askedFor(session) });
  }

  private lane(session: InternalSession): DeliveryLane {
    let lane = this.lanes.get(session);
    if (!lane) {
      lane = { pending: [], draining: false };
      this.lanes.set(session, lane);
    }
    return lane;
  }

  private enqueue(session: InternalSession, lane: DeliveryLane, item: QueuedItem): void {
    lane.pending.push(item);
    if (!lane.draining) void this.drain(session, lane);
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
        for (const item of batch) await this.apply(session, item, verdicts.get(item.projectId));
      }
    } catch (error) {
      // Activity is disposable; a failure here drops what was waiting and is audited by kind only.
      lane.pending.length = 0;
      this.audit.record("project_focus.delivery_failed", "A paired client's activity could not be delivered; what was waiting was dropped.", { sessionId: session.sessionId, failureKind: failureKind(error) });
    } finally {
      lane.draining = false;
    }
  }

  private async apply(session: InternalSession, item: QueuedItem, verdict: Verdict | undefined): Promise<void> {
    if (verdict === "allowed" && item.activity) this.send(session, { activity: item.activity, projectId: item.projectId });
    else if (verdict === "denied") await this.ended(session, item.projectId);
  }

  /** Each project of `batch`: as already decided, else asked now. */
  private async decide(session: InternalSession, batch: readonly QueuedItem[], asked: ClientGatewayProjectAccessAskedFor): Promise<Map<string, Verdict>> {
    const verdicts = new Map<string, Verdict>();
    const unknown: string[] = [];
    for (const projectId of new Set(batch.map((item) => item.projectId))) {
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
      const authority = this.authority();
      if (!authority) return new Map(projects.map((projectId) => [projectId, "undecided" as const]));
      const answers = await Promise.all(projects.map(async (projectId) => [projectId, await this.question(authority, session, projectId)] as const));
      if (mark !== this.decisions.mark()) continue;
      for (const [projectId, verdict] of answers) if (verdict !== "undecided") this.decisions.keep(session, projectId, verdict, { mark, askedFor: asked });
      return new Map(answers);
    }
  }

  private async question(authority: ClientGatewayProjectFocusAuthority, session: InternalSession, projectId: string): Promise<Verdict> {
    try {
      return await authority({ session: this.sessions.toPublic(session), projectId, domainId: declaredDomainId(session.metadata) }) === true ? "allowed" : "denied";
    } catch (error) {
      // The authority's own words can carry private state; only its kind is kept.
      this.audit.record("project_focus.delivery_check_failed", "A paired client's access to a project could not be checked; that project's activity was not sent.", { sessionId: session.sessionId, projectId, failureKind: failureKind(error) });
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

  // Sent only if the session still hears that project: a focus may have moved it while the check ran.
  private send(session: InternalSession, queued: { activity: ClientGatewayActivity; projectId: string }): void {
    const bound = session.projectId;
    if (bound !== null && bound !== undefined && bound !== queued.projectId) return;
    this.transport.sendUnqueued(session, this.transport.message("server.activity", queued.activity, session));
  }

  private async ended(session: InternalSession, projectId: string): Promise<void> {
    if (session.projectId !== projectId) return;
    const lostPairing = session.pairedProjectId === projectId;
    const currentProjectId = lostPairing ? null : (session.pairedProjectId ?? null);
    if (lostPairing) session.pairedProjectId = null;
    session.projectId = currentProjectId;
    this.audit.record("project_focus.access_ended", "A paired client's person can no longer read its project; that project's activity stopped and the session moved.", { sessionId: session.sessionId, projectId, currentProjectId });
    await this.transport.send(session.sessionId, this.transport.message("server.project_access_ended", { projectId, currentProjectId, message: ACCESS_ENDED_WORDS }, session));
  }
}

/** Who `session` speaks for now; a decision made for anyone else is not reused for it. */
function askedFor(session: InternalSession): ClientGatewayProjectAccessAskedFor {
  return { trustedClientId: session.trustedClientId, operatorUserId: session.operatorUserId };
}

function failureKind(error: unknown): string {
  return error instanceof Error ? error.name : "rejection";
}
