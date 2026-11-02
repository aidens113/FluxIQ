import type { ExecutableRouteRule } from "./rule.ts";
import type { ExecutableRouteTarget } from "./target.ts";

export type ExecutableRouter<TRule extends ExecutableRouteRule = ExecutableRouteRule> = {
  routerId: string;
  flowId: string;
  rules: TRule[];
  fallback?: ExecutableRouteTarget | { kind: "fail"; message?: string };
};
