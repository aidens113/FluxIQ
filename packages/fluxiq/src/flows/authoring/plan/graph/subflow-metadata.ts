import type { AutomationStudioFlowBootstrapFactCondition } from "../index.ts";

/** Graph-level declarations of one Subflow: what proves it worked (C2) and what a runtime must support to run it (C10). */
export type AutomationStudioFlowBootstrapSubflowMetadata = {
  "fluxiq.successCheck"?: AutomationStudioFlowBootstrapFactCondition[];
  requires?: string[];
};
