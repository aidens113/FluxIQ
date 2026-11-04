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

import type { AutomationStudioConversationCommandPort } from "./command.ts";

/** Who a command calls as: the request's own session, user, role and permissions. */
export type AutomationStudioConversationCommandActor = {
  sessionId: string;
  userId: string;
  roleId: string;
  permissions: string[];
  channel?: "panel" | "paired-client";
};

/** The domain a command runs in. */
export type AutomationStudioConversationCommandScope = { domainId?: string | null };

/**
 * What the port needs of the program registry, which satisfies it: list endpoints with their
 * classification, and call one.
 */
export type AutomationStudioConversationCommandRegistry = {
  call(request: {
    programId: string;
    endpoint: string;
    scope: AutomationStudioConversationCommandScope;
    actor?: AutomationStudioConversationCommandActor;
    payload?: unknown;
  }): Promise<{ ok: boolean; payload?: unknown; error?: string }>;
  endpoints(): { programId: string; endpoint: string; classification: string }[];
};

const PROGRAM_ID = "automation-studio";
const REACHABLE: ReadonlySet<string> = new Set(["read", "authoring"]);

export function automationStudioConversationCommandPort(input: {
  registry: AutomationStudioConversationCommandRegistry;
  actor: AutomationStudioConversationCommandActor;
  scope: AutomationStudioConversationCommandScope;
}): AutomationStudioConversationCommandPort {
  return {
    async call(endpoint, payload) {
      const registration = input.registry.endpoints().find((entry) => entry.programId === PROGRAM_ID && entry.endpoint === endpoint);
      if (!registration) return { ok: false, error: `FluxIQ has no ${endpoint} endpoint to call.` };
      if (!REACHABLE.has(registration.classification)) {
        return { ok: false, error: `${endpoint} is classified ${registration.classification}, and a conversation command only reads and authors; that has to be done from its control.` };
      }
      const response = await input.registry.call({ programId: PROGRAM_ID, endpoint, scope: input.scope, actor: input.actor, payload });
      return { ok: response.ok, ...(response.payload === undefined ? {} : { payload: response.payload }), ...(response.error === undefined ? {} : { error: response.error }) };
    }
  };
}
