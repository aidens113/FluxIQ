import type { AutomationStudioFlowBootstrapRouteCondition } from "../index.ts";

export type AutomationStudioFlowBootstrapRouter = {
  name: string;
  rules: Array<{
    key: string;
    name: string;
    targetSubflowKey: string;
    routeTags: string[];
    /**
     * When the router takes this rule. Required by validation: a rule with
     * none always holds, and nothing after it could ever run. Optional in the
     * type only so a stored plan written before conditions existed still
     * reads, and is then refused on apply rather than misread.
     */
    condition?: AutomationStudioFlowBootstrapRouteCondition;
  }>;
  fallback: { kind: "subflow"; targetSubflowKey: string } | { kind: "fail" };
};
