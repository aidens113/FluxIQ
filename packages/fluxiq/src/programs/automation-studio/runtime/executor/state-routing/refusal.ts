// The state-routing refusal types, kept under their t387 names. They are
// declared on the executor's shared record (`../contracts.ts`), so the run
// detail and the trace read the same shape this module's decision writes.
import type { AutomationStudioFlowRunStateRouteNoMatchCause } from "../../../model/index.ts";
import type { AutomationStudioStateRoutingRecord } from "../contracts.ts";

export type { AutomationStudioStateRouteRefusal, AutomationStudioStateRouteRefusalGuard } from "../contracts.ts";

/**
 * The routing record a decision returns: the executor's record, plus
 * `noMatchCause` on a `no_match` (t661), the closed code of why no way on was
 * found (`AutomationStudioFlowRunStateRouteNoMatchCause`). The attempt keeps
 * the record whole, and the run detail reads the cause from it
 * (`../../service/summaries/state-routing.ts`), never the `reason` sentence.
 */
export type AutomationStudioGuardedStateRoutingRecord = AutomationStudioStateRoutingRecord & { noMatchCause?: AutomationStudioFlowRunStateRouteNoMatchCause };
