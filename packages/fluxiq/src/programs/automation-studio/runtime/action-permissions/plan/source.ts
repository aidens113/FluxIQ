import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioResolvedActionEffect } from "../../../nodes/index.ts";

/** Trusted host sources only; a plan's own metadata is never an effect source. */
export type AutomationStudioPlanActionEffectSource = {
  registry?: Pick<AutomationStudioNodeRegistry, "get"> | undefined;
  resolveActionEffect?: ((node: AutomationStudioFlowNode, parameterValues?: Readonly<Record<string, unknown>>) => AutomationStudioResolvedActionEffect | undefined) | undefined;
};
