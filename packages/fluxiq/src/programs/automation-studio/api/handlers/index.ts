// Exactly the three names `handlers.ts` published before this directory
// existed. The conversation endpoints were published here while the service
// facade carried no `conversations` field; it carries one now, so they are
// registered from `register.ts` with the rest and the extra name is gone.

export { registerAutomationStudioApi } from "./register.ts";
export { flowInstructionScopeFromPayload } from "../../../../framework/automation-service/service/flow-instruction-requests/index.ts";
export { assertFlowLlmExecutionSettings } from "../../../../framework/automation-service/service/flow-settings-requests/index.ts";
