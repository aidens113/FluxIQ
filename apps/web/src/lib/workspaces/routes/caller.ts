import { pairedClientDomainScope } from "fluxiq/server";
import { pairedClientRouteActor, panelRouteActor, type AppRouteCaller } from "../../app-route-iam";
import type { workspaceProgramContext } from "../index";
import type { WorkspaceRouteCaller, WorkspaceRouteValidation } from "./types";

type Selected = NonNullable<Awaited<ReturnType<typeof workspaceProgramContext>>>;

/** Authenticates only on the selected gateway and current primary identity authority. */
export async function readWorkspaceRouteCaller(input: { selected: Selected; channel: AppRouteCaller; sessionId: string | null; token: string | null; url: string }): Promise<WorkspaceRouteValidation> {
  // Selection pins identity and data separately. Never reselect a global
  // primary while this request holds its original workspace authority.
  const primary = input.selected.context.identityAuthority ?? input.selected.context.fluxiq.programs.identityAccess;
  const workspaceId = input.selected.workspaceId;
  if (input.channel === "panel") {
    if (!input.sessionId || input.selected.sessionId !== input.sessionId) return unauthenticated();
    const auth = await primary.validateSession(input.sessionId);
    if (!auth) return unauthenticated();
    const actor = panelRouteActor({ session: { id: input.sessionId }, user: auth.user, role: auth.role });
    return granted({ channel: "panel", actor, binding: { channel: "panel", workspaceId, userId: auth.user.id, sessionId: input.sessionId } });
  }
  if (!input.token || input.selected.sessionId) return unauthenticated();
  const session = await input.selected.context.fluxiq.programs.clientGateway.authorizeToken(input.token);
  if (!session || session.managedHostId !== undefined || !session.trustedClientId) return unauthenticated();
  const scope = pairedClientDomainScope(input.url, session);
  if (!scope) return { ok: false, status: 403, error: "A paired client may only reach its own domain." };
  const actor = await pairedClientRouteActor(primary, session);
  if (!actor) return unauthenticated();
  return granted({ channel: "paired-client", actor, binding: {
    channel: "paired-client", workspaceId, userId: actor.userId, sessionId: session.sessionId,
    trustedClientId: session.trustedClientId, clientId: session.clientId, clientType: session.clientType,
    domainId: scope.domainId, projectId: session.projectId ?? null, recordingId: session.activeRecordingId ?? null
  } });
}

function granted(caller: WorkspaceRouteCaller): WorkspaceRouteValidation {
  Object.freeze(caller.binding);
  Object.freeze(caller.actor.permissions);
  Object.freeze(caller.actor);
  return { ok: true, caller: Object.freeze(caller) };
}

function unauthenticated(): WorkspaceRouteValidation {
  return { ok: false, status: 401, error: "Authentication required" };
}
