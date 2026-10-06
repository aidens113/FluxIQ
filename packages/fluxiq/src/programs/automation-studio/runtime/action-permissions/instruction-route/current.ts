// A route reading as it stands for the instructions active now. Named and open
// lapse to `unavailable`/`stale` once the instruction set differs from the one
// they were read from; nothing here reads again.

import type { AutomationStudioInstructionText } from "../instructed.ts";
import type { AutomationStudioInstructionRouteReading } from "./reading.ts";
import { automationStudioInstructionSetDigest } from "./set-digest.ts";

export function currentAutomationStudioInstructionRoute(input: {
  reading: AutomationStudioInstructionRouteReading;
  activeInstructions: readonly AutomationStudioInstructionText[];
}): AutomationStudioInstructionRouteReading {
  const { reading } = input;
  if (reading.state !== "named" && reading.state !== "open") return reading;
  return automationStudioInstructionSetDigest(input.activeInstructions) === reading.instructionSetDigest
    ? reading
    : { state: "unavailable", reason: "stale", instructionSetDigest: reading.instructionSetDigest };
}
