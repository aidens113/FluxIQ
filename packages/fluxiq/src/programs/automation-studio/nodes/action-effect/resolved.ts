import type { AutomationStudioActionConsequence } from "../../model/action-consequences/index.ts";
import type { AutomationStudioActionEffectClass } from "./effect-class.ts";

/** An execution's trusted floor, with no unresolved predicate. */
export type AutomationStudioResolvedActionEffect = {
  effectClass: AutomationStudioActionEffectClass;
  permissionConsequences: readonly AutomationStudioActionConsequence[];
};
