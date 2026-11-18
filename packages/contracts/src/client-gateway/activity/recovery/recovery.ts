import type { ClientGatewayActivityRecoveryEvent } from "./event.ts";
import type { ClientGatewayActivityRecoveryKind } from "./kind.ts";
import type { ClientGatewayActivityRecoveryOutcome } from "./outcome.ts";

/**
 * The recovery a `step` row reports, so a client renders its card from closed
 * fields rather than parsing Core's sentence. `subject` is the plain words the
 * card shows ("Dismiss the sign-in popup"): an authored label or Core's own
 * words, never page data. `event` is set on a `handler` recovery; `targetId`
 * is the checkpoint, entry, node or Subflow it led to, when there is one.
 */
export type ClientGatewayActivityRecovery = {
  kind: ClientGatewayActivityRecoveryKind;
  subject: string;
  outcome: ClientGatewayActivityRecoveryOutcome;
  event?: ClientGatewayActivityRecoveryEvent;
  targetId?: string;
};
