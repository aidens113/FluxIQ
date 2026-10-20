// Which of a build's agents one of Core's activity events comes from, read
// from the raw event (automation-project-agents-plan, chat presentation;
// `ClientGatewayActivity.agent`).
//
// A build with a project supervisor speaks with several voices: the
// supervisor plans and briefs, a builder authors one subflow, a repair agent
// fixes one, and the validator tries them. Core stamps each event with its
// author; a build with one agent carries none. This is the one reader: it
// keeps the field only in the contract's shape, so a chat never groups a step
// under a lane an older or newer Core named in another form.
//
// Pure: no browser API.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** The author an event names, as the wire contract declares it. */
export type ActivityAgent = NonNullable<ClientGatewayActivity["agent"]>;

// A record over the contract's union, so a role Core adds or drops fails the
// typecheck here instead of being silently read.
const ROLES: Record<ActivityAgent["role"], true> = { supervisor: true, builder: true, repair: true, validator: true };

/**
 * A brief's id as Core bounds it (its `TARGET_ID` in `activity/bounded.ts`):
 * 1 to 200 characters and no white space. A sentence is no id, and no lane is
 * made from it.
 */
const BRIEF_ID = /^\S{1,200}$/u;

/**
 * The agent `event` comes from, or `undefined` when it names none or one
 * outside the contract. `briefId` is kept only when it is id-shaped, and
 * `subflowName` only when it is a non-blank string, trimmed.
 */
export function activityAgent(event: ClientGatewayActivity): ActivityAgent | undefined {
  const raw = event.agent as unknown;
  if (typeof raw !== "object" || raw === null) return undefined;
  const fields = raw as Record<string, unknown>;
  const role = fields.role;
  if (typeof role !== "string" || !Object.prototype.hasOwnProperty.call(ROLES, role)) return undefined;
  const briefId = typeof fields.briefId === "string" && BRIEF_ID.test(fields.briefId) ? fields.briefId : undefined;
  const subflowName = typeof fields.subflowName === "string" ? fields.subflowName.trim() : "";
  return {
    role: role as ActivityAgent["role"],
    ...(briefId === undefined ? {} : { briefId }),
    ...(subflowName ? { subflowName } : {})
  };
}
