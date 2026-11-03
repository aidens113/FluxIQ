import type { AutomationStudioFlowNode } from "../graph/index.ts";
import type { AutomationStudioFlowScope } from "../scope.ts";
import type { AutomationStudioCallFlowConfiguration, AutomationStudioCallFlowBinding } from "./call/index.ts";

export const CALL_FLOW_METADATA_KEY = "fluxiq.callFlow";

export function getCallFlowConfiguration(node: AutomationStudioFlowNode): AutomationStudioCallFlowConfiguration | null {
  const value = node.metadata?.[CALL_FLOW_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = (value as Record<string, unknown>).target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return null;
  const targetValue = target as Record<string, unknown>;
  const scope = targetValue.scope;
  if (typeof targetValue.flowId !== "string" || typeof targetValue.version !== "string" || !isFlowScope(scope)) return null;
  const configuration = value as Record<string, unknown>;
  return { target: { flowId: targetValue.flowId, version: targetValue.version, scope }, ...readBindings(configuration, "inputBindings"), ...readBindings(configuration, "outputBindings"), ...readBindings(configuration, "errorBindings") };
}

function readBindings(value: Record<string, unknown>, key: "inputBindings" | "outputBindings" | "errorBindings"): Partial<Pick<AutomationStudioCallFlowConfiguration, typeof key>> {
  const bindings = value[key];
  if (!Array.isArray(bindings)) return {};
  const valid = bindings.filter((item): item is AutomationStudioCallFlowBinding => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).targetPortId === "string" && typeof (item as Record<string, unknown>).valueKey === "string"));
  return valid.length ? { [key]: valid } : {};
}

function isFlowScope(value: unknown): value is AutomationStudioFlowScope { return Boolean(value && typeof value === "object" && !Array.isArray(value) && (((value as { kind?: unknown }).kind === "global") || ((value as { kind?: unknown }).kind === "domain" && typeof (value as { domainId?: unknown }).domainId === "string"))); }
