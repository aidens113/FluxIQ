import { assertAutomationStudioFlowScriptGuidance } from "../../../flow-authoring/bootstrap/script-guidance/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";
import { assertAutomationStudioLlmDomainSystemInstructions } from "./validate.ts";
import { assertAutomationStudioFlowScriptExamples } from "../../../flow-authoring/bootstrap/script-examples/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingSnapshot } from "./binding-snapshot.ts";

/**
 * The binding as it will be held, its instructions and example tails checked
 * (`./validate.ts`). Called by the service wherever a runtime is bound -- the
 * constructor option and `bindLlmEvidenceRuntime` -- so a text Core would
 * refuse is refused there, before any build starts.
 */
export function automationStudioLlmEvidenceRuntimeBindingChecked<Binding extends AutomationStudioLlmEvidenceRuntimeBinding | undefined>(binding: Binding): Binding {
  if (!binding) return binding;
  const examplesField = Object.getOwnPropertyDescriptor(binding, "flowScriptExamples");
  if (examplesField && !("value" in examplesField)) throw new Error("Automation Studio flowScriptExamples must be a data field, not a getter or setter.");
  if (!examplesField && "flowScriptExamples" in binding) throw new Error("Automation Studio flowScriptExamples must be an own data field.");
  const guidanceField = Object.getOwnPropertyDescriptor(binding, "flowScriptGuidance");
  if (guidanceField && !("value" in guidanceField)) throw new Error("Automation Studio flowScriptGuidance must be a data field, not a getter or setter.");
  if (!guidanceField && "flowScriptGuidance" in binding) throw new Error("Automation Studio flowScriptGuidance must be an own data field.");
  const guidance: unknown = guidanceField?.value;
  const examples: unknown = examplesField?.value;
  return automationStudioLlmEvidenceRuntimeBindingSnapshot(binding, {
    systemInstructions: binding.systemInstructions === undefined ? undefined : assertAutomationStudioLlmDomainSystemInstructions(binding.systemInstructions, binding.domainId),
    flowScriptGuidance: guidance === undefined ? undefined : assertAutomationStudioFlowScriptGuidance(guidance, binding.domainId),
    flowScriptExamples: examples === undefined ? undefined : assertAutomationStudioFlowScriptExamples(examples, binding.domainId)
  });
}
