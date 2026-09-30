// The shapes of Automation Studio's live activity stream: what an emission site
// says, what a unit of work is, and what the hub hands a reader.
//
// The event itself is `ClientGatewayActivity`, the wire contract, used as is so
// that what the hub keeps and what a paired client receives cannot drift.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** One unit of work the activity belongs to: a build or a run. */
export type AutomationStudioActivityScope = {
  kind: "build" | "run";
  id: string;
  projectId: string;
  flowId?: string;
  conversationId?: string;
};

/** What the hub is handed: an event before it is numbered and stamped. */
export type AutomationStudioActivityInput = Omit<ClientGatewayActivity, "sequence" | "at">;

/** What an emission site says; the scope it runs under supplies the rest. */
export type AutomationStudioActivityEmission = Pick<ClientGatewayActivity, "phase" | "label" | "step" | "detail" | "final">;

export type AutomationStudioActivityListener = (event: ClientGatewayActivity) => void;

/** The latest event of one project, and the events before it, oldest first. */
export type AutomationStudioActivitySnapshot = { current: ClientGatewayActivity | null; recent: ClientGatewayActivity[] };

/**
 * What the scope storage holds for one unit of work. A run's id is known only
 * once its session is admitted, so a run frame starts `pending` and emits
 * nothing until it is bound.
 */
export type AutomationStudioActivityFrame = { scope: AutomationStudioActivityScope; pending: boolean };
