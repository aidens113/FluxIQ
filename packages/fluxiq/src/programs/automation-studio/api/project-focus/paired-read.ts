// One read of one project by the person who paired a client, decided as the
// paired client's own call of one endpoint would decide it. Both authorities
// this directory installs on the client gateway are this decision for a
// different endpoint (`./authority.ts`):
//
// - who: the approving person, read from the identity source the paired
//   program route reads (`server/program-route/`, its `identityAuthority`): on
//   a hosted tenant that is the host's platform identity, not this instance's
//   own, so a tenant's people are found where their login lives. They must be
//   enabled and have a role, which is narrowed to `programs.read` (the only
//   permission either read takes) on the `paired-client` channel;
// - where: the project exists and its domain is the session's, the gate the
//   program route puts in front of every token call
//   (`assertProjectDomainAccess`); another tenant's project is unknown to this
//   instance and fails it, as a deleted one does;
// - may they: the registry's IAM decision of the endpoint's registered action
//   on the resources that endpoint decides on, made without an audit row
//   (`decideUnrecorded`): the gateway reuses it, and audits the events it acts
//   on (access ended, a check that could not decide) itself.
//
// A person or project refused is `false`. An IAM decision that could not be
// made (its policies unavailable) throws, which the gateway reads as "could not
// decide": nothing is sent or moved on it, and nobody's access is ended by an
// outage.

import type { ClientGatewaySession } from "../../../../client-gateway/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../_shared/api.ts";
import type { Permission } from "../../../identity-access/index.ts";
import type { PairedAccessChangeWatch } from "./access-change-watch.ts";
import type { PairedProjectFocusDependencies, PairedProjectFocusIdentity } from "./types.ts";

/** The permission a project is read under, nothing else. */
const READ_PERMISSION: Permission = "programs.read";
const PROGRAM_ID = "automation-studio";

type ResourceRefs = NonNullable<Parameters<GlobalProgramApiRegistry["decideUnrecorded"]>[0]["resources"]>;

/** Which endpoint's decision a read is: its name, and the resources it decides one project on. */
export type PairedReadEndpoint = { readonly endpoint: string; readonly resources: (projectId: string) => ResourceRefs };

/** A question one installed authority answers: may the session's approving person read `projectId`, in `domainId`. */
type PairedReadQuestion = { session: ClientGatewaySession; projectId: string; domainId: string | null };

/** The authority deciding `read` for the session's approving person, as access stands at each question. */
export function pairedReadAuthority(
  dependencies: PairedProjectFocusDependencies & { identity: NonNullable<PairedProjectFocusDependencies["identity"]> },
  watch: PairedAccessChangeWatch,
  read: PairedReadEndpoint
): (question: PairedReadQuestion) => Promise<boolean> {
  const { registry, service, identity } = dependencies;
  let action: string | undefined;
  return async ({ session, projectId, domainId }) => {
    const source = await identity();
    watch.identity(source);
    const actor = pairedReader(session, await source.snapshot());
    if (!actor || !await inSessionDomain(service, projectId, domainId)) return false;
    action ??= registeredAction(registry, read.endpoint);
    const decided = await registry.decideUnrecorded({ actor, action, permission: READ_PERMISSION, resources: read.resources(projectId), programId: PROGRAM_ID });
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

/** The action `endpoint` is decided under, as it registered it. */
function registeredAction(registry: Pick<GlobalProgramApiRegistry, "endpoints">, endpoint: string): string {
  const action = registry.endpoints().find((entry) => entry.programId === PROGRAM_ID && entry.endpoint === endpoint)?.action;
  if (!action) throw new Error(`The ${endpoint} endpoint is not registered.`);
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
