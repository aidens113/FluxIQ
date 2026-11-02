import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../components/automation/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
/** Original trusted client lookup/resolver; never plan metadata or a new registry. */
export type AutomationStudioPlanActionEffectSource = { registry?: { get(id: string): AutomationStudioNodeDefinition | undefined } | undefined; resolveActionEffect?: ((node: AutomationStudioFlowNode, parameterValues?: Readonly<Record<string, unknown>>) => AutomationStudioResolvedActionEffect | undefined) | undefined };
