import type { JsonObject } from "../../../core/index.ts";

export type ExecutableRouteDecision = {
  decisionId: string;
  routerId: string;
  selectedRuleId?: string;
  selectedSubflowId?: string;
  fallbackUsed?: boolean;
  rejectedRuleIds?: string[];
  decidedAt: number;
  metadata?: JsonObject;
};
