import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { AutomationAdmissionDriver } from "../../internal/index.ts";
import { markAutomationCallbackFrameUnknownSync } from "./unknown-sync.ts";

/** Fence an unsupported option read under this exact already-entered engine frame. */
export async function markAutomationCallbackFrameUnknown(options: AutomationStudioGraphExecutionOptions): Promise<void> {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return;
  const driver = AutomationObservationBindings.read(observation).source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  markAutomationCallbackFrameUnknownSync(options);
  await driver.flush();
}
