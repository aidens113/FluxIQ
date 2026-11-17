import type { InternalSession } from "../types.ts";

/** What the focus authority decided of one project for one session. */
export type ClientGatewayProjectAccessVerdict = "allowed" | "denied";

/** Who a session spoke for when its decision was asked; a decision is reused only for the same. */
export type ClientGatewayProjectAccessAskedFor = { trustedClientId: string | undefined; operatorUserId: string | undefined };

/** One session's kept decisions: made at `mark`, for `askedFor`. */
type SessionDecisions = { mark: number; askedFor: ClientGatewayProjectAccessAskedFor; verdicts: Map<string, ClientGatewayProjectAccessVerdict> };

/**
 * The project access decisions the activity delivery reuses
 * (`./activity-delivery.ts`), per session and project, until access changes.
 *
 * `mark` counts the changes: `voidAll` moves it, which voids every decision
 * kept before, and a decision is kept only with the mark read before it was
 * asked, so one whose question was still running when access changed is never
 * kept. A session's decisions also go when it speaks for someone else, and
 * with the session itself (they are held weakly).
 */
export class ClientGatewayProjectAccessDecisions {
  private current = 0;
  private readonly bySession = new WeakMap<InternalSession, SessionDecisions>();

  /** The current mark: read it before asking, and keep the answer with it. */
  mark(): number {
    return this.current;
  }

  /** Access changed: no decision kept so far is reused. */
  voidAll(): void {
    this.current += 1;
  }

  /** The kept decision of `projectId` for `session`, if it is still current and was made for `askedFor`. */
  known(session: InternalSession, projectId: string, askedFor: ClientGatewayProjectAccessAskedFor): ClientGatewayProjectAccessVerdict | undefined {
    const kept = this.bySession.get(session);
    if (!kept || kept.mark !== this.current || !sameSpeaker(kept.askedFor, askedFor)) return undefined;
    return kept.verdicts.get(projectId);
  }

  /** Keeps `verdict`, asked at `asked.mark` for `asked.askedFor`; a verdict asked before the latest change is dropped. */
  keep(session: InternalSession, projectId: string, verdict: ClientGatewayProjectAccessVerdict, asked: { mark: number; askedFor: ClientGatewayProjectAccessAskedFor }): void {
    if (asked.mark !== this.current) return;
    let kept = this.bySession.get(session);
    if (!kept || kept.mark !== this.current || !sameSpeaker(kept.askedFor, asked.askedFor)) {
      kept = { mark: this.current, askedFor: { ...asked.askedFor }, verdicts: new Map() };
      this.bySession.set(session, kept);
    }
    kept.verdicts.set(projectId, verdict);
  }
}

function sameSpeaker(left: ClientGatewayProjectAccessAskedFor, right: ClientGatewayProjectAccessAskedFor): boolean {
  return left.trustedClientId === right.trustedClientId && left.operatorUserId === right.operatorUserId;
}
