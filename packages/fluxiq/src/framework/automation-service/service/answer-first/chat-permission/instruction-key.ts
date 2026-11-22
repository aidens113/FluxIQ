// The key an instruction's needs are kept under in a chat's record (`./store.ts`, t976).

import { createHash } from "node:crypto";

/** The digest an instruction's needs are kept under: the words with case and spacing set aside, never the words. */
export function automationStudioAnswerFirstChatInstruction(instructionText: string): string {
  const folded = (typeof instructionText === "string" ? instructionText : "").normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();
  return `sha256:${createHash("sha256").update(folded).digest("hex")}`;
}
