import type { AutomationStudioFlowNode } from "../../../flows/authoring/model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioResolvedActionEffect } from "../../../framework/automation-service/nodes/index.ts";

/** Trusted host sources only; a plan's own metadata is never an effect source. */
export type AutomationStudioPlanActionEffectSource = {
  registry?: Pick<AutomationStudioNodeRegistry, "get"> | undefined;
  resolveActionEffect?: ((node: AutomationStudioFlowNode, parameterValues?: Readonly<Record<string, unknown>>) => AutomationStudioResolvedActionEffect | undefined) | undefined;
};
