import type { AutomationStudioInstructionText } from "../../../flows/executable/permissions/index.ts";
import { createHash } from "node:crypto";

/** The digest an instructed entry is bound to: the instruction's title and body, as a person wrote them. */
export function automationStudioInstructionDigest(instruction: Pick<AutomationStudioInstructionText, "title" | "body">): string {
  return `sha256:${createHash("sha256").update(`${instruction.title}\n${instruction.body}`, "utf8").digest("hex")}`;
}
