import type { AutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import type { AutomationStudioActionPermissionCheck, AutomationStudioActionPermissionVerdict, AutomationStudioActionDeclaration } from "../../../flows/executable/permissions/index.ts";
import { readAutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import { automationStudioConsequencesInOrder } from "../../../components/automation/action-effect/consequences/index.ts";
import { readAutomationStudioActionDeclaration } from "../declaration/index.ts";
import { combined } from "./combined.ts";
import { automationStudioActionPermissionProjection } from "../declaration/index.ts";

/** Bind the canonical floor to the client's check and the accepted plan's classes. */
export function automationStudioPlanPermissionProjection(input: {
  actionEffect?: AutomationStudioResolvedActionEffect | undefined;
  consequences?: readonly AutomationStudioActionConsequence[] | undefined;
  permission: AutomationStudioActionPermissionCheck;
}): {
  permission: AutomationStudioActionPermissionCheck;
  decision(): AutomationStudioActionPermissionVerdict;
  consequences(): AutomationStudioActionConsequence[] | undefined;
} {
  const canonical = input.actionEffect === undefined ? undefined : readAutomationStudioResolvedActionEffect(input.actionEffect);
  let decided: AutomationStudioActionPermissionVerdict | undefined;
  let projected = canonical === undefined ? undefined : automationStudioConsequencesInOrder([...(input.consequences ?? []), ...canonical.permissionConsequences]);
  const permission: AutomationStudioActionPermissionCheck = async (declaration) => {
    const read = readAutomationStudioActionDeclaration(declaration);
    const actionEffect = combined(canonical, read.actionEffect);
    const checked: AutomationStudioActionDeclaration = {
      consequences: automationStudioConsequencesInOrder([...(input.consequences ?? []), ...read.consequences]),
      control: structuredClone(declaration.control),
      verb: read.verb,
      effect: read.effect
    };
    if (actionEffect !== undefined) checked.actionEffect = actionEffect;
    decided = await input.permission(checked);
    if (decided.permitted && actionEffect !== undefined) projected = automationStudioActionPermissionProjection(readAutomationStudioActionDeclaration(checked)).consequences;
    return decided;
  };
  return {
    permission,
    decision: () => {
      if (decided !== undefined) return decided;
      // No declaration means no grounded control to ask about. Known classes
      // are refused rather than published unchecked or given an invented name.
      if (canonical !== undefined && projected?.length) return { permitted: false, missing: [...projected], requestId: null };
      return { permitted: true };
    },
    consequences: () => projected === undefined ? undefined : [...projected]
  };
}
