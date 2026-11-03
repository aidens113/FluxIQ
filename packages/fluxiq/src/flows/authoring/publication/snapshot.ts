import type { ExecutableFlowSnapshot } from "../../executable/composite/index.ts";

/** Publication/display metadata around independently executable snapshot content. */
export type AutomationStudioPublishedFlowSnapshot = ExecutableFlowSnapshot & {
  schemaVersion: "0.1";
  name: string;
  description?: string;
  publishedAt: number;
  publishedBy?: string;
  changelog?: string;
};
