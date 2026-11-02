import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";
import { AutomationStudioLlmBindingOrigins } from "../binding-origin/index.ts";

/** Snapshot metadata while keeping callbacks and accessors on their host receiver. */
export function automationStudioLlmEvidenceRuntimeBindingSnapshot<Binding extends AutomationStudioLlmEvidenceRuntimeBinding>(
  binding: Binding,
  metadata: {
    systemInstructions: AutomationStudioLlmEvidenceRuntimeBinding["systemInstructions"];
    flowScriptGuidance: AutomationStudioLlmEvidenceRuntimeBinding["flowScriptGuidance"];
    flowScriptExamples: AutomationStudioLlmEvidenceRuntimeBinding["flowScriptExamples"];
  }
): Binding {
  const descriptors = Object.getOwnPropertyDescriptors(binding);
  const originalFields: Array<{ field: PropertyKey; forwarded: object; callback: object }> = [];
  // Class callbacks may live on a prototype and use private host state. Keep
  // their original receiver, including when Core invokes a checked binding.
  for (let owner: object | null = binding; owner && owner !== Object.prototype; owner = Object.getPrototypeOf(owner)) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "constructor" || key === "systemInstructions" || key === "flowScriptExamples" || key === "flowScriptGuidance") continue;
      if (owner !== binding && Object.prototype.hasOwnProperty.call(descriptors, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, key)!;
      const original = descriptor.value;
      if ("value" in descriptor && typeof original === "function") {
        const bind = original.bind;
        const forwarded = bind.call(original, binding);
        Object.defineProperty(descriptors, key, { value: { ...descriptor, value: forwarded }, configurable: true, enumerable: true, writable: true });
        if (bind === Function.prototype.bind && typeof forwarded === "function") originalFields.push({ field: key, forwarded, callback: original });
      } else if (descriptor.get || descriptor.set) {
        Object.defineProperty(descriptors, key, { value: { ...descriptor, ...(descriptor.get ? { get: descriptor.get.bind(binding) } : {}), ...(descriptor.set ? { set: descriptor.set.bind(binding) } : {}) }, configurable: true, enumerable: true, writable: true });
      }
    }
  }
  for (const key of ["systemInstructions", "flowScriptExamples", "flowScriptGuidance"] as const) {
    Object.defineProperty(descriptors, key, { value: { value: metadata[key], enumerable: true, writable: false, configurable: false }, configurable: true, enumerable: true, writable: true });
  }
  const snapshot = Object.create(Object.getPrototypeOf(binding), descriptors) as Binding;
  for (const field of originalFields) AutomationStudioLlmBindingOrigins.remember(snapshot, field.field, field.forwarded, binding, field.callback);
  return snapshot;
}
