// What decides a paired client's `client.focus_project` (client gateway,
// `service/project-focus/`): whether the person who paired the session may read
// the project in the domain the session declared. The gateway holds no identity
// or IAM, so this is installed on it from here, where both live, and it asks
// exactly what a paired client's own program calls ask:
//
// - who: the approving person, as an enabled user with a role, on the
//   `paired-client` channel, with their role narrowed to `programs.read` (the
//   only permission reading a project takes; the program route narrows a token
//   call to its allowlist the same way);
// - where: the project's domain is the session's, the gate the program route
//   puts in front of every token call (`assertProjectDomainAccess`);
// - may they read it: the registry's own `projects` call as that actor in that
//   domain, which IAM filters item by item (`filterProgramList`), so a project
//   the person may not read under their policies, or the owner condition on the
//   `service` profile, is not in the answer.
//
// Another tenant's project is unknown to this instance and so fails the domain
// gate, as it does for a program call. Every failure to decide reads as "may
// not": a focus never moves on a guess.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import type { ClientGatewayProjectFocusAuthority, ClientGatewayService, ClientGatewaySession } from "../../../../client-gateway/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../_shared/api.ts";
import type { IdentityAccessService, IdentityAccessSnapshot } from "../../../identity-access/index.ts";

/** What the authority reads: the registry's calls, the project's domain, the person, and where it is installed. */
export type PairedProjectFocusDependencies = {
  readonly registry: Pick<GlobalProgramApiRegistry, "call">;
  readonly service: Pick<AutomationStudioService, "assertProjectDomainAccess">;
  readonly identityAccess: Pick<IdentityAccessService, "snapshot"> | undefined;
  readonly clientGateway: Pick<ClientGatewayService, "projectFocus"> | undefined;
};

/** The permission a focus is decided under: reading the project, nothing else. */
const FOCUS_PERMISSION = "programs.read";

/** Installs the focus authority on the client gateway; without a gateway or an identity service there is nothing to install. */
export function installPairedProjectFocus(dependencies: PairedProjectFocusDependencies): void {
  const { registry, service, identityAccess, clientGateway } = dependencies;
  if (!clientGateway || !identityAccess) return;
  const authority: ClientGatewayProjectFocusAuthority = async ({ session, projectId, domainId }) => {
    const actor = pairedReader(session, await identityAccess.snapshot());
    if (!actor) return false;
    try {
      await service.assertProjectDomainAccess(projectId, domainId);
    } catch {
      return false;
    }
    const listed = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects, scope: { domainId }, actor, payload: {} });
    if (!listed.ok) return false;
    const projects = (listed.payload as { projects?: unknown } | null | undefined)?.projects;
    return Array.isArray(projects) && projects.some((project) => (project as { id?: unknown } | null)?.id === projectId);
  };
  clientGateway.projectFocus.setAuthority(authority);
}

/** The approving person as a paired client's reader, or null when they are gone, disabled, roleless or may not read. */
function pairedReader(session: ClientGatewaySession, directory: IdentityAccessSnapshot): ProgramApiActor | null {
  const userId = session.operatorUserId;
  if (!userId) return null;
  const user = directory.users.find((candidate) => candidate.id === userId);
  if (!user?.enabled) return null;
  const role = directory.roles.find((candidate) => candidate.id === user.roleId);
  if (!role) return null;
  const permissions = role.permissions.filter((permission) => permission === FOCUS_PERMISSION);
  if (permissions.length === 0) return null;
  return { sessionId: `client-gateway:${session.sessionId}`, userId, roleId: role.id, permissions, channel: "paired-client" };
}
