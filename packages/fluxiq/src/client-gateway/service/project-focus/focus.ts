import { CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES, type ClientGatewayClientMessage, type ClientGatewayProjectFocusRefusalCode } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayProjectFocusAuthority, ClientGatewayProjectFocusPort, InternalSession } from "../types.ts";
import { ClientGatewayProjectActivityDelivery } from "./activity-delivery.ts";
import { personPaired } from "./person-paired.ts";

type FocusMessage = Extract<ClientGatewayClientMessage, { type: "client.focus_project" }>;

type ProjectFocusCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  authority?: ClientGatewayProjectFocusAuthority | undefined;
};

// Plain words a client can show beside each refusal code.
const REFUSAL_WORDS: Record<ClientGatewayProjectFocusRefusalCode, string> = {
  [CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.invalid]: "Name the project by its id, or null to return to the project this browser was paired with.",
  [CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.notPaired]: "Only a browser a person paired can choose the project it works in.",
  [CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused]: "The person who paired this browser cannot open that project here, or it no longer exists.",
  [CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.unavailable]: "FluxIQ could not check that project just now. Try again."
};

/**
 * `client.focus_project`: the project a paired client is working in now. The
 * session's project decides which `server.activity` reaches it
 * (`../activity-publisher.ts`) and which project a call naming none reaches, so
 * moving it is decided as reading that project would be: by the authority the
 * host installed (identity and IAM live above the gateway), for the person who
 * paired the session, in the domain the session declared. A refusal answers a
 * typed `server.error` and leaves the session's project as it was; `null`
 * returns it to the project it was bound to when it became ready.
 *
 * Only the latest request a session sent is applied and answered: one still
 * being decided when a newer one arrives is dropped, so a slow check can never
 * move the session back to a project the person has since left.
 *
 * A focus is decided once, and `activity` reuses that decision for the
 * project's `server.activity` only until access changes (`setAuthority`), when
 * it asks the same authority again and moves the session off a project its
 * person can no longer read (`./activity-delivery.ts`).
 */
export class ClientGatewayProjectFocus implements ClientGatewayProjectFocusPort {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private authority: ClientGatewayProjectFocusAuthority | undefined;
  /** What the activity publisher hands each person-paired session's activity to, decided by this authority as it stands. */
  readonly activity: ClientGatewayProjectActivityDelivery;

  constructor(collaborators: ProjectFocusCollaborators) {
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.authority = collaborators.authority;
    this.activity = new ClientGatewayProjectActivityDelivery({ sessions: this.sessions, transport: this.transport, audit: this.audit, authority: () => this.authority });
  }

  /**
   * Replaces the authority; undefined refuses every focus to a project as
   * `unavailable`. Installing one, even the one installed already, says that
   * what decisions were made from changed: every decision `activity` reused
   * is void and each paired session's own project is decided again now. The
   * host installs it again whenever a person's identity, policies,
   * membership or sharing, or a project changes.
   */
  setAuthority(authority: ClientGatewayProjectFocusAuthority | undefined): void {
    this.authority = authority;
    this.activity.accessChanged();
  }

  /** Handles one request from a ready session and says what became of it, as a trace disposition. */
  async answer(session: InternalSession, message: FocusMessage): Promise<string> {
    const sequence = (session.focusRequests ?? 0) + 1;
    session.focusRequests = sequence;
    const trustedClientId = session.trustedClientId;
    if (!personPaired(session)) return await this.refuse(session, message, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.notPaired);
    const requested = requestedProject(message.payload);
    if (requested === undefined) return await this.refuse(session, message, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.invalid);
    if (requested === null) return await this.apply(session, message, session.pairedProjectId ?? null);
    const authority = this.authority;
    if (!authority) return await this.refuse(session, message, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.unavailable, requested);
    const mark = this.activity.decisionMark();
    let allowed: boolean;
    try {
      allowed = await authority({ session: this.sessions.toPublic(session), projectId: requested, domainId: declaredDomainId(session.metadata) }) === true;
    } catch (error) {
      // The authority's own words can carry private state; only its kind is kept.
      this.audit.record("project_focus.check_failed", "A client's project focus could not be decided; its project was left unchanged.", { sessionId: session.sessionId, failureKind: error instanceof Error ? error.name : "rejection" });
      if (!this.stillCurrent(session, sequence, trustedClientId)) return "focus_superseded";
      return await this.refuse(session, message, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.unavailable, requested);
    }
    // The session may have left, been unpaired, or asked again while this was decided.
    if (!this.stillCurrent(session, sequence, trustedClientId)) return "focus_superseded";
    if (!allowed) return await this.refuse(session, message, CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused, requested);
    this.activity.focusAllowed(session, requested, mark);
    return await this.apply(session, message, requested);
  }

  private stillCurrent(session: InternalSession, sequence: number, trustedClientId: string | undefined): boolean {
    return this.sessions.get(session.sessionId) === session
      && session.status === "ready"
      && session.disconnectedAt === undefined
      && session.trustedClientId === trustedClientId
      && session.focusRequests === sequence;
  }

  private async apply(session: InternalSession, message: FocusMessage, projectId: string | null): Promise<string> {
    session.projectId = projectId;
    this.audit.record("session.project_focused", "A paired client moved its session to the project its person is working in.", { sessionId: session.sessionId, projectId });
    await this.transport.send(session.sessionId, { ...this.transport.message("server.project_focused", { projectId }, session), correlationId: message.id });
    return "project_focused";
  }

  private async refuse(session: InternalSession, message: FocusMessage, code: ClientGatewayProjectFocusRefusalCode, projectId?: string): Promise<string> {
    this.audit.record(code, "A client's project focus was refused; its project was left unchanged.", { sessionId: session.sessionId, ...(projectId !== undefined ? { projectId } : {}) });
    await this.transport.send(session.sessionId, {
      ...this.transport.message("server.error", { message: REFUSAL_WORDS[code], code, ...(projectId !== undefined ? { metadata: { projectId } } : {}) }, session),
      correlationId: message.id
    });
    return "project_focus_refused";
  }
}

/** The project asked for: a non-blank id as sent, null to return, or undefined for anything else. */
function requestedProject(payload: unknown): string | null | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("projectId" in payload)) return undefined;
  const projectId = (payload as { projectId: unknown }).projectId;
  if (projectId === null) return null;
  return typeof projectId === "string" && projectId.trim() !== "" ? projectId : undefined;
}
