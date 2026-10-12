// The state-routing refusal types, kept under their t387 names. They are
// declared on the executor's shared record (`../contracts.ts`), so the run
// detail and the trace read the same shape this module's decision writes.
import type { AutomationStudioStateRoutingRecord } from "../contracts.ts";

export type { AutomationStudioStateRouteRefusal, AutomationStudioStateRouteRefusalGuard } from "../contracts.ts";

/**
 * The routing record a decision returns. Now the executor's record itself,
 * which declares `refused`; the name is kept for the decision's callers.
 */
export type AutomationStudioGuardedStateRoutingRecord = AutomationStudioStateRoutingRecord;
