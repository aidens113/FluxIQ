// The program API actor a successful identity login stands for. Shared by the
// global program service suites that call endpoints as a signed-in user.

import type { ProgramApiActor } from "../_shared/api.ts";
import type { IdentityAccessService } from "../identity-access/index.ts";

export function actorFor(login: Awaited<ReturnType<IdentityAccessService["authenticate"]>>): ProgramApiActor {
  return {
    sessionId: login.session.id,
    userId: login.user.id,
    roleId: login.role.id,
    permissions: login.role.permissions
  };
}
