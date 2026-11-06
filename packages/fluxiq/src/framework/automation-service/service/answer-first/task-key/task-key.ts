// The name of one task (t870, design D10): the same words on the same site. A saved Flow runs
// only for this key, so another site's origin is another task. Whitespace, case and the
// punctuation a sentence ends with are not (t869): "Save the tables" and "save the tables." are one
// task, and as two keys the second started with an empty act record and did again what the first
// had done. The words are folded for the key only; everywhere else they stay as the person typed
// them. Words that say the task another way are still another task. A location that is missing or
// does not parse leaves the origin out rather than failing: a task must not stop for a key.

import { createHash } from "node:crypto";

/** What a sentence ends with, and nothing that can stand inside one: a closing quote or bracket stays. */
const SENTENCE_END = /[\s.!?,;:…。！？]+$/u;

export function automationStudioAnswerFirstTaskKey(input: { instructionText: string; startLocation?: string | undefined }): string {
  const text = (typeof input.instructionText === "string" ? input.instructionText : "").normalize("NFC").replace(/\s+/g, " ").trim().replace(SENTENCE_END, "").toLowerCase();
  const hash = createHash("sha256").update(JSON.stringify([text, originOf(input.startLocation)])).digest("hex").slice(0, 40);
  return `task.${hash}`;
}

function originOf(location: string | undefined): string {
  if (typeof location !== "string" || !URL.canParse(location.trim())) return "";
  const origin = new URL(location.trim()).origin;
  return origin === "null" ? "" : origin.toLowerCase();
}
