import type { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";
import type { NativeRuntimeSummary } from "./contract.ts";

export function summarizeNativeRuntime(runtime: Pick<AutomationStudioNativeNodeRuntime, "listDefinitions" | "listRecordingMappers"> | undefined, domainId?: string | null): NativeRuntimeSummary {
  return {
    bound: Boolean(runtime),
    definitionCount: runtime?.listDefinitions().length ?? 0,
    recordingMapperCount: runtime && domainId ? runtime.listRecordingMappers(domainId).length : 0
  };
}
