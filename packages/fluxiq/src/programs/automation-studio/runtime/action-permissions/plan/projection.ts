import { readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "../consequences.ts";
import { readAutomationStudioActionDeclaration, type AutomationStudioActionDeclaration, type AutomationStudioActionPermissionCheck, type AutomationStudioActionPermissionVerdict } from "../declaration.ts";
import { automationStudioActionPermissionProjection } from "../projection.ts";

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

function combined(
  canonical: AutomationStudioResolvedActionEffect | undefined,
  client: AutomationStudioResolvedActionEffect | undefined
): AutomationStudioResolvedActionEffect | undefined {
  if (canonical === undefined) return client;
  if (client === undefined) return canonical;
  const classes = [canonical.effectClass, client.effectClass];
  return readAutomationStudioResolvedActionEffect({
    effectClass: classes.includes("commit") ? "commit" : classes.includes("state") ? "state" : "observe",
    permissionConsequences: automationStudioConsequencesInOrder([...canonical.permissionConsequences, ...client.permissionConsequences])
  });
}
