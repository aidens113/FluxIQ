// What decides whether the person who paired a client may read a project in
// the domain the client declared (client gateway, `service/project-focus/`):
// asked when the client moves its session to a project (`client.focus_project`)
// and before a project's `server.activity` first reaches the session. The
// gateway reuses that decision until it is told access changed, so this
// installs the authority again whenever what it decides from changes: the
// person's identity (their role or enabled flag, a role's permissions), the
// registry's decisions (an IAM store write in this workspace, a registration),
// or a project removed from the catalogue. The gateway holds no identity or
// IAM, so this is installed on it by the program runtime, where both live, and
// it asks what reading one project through the paired client's own program
// calls asks:
//
// - who: the approving person, read from the identity source the paired
//   program route reads (`server/program-route/`, its `identityAuthority`): on
//   a hosted tenant that is the host's platform identity, not this instance's
//   own, so a tenant's people are found where their login lives. They must be
//   enabled and have a role, which is narrowed to `programs.read` (the only
//   permission reading a project takes) on the `paired-client` channel;
// - where: the project exists and its domain is the session's, the gate the
//   program route puts in front of every token call
//   (`assertProjectDomainAccess`); another tenant's project is unknown to this
//   instance and fails it, as a deleted one does;
// - may they read it: the registry's IAM decision of the `projects` listing's
//   action on the workspace and on this one project, exactly the two decisions
//   a listing makes before it keeps the project (`filterProgramList`), so a
//   project the person may not read under their policies, or the owner
//   condition on the `service` profile, is refused. It is decided without an
//   audit row (`decideUnrecorded`): the gateway reuses it, and audits the
//   events it acts on (access ended, a check that could not decide) itself.
//
// A person or project refused is `false`. An IAM decision that could not be
// made (its policies unavailable) throws, which the gateway reads as "could not
// decide": a focus is then refused as unavailable and activity is held back,
// but nobody's access is ended by an outage.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import type { ClientGatewayProjectFocusAuthority, ClientGatewayService, ClientGatewaySession } from "../../../../client-gateway/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../_shared/api.ts";
import type { Permission } from "../../../identity-access/index.ts";

/** The people and roles the approving person is read from, and what tells of their change; the shape the program route's identity authority answers. */
export type PairedProjectFocusIdentity = {
  snapshot(): Promise<{
    users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
    roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
  }>;
  readonly directoryChanges: PairedProjectFocusChangeSource;
};

/** Something that tells of a change (`AutomationStudioProjectRemovals`, `IdentityDirectoryChanges`); `subscribe` returns what stops it. */
type PairedProjectFocusChangeSource = { subscribe(listener: () => void): () => void };

/** What the authority reads: the registry's IAM, the project's domain, the person, and where it is installed. */
export type PairedProjectFocusDependencies = {
  readonly registry: Pick<GlobalProgramApiRegistry, "decideUnrecorded" | "subscribeDecisionChanges" | "endpoints">;
  readonly service: Pick<AutomationStudioService, "assertProjectDomainAccess"> & { readonly projects: { readonly removals: PairedProjectFocusChangeSource } };
  /** The identity source the paired program route reads people from, as it stands at each decision. */
  readonly identity: (() => Promise<PairedProjectFocusIdentity>) | undefined;
  readonly clientGateway: Pick<ClientGatewayService, "projectFocus"> | undefined;
};

/** The permission a project is read under, nothing else. */
const READ_PERMISSION: Permission = "programs.read";
const PROGRAM_ID = "automation-studio";

/**
 * Installs the focus authority on the client gateway, and installs it again
 * at each change of what it decides from, which tells the gateway that the
 * decisions it reuses are void (`ClientGatewayProjectFocusPort.setAuthority`).
 * Returns what stops listening; the runtime calls it as it closes, since the
 * host's identity outlives a tenant's runtime. Without a gateway or an
 * identity source there is nothing to install.
 */
export function installPairedProjectFocus(dependencies: PairedProjectFocusDependencies): () => void {
  const { registry, service, identity, clientGateway } = dependencies;
  if (!clientGateway || !identity) return () => undefined;
  const changed = () => {
    clientGateway.projectFocus.setAuthority(authority);
  };
  const watch = new AccessChangeWatch([registry.subscribeDecisionChanges(changed), service.projects.removals.subscribe(changed)], changed);
  const authority = pairedProjectReadAuthority({ ...dependencies, identity }, watch);
  changed();
  return () => watch.stop();
}

/**
 * The changes one installed authority listens for. The identity source is
 * watched from the first question that read it, before it reads, so no
 * decision is made from a directory whose change would not be heard.
 */
class AccessChangeWatch {
  private readonly watched = new WeakSet<PairedProjectFocusIdentity>();

  constructor(private readonly stops: Array<() => void>, private readonly changed: () => void) {}

  identity(source: PairedProjectFocusIdentity): void {
    if (this.watched.has(source)) return;
    this.watched.add(source);
    this.stops.push(source.directoryChanges.subscribe(this.changed));
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
  }
}

/** The authority: whether the session's approving person may read one project, as it stands now. */
function pairedProjectReadAuthority(dependencies: PairedProjectFocusDependencies & { identity: () => Promise<PairedProjectFocusIdentity> }, watch: AccessChangeWatch): ClientGatewayProjectFocusAuthority {
  const { registry, service, identity } = dependencies;
  let readAction: string | undefined;
  return async ({ session, projectId, domainId }) => {
    const source = await identity();
    watch.identity(source);
    const actor = pairedReader(session, await source.snapshot());
    if (!actor || !await inSessionDomain(service, projectId, domainId)) return false;
    readAction ??= projectsListingAction(registry);
    const resources = [{ kind: "workspace" as const }, { kind: "project" as const, projectId }];
    const decided = await registry.decideUnrecorded({ actor, action: readAction, permission: READ_PERMISSION, resources, programId: PROGRAM_ID });
    if (decided.allowed) return true;
    if (decided.decision === null || decided.decision.failure !== undefined) throw new Error("The person's access to the project could not be decided.");
    return false;
  };
}

/** Whether the project exists here and belongs to the session's domain; a missing or foreign one does not. */
async function inSessionDomain(service: PairedProjectFocusDependencies["service"], projectId: string, domainId: string | null): Promise<boolean> {
  try {
    await service.assertProjectDomainAccess(projectId, domainId);
    return true;
  } catch {
    return false;
  }
}

/** The action the `projects` listing is decided under, as it registered it. */
function projectsListingAction(registry: Pick<GlobalProgramApiRegistry, "endpoints">): string {
  const action = registry.endpoints().find((entry) => entry.programId === PROGRAM_ID && entry.endpoint === AUTOMATION_STUDIO_ENDPOINTS.projects)?.action;
  if (!action) throw new Error("The projects listing is not registered.");
  return action;
}

/** The approving person as a paired client's reader, or null when they are gone, disabled, roleless or may not read. */
function pairedReader(session: ClientGatewaySession, directory: Awaited<ReturnType<PairedProjectFocusIdentity["snapshot"]>>): ProgramApiActor | null {
  const userId = session.operatorUserId;
  if (!userId) return null;
  const user = directory.users.find((candidate) => candidate.id === userId);
  if (!user?.enabled) return null;
  const role = directory.roles.find((candidate) => candidate.id === user.roleId);
  if (!role) return null;
  if (!role.permissions.includes(READ_PERMISSION)) return null;
  return { sessionId: `client-gateway:${session.sessionId}`, userId, roleId: role.id, permissions: [READ_PERMISSION], channel: "paired-client" };
}
