import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";

/** Snapshot metadata while keeping callbacks and accessors on their host receiver. */
export function automationStudioLlmEvidenceRuntimeBindingSnapshot<Binding extends AutomationStudioLlmEvidenceRuntimeBinding>(
  binding: Binding,
  metadata: {
    systemInstructions: AutomationStudioLlmEvidenceRuntimeBinding["systemInstructions"];
    flowScriptExamples: AutomationStudioLlmEvidenceRuntimeBinding["flowScriptExamples"];
  }
): Binding {
  const descriptors = Object.getOwnPropertyDescriptors(binding);
  // Class callbacks may live on a prototype and use private host state. Keep
  // their original receiver, including when Core invokes a checked binding.
  for (let owner: object | null = binding; owner && owner !== Object.prototype; owner = Object.getPrototypeOf(owner)) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "constructor" || key === "systemInstructions" || key === "flowScriptExamples") continue;
      if (owner !== binding && Object.prototype.hasOwnProperty.call(descriptors, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, key)!;
      if ("value" in descriptor && typeof descriptor.value === "function") {
        Object.defineProperty(descriptors, key, { value: { ...descriptor, value: descriptor.value.bind(binding) }, configurable: true, enumerable: true, writable: true });
      } else if (descriptor.get || descriptor.set) {
        Object.defineProperty(descriptors, key, { value: { ...descriptor, ...(descriptor.get ? { get: descriptor.get.bind(binding) } : {}), ...(descriptor.set ? { set: descriptor.set.bind(binding) } : {}) }, configurable: true, enumerable: true, writable: true });
      }
    }
  }
  for (const key of ["systemInstructions", "flowScriptExamples"] as const) {
    Object.defineProperty(descriptors, key, { value: { value: metadata[key], enumerable: true, writable: false, configurable: false }, configurable: true, enumerable: true, writable: true });
  }
  return Object.create(Object.getPrototypeOf(binding), descriptors) as Binding;
}
