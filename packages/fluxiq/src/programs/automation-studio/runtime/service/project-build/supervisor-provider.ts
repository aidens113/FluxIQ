import { automationStudioLlmProviderWithDomainInstructions, type AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioProjectSupervisorSystemInstructions } from "../../project-agents/index.ts";

/**
 * The provider the project supervisor's decisions run on (t569): the build's
 * own, wrapped so every request carries the supervisor's system instructions
 * -- its role and the kind of host the build runs on
 * (`project-agents/supervisor/system-instructions.ts`) -- in place of the bound
 * domain's operating text. The domain's decorator, innermost, keeps
 * instructions a request already carries (`llm/domain-instructions/provider.ts`),
 * so Core's rules and task prose are sent exactly as before around them.
 * Builders, resets and judges keep the build's provider, and so the domain's
 * text, unchanged.
 */
export function automationStudioProjectBuildSupervisorProvider(provider: AutomationStudioLlmProvider, domainId: string): AutomationStudioLlmProvider {
  return automationStudioLlmProviderWithDomainInstructions(provider, automationStudioProjectSupervisorSystemInstructions(domainId));
}
