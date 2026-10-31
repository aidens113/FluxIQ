import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";
import { assertAutomationStudioLlmDomainSystemInstructions } from "./validate.ts";
import { assertAutomationStudioFlowScriptExamples } from "../../flow-bootstrap/script-examples/index.ts";
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
  const examples: unknown = examplesField?.value;
  return automationStudioLlmEvidenceRuntimeBindingSnapshot(binding, {
    systemInstructions: binding.systemInstructions === undefined ? undefined : assertAutomationStudioLlmDomainSystemInstructions(binding.systemInstructions, binding.domainId),
    flowScriptExamples: examples === undefined ? undefined : assertAutomationStudioFlowScriptExamples(examples, binding.domainId)
  });
}
