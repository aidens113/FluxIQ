import type { AutomationStudioFlowScope } from "../../../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";

/**
 * The node registry a build writes and tries its Flow against, and its
 * resolution for the parent Flow's scope (trace plan P5): the native node
 * runtime's, or an empty registry and a resolution granting nothing when no
 * domain bound one. A build (`../../service.ts`) and the trial-ports seam
 * (`./service-ports.ts`) both take theirs from here.
 */
export function automationStudioServiceRegistryResolution(native: AutomationStudioNativeNodeRuntime | undefined, scope: AutomationStudioFlowScope): { registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution } {
  return {
    registry: native?.sdk.nodes ?? new AutomationStudioNodeRegistry(),
    resolution: native?.getRegistryResolution(scope) ?? { scope, runtimeCapabilities: [], permissions: [] }
  };
}
