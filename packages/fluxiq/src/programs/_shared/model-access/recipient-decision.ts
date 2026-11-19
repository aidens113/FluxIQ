// Whether a paired session's person may be told their model access, decided
// exactly as the Secret Keys snapshot decides that session's own call (t950, F4).
//
// The push and the snapshot carry the same state, so they must be refused
// alike: one IAM decision of the snapshot's registered action, permission and
// resource, for the same actor the paired program route builds (the approving
// person on the `paired-client` channel, so the request origin is the
// extension's), asked per recipient each time the state is worked out. A
// policy that denies a person `secrets:Snapshot`, a session policy that
// narrows a paired browser, or a role without the snapshot's permission refuses
// both. It is decided without an audit row (`decideUnrecorded`): the gateway
// works the state out on every change, and audits by kind what it could not
// read.

import { AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../../../runtime/conversations/commands/index.ts";
import { SECRET_KEYS_ENDPOINTS } from "../../secret-keys/api/contracts.ts";
import type { ProgramApiActor } from "../api.ts";
import type { ModelAccessPushDirectory, ModelAccessPushRegistry } from "./types.ts";

const PROGRAM_ID = "secret-keys";

/**
 * True when the snapshot endpoint would answer this session's own call, false
 * when IAM refuses it, the person is gone, disabled or roleless, or their role
 * lacks the snapshot's permission. Throws when IAM could not decide (its
 * policies unavailable), which the gateway reads as "could not be read":
 * nothing is sent, and nobody is told a state the snapshot might refuse.
 */
export async function modelAccessRecipientAllowed(registry: ModelAccessPushRegistry, directory: ModelAccessPushDirectory, subject: { sessionId: string; userId: string }): Promise<boolean> {
  const registration = registry.endpoints().find((entry) => entry.programId === PROGRAM_ID && entry.endpoint === SECRET_KEYS_ENDPOINTS.snapshot);
  if (!registration?.action) return false;
  const person = directory.users.find((user) => user.id === subject.userId);
  if (!person?.enabled) return false;
  const role = directory.roles.find((candidate) => candidate.id === person.roleId);
  if (!role?.permissions.includes(registration.permission)) return false;
  // The route narrows a token's permissions to the allowlist's; the snapshot needs only its own, so that is all this actor holds.
  const actor: ProgramApiActor = { sessionId: `${AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX}${subject.sessionId}`, userId: person.id, roleId: role.id, permissions: [registration.permission], channel: "paired-client" };
  const resources = registration.resource?.of({ programId: PROGRAM_ID, endpoint: registration.endpoint, scope: {}, payload: {}, actor });
  const decided = await registry.decideUnrecorded({ actor, action: registration.action, permission: registration.permission, ...(resources === undefined ? {} : { resources }), programId: PROGRAM_ID });
  if (decided.allowed) return true;
  if (decided.decision === null || decided.decision.failure !== undefined) throw new Error("Whether the person may read their model access could not be decided.");
  return false;
}
