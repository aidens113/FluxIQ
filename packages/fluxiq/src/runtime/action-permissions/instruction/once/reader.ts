import type { AutomationStudioInstructionReading } from "../../../../flows/executable/permissions/index.ts";

/** Original caller-owned instruction read, without a model/harness/service dependency. */
export interface ActionInstructionReader {
  read(): Promise<AutomationStudioInstructionReading>;
}
