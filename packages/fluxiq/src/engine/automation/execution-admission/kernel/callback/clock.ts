import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { NativeClock } from "../../../../../framework/clock/native/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../../runtime/environment/index.ts";
import { markAutomationCallbackFrameUnknownSync } from "./unknown-sync.ts";

/** Live wrappers keep their identity while their native delegates can change. */
export function assertAutomationClockCallback(options: AutomationStudioGraphExecutionOptions, callback: unknown): void {
  const operation = callback === automationStudioLiveRunEnvironment.now ? "now" : callback === automationStudioLiveRunEnvironment.random ? "random" : undefined;
  if (!operation || NativeClock.available(operation)) return;
  markAutomationCallbackFrameUnknownSync(options);
  throw new Error("native_clock.identity_unavailable");
}
