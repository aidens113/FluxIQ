import type { AutomationStudioFlowRouter } from "../../../../flows/authoring/routing/index.ts";
import { automationStudioRouteConditionPaths } from "../../../../runtime/flow-authoring/plan/route-condition/index.ts";

/** The `state.*` paths the router's active rules read, each once, in rule order. */
export function automationStudioRouterStatePaths(router: AutomationStudioFlowRouter): string[] {
  const paths: string[] = [];
  for (const rule of router.rules) {
    if (rule.status !== "active") continue;
    for (const path of automationStudioRouteConditionPaths(rule.condition)) {
      if (path.startsWith("state.") && !paths.includes(path)) paths.push(path);
    }
  }
  return paths;
}
