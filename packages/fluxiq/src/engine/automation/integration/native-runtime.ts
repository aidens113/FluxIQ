import type { AutomationStudioNativeNodeRuntime } from "../../../runtime/native-execution/index.ts";
export type AutomationNativeExecutionPort = Pick<AutomationStudioNativeNodeRuntime, "execute" | "resolveActionEffect" | "resolveTargetRefresh" | "getRuntimeCapabilities">;
