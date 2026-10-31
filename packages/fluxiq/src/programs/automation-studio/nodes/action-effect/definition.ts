import type { AutomationStudioActionConsequence } from "../../model/action-consequences/index.ts";
import type { AutomationStudioActionEffectClass } from "./effect-class.ts";

/** A client-owned floor on a canonical definition, never a model claim. */
export type AutomationStudioNodeActionEffect = {
  effectClass: AutomationStudioActionEffectClass;
  /**
   * A declared boolean parameter that raises the class to commit unless its
   * value is proven false. An absent value uses only its declared default;
   * unresolved bindings and every other unknown value cannot prove false.
   */
  commitWhen?: string;
  /** Always-known lasting consequences, independent of the predicate. */
  permissionConsequences?: readonly AutomationStudioActionConsequence[];
};
