// The admin actor the handler suites call endpoints as.

import type { ProgramApiActor } from "../../../../_shared/api.ts";

export const cacheActor = (userId: string): ProgramApiActor => ({
  sessionId: `session.${userId}`,
  userId,
  roleId: "admin",
  permissions: ["programs.read", "programs.write"]
});
