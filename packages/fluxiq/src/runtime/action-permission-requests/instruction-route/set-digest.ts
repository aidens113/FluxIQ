// The version of the instructions a route reading was made from: every active
// instruction's id and digest, in no particular order. Editing, adding or
// deactivating any instruction changes it, because any of them can name or
// unname the route.

import { createHash } from "node:crypto";
import { automationStudioInstructionDigest, type AutomationStudioInstructionText } from "../instructed.ts";

export function automationStudioInstructionSetDigest(instructions: readonly AutomationStudioInstructionText[]): string {
  const lines = instructions.map((instruction) => `${instruction.instructionId}\n${automationStudioInstructionDigest(instruction)}`).sort();
  return `sha256:${createHash("sha256").update(lines.join("\n"), "utf8").digest("hex")}`;
}
