// A bound domain's own system instructions: what they are, the bound Core
// holds them to, the check run when the runtime is bound, and the provider
// decorator that puts them on every request made for that domain's work. The
// adapter places them in its system message (`../deepseek/system-prompt.ts`).
export type { AutomationStudioLlmDomainSystemInstructions } from "./system-instructions.ts";
export type { AutomationStudioLlmTaskDomainInstructions } from "./task-domain-instructions.ts";
export { AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH } from "./max-length.ts";
export { assertAutomationStudioLlmDomainSystemInstructions } from "./validate.ts";
export { automationStudioLlmEvidenceRuntimeBindingChecked } from "./binding-check.ts";
export { automationStudioLlmProviderWithDomainInstructions } from "./provider.ts";
export { automationStudioLlmResolverWithDomainInstructions } from "./resolver.ts";
