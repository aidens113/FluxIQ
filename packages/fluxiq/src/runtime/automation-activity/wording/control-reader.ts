import type { AutomationStudioActivityControl } from "../../../framework/automation-service/nodes/index.ts";
import { automationStudioDomainReadings } from "../../domain-readings/index.ts";

/**
 * The control these parameters carry, as the domain this work belongs to reads
 * it (`activityControlReader`, in scope through `../../domain-readings/`).
 * Nothing when they carry none or no domain is in scope: a sentence then names no
 * control and says its verb alone.
 */
export function automationStudioActivityControlOf(parameters: unknown): AutomationStudioActivityControl | undefined {
  return automationStudioDomainReadings()?.activityControlReader?.(parameters);
}
