import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowScope } from "../../../model/index.ts";
import type { AutomationStudioResolvedActionEffect } from "../../../nodes/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmRerunScope } from "../rerun-provenance/index.ts";

/** Host-only ports. Neither callback nor its object identities enter provider JSON. */
export type AutomationStudioLlmPriorNodesAuthority = Readonly<{
  currentScope(): Omit<AutomationStudioLlmRerunScope, "loop"> | undefined;
  resolve(definitionId: string, parameters: JsonObject, effectiveInputs: JsonObject): Readonly<{
    definitionId: string;
    definitionVersion: string;
    effect: AutomationStudioResolvedActionEffect;
  }> | undefined;
}>;

/** Uses the real execution registry, including policy output composition, on every read. */
export function automationStudioLlmPriorNodesRuntimeAuthority(input: {
  runtime(): AutomationStudioNativeNodeRuntime | undefined;
  binding(): object | undefined;
  generation: object;
  authority: object;
  scope: AutomationStudioFlowScope;
  signal?: AbortSignal;
}): AutomationStudioLlmPriorNodesAuthority {
  let registryStamp: string | undefined;
  let registry: object = {};
  let previousRuntime: AutomationStudioNativeNodeRuntime | undefined;
  return {
    currentScope() {
      const runtime = input.runtime(), binding = input.binding();
      if (!runtime || !binding || input.signal?.aborted) return undefined;
      // Registry APIs return copies; content plus runtime identity detects replacement,
      // including re-registration at the same advertised definition version.
      const resolution = runtime.getRegistryResolution(input.scope);
      const stamp = automationStudioLlmEvidenceCanonicalJson({ definitions: runtime.sdk.nodes.list(resolution) as unknown as JsonObject[], outputs: runtime.listDefinitions() as unknown as JsonObject[], resolution: resolution as unknown as JsonObject });
      if (runtime !== previousRuntime || stamp !== registryStamp) {
        registry = {};
        registryStamp = stamp;
        previousRuntime = runtime;
      }
      return { binding, generation: input.generation, registry, authority: input.authority };
    },
    resolve(definitionId, parameters, effectiveInputs) {
      const runtime = input.runtime();
      if (!runtime || !input.binding() || input.signal?.aborted) return undefined;
      // Native action-effect declarations consume resolved parameters only. A port-input
      // dependency requires a richer trusted resolver; never infer it from the payload.
      if (Object.keys(effectiveInputs).length !== 0) return undefined;
      const definition = runtime.sdk.nodes.get(definitionId, runtime.getRegistryResolution(input.scope));
      if (!definition?.capabilities.executable) return undefined;
      const effect = runtime.resolveActionEffect({ id: "prior-call", definitionId: definition.id, definitionVersion: definition.version, parameterValues: parameters }, parameters);
      return effect ? { definitionId: definition.id, definitionVersion: definition.version, effect } : undefined;
    }
  };
}
