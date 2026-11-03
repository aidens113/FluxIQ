import type { AutomationStudioFlowBootstrapCurrentRoute } from "./current-route.ts";

export type AutomationStudioFlowBootstrapCurrentStructure = {
  routes: AutomationStudioFlowBootstrapCurrentRoute[];
  /** What runs when no route holds: a block's label, or that the run fails. */
  fallback: string;
  subflows: Array<{ label: string; name: string; role: string; steps: number }>;
};
