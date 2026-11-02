import type { AutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import { readAutomationStudioResolvedActionEffect } from "../../../components/automation/action-effect/index.ts";
import { automationStudioConsequencesInOrder } from "../../../components/automation/action-effect/consequences/index.ts";

export function combined(
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
