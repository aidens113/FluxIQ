import type { AutomationStudioCallFlowTarget } from "./target.ts";
import type { AutomationStudioCallFlowBinding } from "./binding.ts";
import type { AutomationStudioFlowScope } from "../../index.ts";
export type AutomationStudioCallFlowConfiguration = { target: AutomationStudioCallFlowTarget; inputBindings?: AutomationStudioCallFlowBinding[]; outputBindings?: AutomationStudioCallFlowBinding[]; errorBindings?: AutomationStudioCallFlowBinding[] };
