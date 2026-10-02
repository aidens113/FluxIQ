import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";
import { assertAutomationStudioLlmDomainSystemInstructions } from "./validate.ts";

/**
 * The binding as it will be held, its system instructions checked
 * (`./validate.ts`). Called by the service wherever a runtime is bound -- the
 * constructor option and `bindLlmEvidenceRuntime` -- so a text Core would
 * refuse is refused there, before any build starts.
 */
export function automationStudioLlmEvidenceRuntimeBindingChecked<Binding extends AutomationStudioLlmEvidenceRuntimeBinding | undefined>(binding: Binding): Binding {
  if (binding?.systemInstructions === undefined) return binding;
  return { ...binding, systemInstructions: assertAutomationStudioLlmDomainSystemInstructions(binding.systemInstructions, binding.domainId) };
}
