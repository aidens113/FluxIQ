import type { ClientGatewayActivitySkipReason } from "./skip-reason.ts";

/**
 * The skip a `step` row reports, so a client draws its card from a closed
 * field rather than from the row's shape or Core's sentence. `subject` is the
 * plain words naming what was skipped: the list row's label ("Lin Zhao") or the
 * step's authored label, never other page data.
 */
export type ClientGatewayActivitySkip = {
  reason: ClientGatewayActivitySkipReason;
  subject?: string;
};
