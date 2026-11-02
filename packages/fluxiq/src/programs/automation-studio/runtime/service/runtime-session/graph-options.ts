// Studio supplies its legacy target adapter; the engine owns option assembly.
import type { IoRegistry } from "../../../../../io/index.ts";
import type { RuntimeService } from "../../../../../runtime/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-execution/index.ts";
import { createAutomationGraphOptions, type AutomationGraphOptionsInput } from "../../../../../engine/automation/integration/index.ts";
import { createAutomationStudioOutputTargetPreparer } from "../../output-target/index.ts";
type StudioGraphOptionsInput = Omit<AutomationGraphOptionsInput, "targetPreparer" | "io" | "runtimeService" | "nativeNodeRuntime"> & {
  io?: {
    io: IoRegistry;
    domainId: string | null;
  } | undefined;
  runtimeService?: RuntimeService | undefined;
  nativeNodeRuntime?: AutomationStudioNativeNodeRuntime | undefined;
};
export function automationStudioRunGraphOptions(input: StudioGraphOptionsInput) {
  const targetPreparer = input.io ? createAutomationStudioOutputTargetPreparer(input.nativeNodeRuntime?.getElementMatcher(input.io.domainId)) : undefined;
  return createAutomationGraphOptions({ ...input, ...(targetPreparer ? { targetPreparer } : {}) });
}
