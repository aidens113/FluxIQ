import type { AUTOMATION_STUDIO_PROJECT_DECISION_KINDS } from "./kinds.ts";

export type AutomationStudioProjectDecisionLogEntry = {
  kind: (typeof AUTOMATION_STUDIO_PROJECT_DECISION_KINDS)[number];
  reason: string;
  /** The briefs the decision is about; empty for a decision about none. */
  briefIds: string[];
  /** The structure plan in force when the decision was made, once there is one. */
  planDigest?: string;
};
