import type { ExecutionScope } from "../../../runtime/execution-admission/index.ts";
import type { AutomationExecutionAdmissionSource } from "./port.ts";
import type { AutomationExecutionAdmissionCollaborators } from "./collaborators.ts";
import { AutomationAdmissionDriver } from "./internal/index.ts";

export function createAutomationExecutionAdmissionSource(scope: ExecutionScope, collaborators: AutomationExecutionAdmissionCollaborators = {}): AutomationExecutionAdmissionSource {
  return new AutomationAdmissionDriver(scope, collaborators);
}
