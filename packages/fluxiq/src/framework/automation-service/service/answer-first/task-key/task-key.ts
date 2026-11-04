// The name of one task (t870, design D10): the same words on the same site. A saved Flow runs
// only for this exact key, so a case difference or another site's origin is another task, and
// whitespace alone is not. A location that is missing or does not parse leaves the origin out
// rather than failing: a task must not stop for a key.

import { createHash } from "node:crypto";

export function automationStudioAnswerFirstTaskKey(input: { instructionText: string; startLocation?: string | undefined }): string {
  const text = (typeof input.instructionText === "string" ? input.instructionText : "").normalize("NFC").replace(/\s+/g, " ").trim();
  const hash = createHash("sha256").update(JSON.stringify([text, originOf(input.startLocation)])).digest("hex").slice(0, 40);
  return `task.${hash}`;
}

function originOf(location: string | undefined): string {
  if (typeof location !== "string" || !URL.canParse(location.trim())) return "";
  const origin = new URL(location.trim()).origin;
  return origin === "null" ? "" : origin.toLowerCase();
}
