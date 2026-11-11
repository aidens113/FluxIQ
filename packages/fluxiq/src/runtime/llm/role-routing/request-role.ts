import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import { AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES, type AutomationStudioLlmModelRole } from "./kind-roles.ts";
import { automationStudioLlmModelRoleFrame } from "./frame.ts";

/**
 * The role a request's model plays. A judge's call is always the judge's. A call
 * carrying an in-run repair's slot (`context.inRunRepair`, the `core.in_run_repair`
 * section's reader) is a repair whatever its kind. Otherwise its kind's role
 * (`./kind-roles.ts`), except that a call whose kind explores is given the role of the
 * frame it runs in, where one was set (`./frame.ts`).
 */
export function automationStudioLlmModelRoleOf(request: Pick<AutomationStudioLlmTaskRequest, "taskKind" | "context">): AutomationStudioLlmModelRole {
  const role = AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES[request.taskKind];
  if (role === "judge") return role;
  if (request.context?.inRunRepair !== undefined) return "repair";
  return role === "explore" ? automationStudioLlmModelRoleFrame() ?? role : role;
}
