import type { AutomationStudioFlowRouteGroup, AutomationStudioFlowRouteRule } from "../../../model/index.ts";
import type { AutomationStudioSqlRouter, AutomationStudioSqlRouterRoute } from "../../../storage/index.ts";

// Projecting the SQL router tables back onto the Flow router contract.

export function sqlRouterGroupToFlowGroup(group: AutomationStudioSqlRouter["groups"][number], _index = 0): AutomationStudioFlowRouteGroup {
  return {
    schemaVersion: "0.1",
    groupId: group.groupId,
    routerId: group.routerId,
    name: group.name,
    ...(group.description ? { description: group.description } : {}),
    order: group.order,
    status: group.status,
    collapsed: group.collapsed,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    metadata: { ...group.metadata, revision: group.revision }
  };
}

export function sqlRouterRouteToFlowRule(route: AutomationStudioSqlRouterRoute): AutomationStudioFlowRouteRule {
  return {
    schemaVersion: "0.1",
    ruleId: route.routeId,
    routerId: route.routerId,
    name: route.name,
    target: { kind: "subflow", subflowId: route.targetSubflowId ?? "" },
    order: route.priority,
    status: route.enabled ? "active" : "disabled",
    ...(route.conditionKind !== "always" && route.condition && typeof route.condition === "object" ? { condition: route.condition } : {}),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
    metadata: { ...(route.groupId ? { groupId: route.groupId } : {}), revision: route.revision }
  } as unknown as AutomationStudioFlowRouteRule;
}
