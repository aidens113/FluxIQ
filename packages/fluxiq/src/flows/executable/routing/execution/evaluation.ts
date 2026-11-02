export type ExecutableRouteRuleEvaluation = {
  ruleId: string;
  matched: boolean;
  reason: string;
  targetSubflowId?: string;
};
