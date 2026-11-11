// A run's model per role (W3, t899): each model call goes to the model its role names
// (`AutomationStudioRunOverrides["models"]`), through one provider that routes by role, and is
// measured, held and charged at the model that served it (`ModelProvider.servedBy`). No run frame,
// or no models, is exactly one provider, as before.
export type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
export { AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES } from "./kind-roles.ts";
export { automationStudioLlmModelRoleOf } from "./request-role.ts";
export { runWithAutomationStudioLlmModelRole, automationStudioLlmModelRoleFrame } from "./frame.ts";
export { automationStudioLlmProviderRoutedByRole } from "./provider.ts";
export { automationStudioLlmRoleRoutedResolution } from "./resolution.ts";
export { automationStudioLlmRunJudgeModelId } from "./judge-model.ts";
