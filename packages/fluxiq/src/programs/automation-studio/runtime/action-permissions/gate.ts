import { ActionPermissionGate } from "../../../../runtime/action-permissions/gate/index.ts";
import type { AutomationStudioActionPermissionGateInput } from "../../../../runtime/action-permissions/gate/index.ts";
import { automationStudioActionPermissionSentence } from "./request.ts";
export type { AutomationStudioActionPermissionGateInput } from "../../../../runtime/action-permissions/gate/index.ts";
export { automationStudioActionPermissionDenied } from "../../../../runtime/action-permissions/gate/index.ts";
/** Studio supplies its existing person-facing sentence; the neutral gate retains original input receivers. */
export class AutomationStudioActionPermissionGate extends ActionPermissionGate { constructor(input: AutomationStudioActionPermissionGateInput) { super(input, automationStudioActionPermissionSentence); } }
