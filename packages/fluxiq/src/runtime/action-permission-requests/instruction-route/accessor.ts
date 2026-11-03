import type { AutomationStudioInstructionRouteReading } from "./reading.ts";

/**
 * A build's route, from its one read of the person's instructions
 * (`../../service/instruction-authority.ts` keeps the read; the draft and the
 * completion read the route through this, `../../llm/harness-options/draft-route.ts`).
 */
export type AutomationStudioInstructionRouteAccessor = {
  /** The route as the one read answered it, sending that read if nothing has yet; a read that failed is `unavailable`, never `open`. */
  read(): Promise<AutomationStudioInstructionRouteReading>;
  /** What is known without sending anything: `unread` until the one read has settled. */
  peek(): AutomationStudioInstructionRouteReading;
};
