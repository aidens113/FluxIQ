import type { AutomationStudioInstructionRouteUnavailableReason, AutomationStudioInstructionRouteReading } from "../../../../flows/executable/permissions/index.ts";

export function unavailable(reason: AutomationStudioInstructionRouteUnavailableReason): AutomationStudioInstructionRouteReading {
  return { state: "unavailable", reason };
}
