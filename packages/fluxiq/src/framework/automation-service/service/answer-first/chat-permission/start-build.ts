// Legacy, candidate and project entry points ask before their first model decision. Every brief's
// later gate shares this ground, waits for its answer and cannot ask again, including after silence.

import type { AutomationStudioFlowBootstrapActionPermissions, AutomationStudioFlowBootstrapStartPermission, AutomationStudioFlowBootstrapStartRequest } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";

export async function automationStudioAnswerFirstPermissionForBuild(
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "askAtStart">,
  ground: {
    startFrom(): Promise<AutomationStudioFlowBootstrapStartRequest>;
    started(start: AutomationStudioFlowBootstrapStartPermission, request: AutomationStudioFlowBootstrapStartRequest): Promise<void>;
  }
): Promise<void> {
  const request = await ground.startFrom();
  let start: AutomationStudioFlowBootstrapStartPermission = { classes: undefined };
  try {
    start = await permissions.askAtStart(request);
  } finally {
    await ground.started(start, request);
  }
}
