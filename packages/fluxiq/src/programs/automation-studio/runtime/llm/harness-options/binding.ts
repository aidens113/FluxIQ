// The bridge from the one mutable slot to the registry.
//
// Until now a host bound a single `llmEvidenceRuntime` object: a bare list of
// tools, an executor, and two optional callbacks, with no domain id, no merge
// and no gate. The whole object was handed to the loop unfiltered, so the last
// bind won and Core could not say whose tools those were.
//
// The slot keeps working. It gains one required field -- the domain it belongs
// to -- and is adapted here into an ordinary domain bundle, so a host that
// changes nothing else keeps its three tools and gains the gate, and Core's
// own options appear beside them as soon as a host port is bound.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioLlmFailureEvidenceCaptureInput, AutomationStudioRuntimeTargetOverrideTarget } from "../harness.ts";
import type { AutomationStudioHarnessOptionHost } from "./host.ts";
import type { AutomationStudioHarnessOption, AutomationStudioHarnessOptionBundle, AutomationStudioHarnessOptionImplementation } from "./option.ts";
import { AutomationStudioHarnessOptionRegistry } from "./registry.ts";

/**
 * What a host binds to give the loop its domain's actions.
 *
 * `domainId` is the field the slot never had, and everything the registry does
 * about scoping follows from it.
 */
export type AutomationStudioLlmEvidenceRuntimeBinding = {
  domainId: string;
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool(input: {
    projectId: string;
    flowId: string;
    callId: string;
    toolId: string;
    value: JsonObject;
    maxEvidenceBytes: number;
    signal?: AbortSignal;
  }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  captureSanitizedFailureEvidence?(input: AutomationStudioLlmFailureEvidenceCaptureInput): Promise<JsonObject | undefined>;
  validateTargetOverrideEvidence?(
    evidence: JsonObject,
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ): AutomationStudioRuntimeTargetOverrideEvidenceValidation;
};

/**
 * The registry for one host: Core's own options for whatever host port is
 * bound, extended by the bound domain's own. Either half may be absent, which
 * is how a host that binds nothing behaves exactly as it did before.
 */
export function automationStudioHarnessOptionRegistry(input: {
  // Explicitly `| undefined` so a caller can pass its own optional field
  // straight through under exactOptionalPropertyTypes.
  host?: AutomationStudioHarnessOptionHost | undefined;
  binding?: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
}): AutomationStudioHarnessOptionRegistry {
  const registry = new AutomationStudioHarnessOptionRegistry(input.host ? { host: input.host } : {});
  if (input.binding?.tools.length) registry.register(automationStudioHarnessOptionBundleFromBinding(input.binding));
  return registry;
}

/** One domain's bound tools as a bundle the registry can hold. */
export function automationStudioHarnessOptionBundleFromBinding(binding: AutomationStudioLlmEvidenceRuntimeBinding): AutomationStudioHarnessOptionBundle {
  const implementations: Record<string, AutomationStudioHarnessOptionImplementation> = {};
  const options = binding.tools.map((tool) => {
    implementations[tool.toolId] = executionFor(binding, tool.toolId);
    return scopedOption(tool, binding.domainId);
  });
  return { schemaVersion: "0.1", domainId: binding.domainId, options, implementations };
}

function scopedOption(tool: AutomationStudioLlmEvidenceTool, domainId: string): AutomationStudioHarnessOption {
  return {
    toolId: tool.toolId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.effect !== undefined ? { effect: tool.effect } : {}),
    ...(tool.repeatPolicy !== undefined ? { repeatPolicy: tool.repeatPolicy } : {}),
    ...(tool.initialObservation !== undefined ? { initialObservation: tool.initialObservation } : {}),
    availability: { kind: "domain", domainId },
    // The slot never declared a side effect, so it is read off what the loop
    // already tracks. A domain that wants a narrower or wider declaration says
    // so by registering a bundle of its own instead of using the slot.
    safety: { sideEffect: tool.effect === "mutate" ? "mutate" : "observe" }
  };
}

function executionFor(binding: AutomationStudioLlmEvidenceRuntimeBinding, toolId: string): AutomationStudioHarnessOptionImplementation {
  return (input) => binding.executeTool({
    projectId: input.projectId,
    flowId: input.flowId,
    callId: input.callId,
    toolId,
    value: input.value,
    maxEvidenceBytes: input.maxEvidenceBytes,
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  });
}
