import type { AutomationStudioInstructionText } from "../../../../flows/executable/permissions/index.ts";
import { automationStudioInstructionDigest } from "../digest.ts";
import { createHash } from "node:crypto";

export function automationStudioInstructionSetDigest(instructions: readonly AutomationStudioInstructionText[]): string {
  const lines = instructions.map((instruction) => `${instruction.instructionId}\n${automationStudioInstructionDigest(instruction)}`).sort();
  return `sha256:${createHash("sha256").update(lines.join("\n"), "utf8").digest("hex")}`;
}
