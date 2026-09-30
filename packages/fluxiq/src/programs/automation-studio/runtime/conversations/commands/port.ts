// The one way a conversation command reaches Core: the program registry, in
// process, as the caller.
//
// Every call carries the request's own actor (with the session `caller.ts`
// settled on) and its own scope, so the endpoint's permission, its handler's
// checks and the domain scope all apply exactly as they would to the same
// request made from a control. On top of that, only endpoints the registry
// classifies `read` or `authoring` are reachable at all: anything that deletes
// or pays is refused here, whatever a catalog entry asked for, so a chat
// command can never be the way round the PIN.

import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../../_shared/api.ts";
import type { ProgramScope } from "../../../../_shared/types.ts";
import type { AutomationStudioConversationCommandPort } from "./command.ts";

const PROGRAM_ID = "automation-studio";
const REACHABLE: ReadonlySet<string> = new Set(["read", "authoring"]);

export function automationStudioConversationCommandPort(input: {
  registry: Pick<GlobalProgramApiRegistry, "call" | "endpoints">;
  actor: ProgramApiActor;
  scope: ProgramScope;
}): AutomationStudioConversationCommandPort {
  return {
    async call(endpoint, payload) {
      const registration = input.registry.endpoints().find((entry) => entry.programId === PROGRAM_ID && entry.endpoint === endpoint);
      if (!registration) return { ok: false, error: `Core has no ${endpoint} endpoint to call.` };
      if (!REACHABLE.has(registration.classification)) {
        return { ok: false, error: `${endpoint} is classified ${registration.classification}, and a conversation command only reads and authors; that has to be done from its control.` };
      }
      const response = await input.registry.call({ programId: PROGRAM_ID, endpoint, scope: input.scope, actor: input.actor, payload });
      return { ok: response.ok, ...(response.payload === undefined ? {} : { payload: response.payload }), ...(response.error === undefined ? {} : { error: response.error }) };
    }
  };
}
