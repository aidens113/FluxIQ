import type { AutomationStudioFlowBootstrapRouter } from "./router.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "./subflow.ts";

export type AutomationStudioFlowBootstrapPlan = {
  schemaVersion: "0.1";
  router: AutomationStudioFlowBootstrapRouter;
  subflows: AutomationStudioFlowBootstrapSubflow[];
  /**
   * What a runtime must support to run this Flow (C10), written to the Flow's
   * `metadata.requires`. Present only on a Flow that uses a handler, a part
   * call or a page fact; a Flow without them declares nothing and runs as
   * before.
   */
  metadata?: { requires: string[] };
};
