// Automation keeps one starting model across roles. Role labels and historical ladder exports
// remain available for accounting, record compatibility and continuation identity.
export type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
export { AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES } from "./kind-roles.ts";
export { automationStudioLlmModelRoleOf } from "./request-role.ts";
export { runWithAutomationStudioLlmModelRole, automationStudioLlmModelRoleFrame } from "./frame.ts";
export { automationStudioLlmProviderRoutedByRole } from "./provider.ts";
export { automationStudioLlmRoleRoutedResolution } from "./resolution.ts";
export { automationStudioLlmRunJudgeModelId } from "./judge-model.ts";
export * from "./ladder/index.ts";
