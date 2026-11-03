import type { JsonObject } from "../../../../core/index.ts";

export type AutomationStudioRouterState = {
  /** What `state.*` resolves against: the caller's state, with what the host observed over it. */
  state: JsonObject;
  /** What the decision record says about where the state came from. Values are never kept. */
  source: { observed: boolean; paths: string[]; unavailable?: string };
};
